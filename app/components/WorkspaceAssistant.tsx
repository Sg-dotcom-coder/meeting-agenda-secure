"use client";

import { FormEvent, useState } from "react";

type AssistantMessage = { role: "user" | "assistant"; text: string; hasMore?: boolean };

export function WorkspaceAssistant({ context }: { context: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestAnswer(input: string, previousAnswer = "") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, previousAnswer, context }),
      });
      const data = await response.json() as { text?: string; hasMore?: boolean; error?: string };
      if (!response.ok || !data.text) throw new Error(data.error || "回答を生成できませんでした。");
      setMessages((current) => [...current, { role: "assistant", text: data.text!, hasMore: data.hasMore }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回答を生成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = question.trim();
    if (!input || busy) return;
    setMessages((current) => [...current, { role: "user", text: input }]);
    setQuestion("");
    await requestAnswer(input);
  }

  async function continueAnswer() {
    const lastQuestion = [...messages].reverse().find((message) => message.role === "user")?.text ?? "続きを説明してください";
    const previous = messages.filter((message) => message.role === "assistant").map((message) => message.text).join("\n");
    setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, hasMore: false } : message));
    await requestAnswer(lastQuestion, previous);
  }

  return <div className={`workspace-assistant ${open ? "open" : ""}`}>
    {open ? <section className="assistant-panel" aria-label="ワークスペースアシスタント"><header><div><p className="eyebrow">WORKSPACE ASSISTANT</p><h2>業務アシスタント</h2></div><button aria-label="閉じる" onClick={() => setOpen(false)}>×</button></header><div className="assistant-messages">{messages.length === 0 ? <div className="assistant-empty"><span>✦</span><strong>この画面の内容から回答します</strong><p>例：「期限が近いタスクを教えて」「今日の会議を要約して」</p></div> : messages.map((message, index) => <div key={index} className={`assistant-message ${message.role}`}><p>{message.text}</p>{message.hasMore ? <button disabled={busy} onClick={() => void continueAnswer()}>続きを生成</button> : null}</div>)}{busy ? <div className="assistant-thinking">整理中…</div> : null}{error ? <p className="ai-error">{error}</p> : null}</div><form onSubmit={submit}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="業務内容について質問" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button disabled={busy || !question.trim()}>送信</button></form></section> : null}
    <button className="assistant-launcher" onClick={() => setOpen((current) => !current)} aria-label="業務アシスタントを開く">✦<span>AI</span></button>
  </div>;
}
