"use client";

import { useState } from "react";

export type MeetingAiResult = {
  transcript: string;
  minutes: string;
  summary: string;
  agendas: Array<{
    title: string;
    decideTarget: string;
    note: string;
    decision: string;
    continueThinking: string;
    tasks: Array<{ text: string; owner: string; due: string }>;
  }>;
};

export function MeetingAiWorkspace({ context, onApply }: {
  context: { title: string; participants: string; agendaTitles: string[] };
  onApply: (result: MeetingAiResult) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<MeetingAiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function analyze() {
    if (transcript.trim().length < 20 || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/meeting-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, context }),
      });
      const data = await response.json() as MeetingAiResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "議事録を整理できませんでした。");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "議事録を整理できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function copy(name: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(name);
    setTimeout(() => setCopied(""), 1500);
  }

  async function apply() {
    if (!result || applying) return;
    setApplying(true);
    await onApply(result);
    setApplying(false);
  }

  return (
    <section className={`meeting-ai ${open ? "open" : ""}`}>
      <button className="meeting-ai-toggle" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>✦</span><span><strong>AI議事録</strong><small>文字起こしから要約・決定事項・ToDoを整理</small></span><b>{open ? "−" : "＋"}</b>
      </button>
      {open ? <div className="meeting-ai-body">
        <div className="ai-input-panel">
          <div><p className="eyebrow">AI MEETING NOTES</p><h3>文字起こしを整理</h3><p>音声アプリなどで作成した文字起こしを貼り付けてください。録音ファイルの直接解析は認証移行後に追加します。</p></div>
          <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="会議の文字起こしを貼り付け" />
          <div className="ai-input-actions"><span>{transcript.length.toLocaleString()}文字</span><button className="primary-button" disabled={busy || transcript.trim().length < 20} onClick={() => void analyze()}>{busy ? "整理中…" : "✦ AIで整理する"}</button></div>
          {error ? <p className="ai-error">{error}</p> : null}
        </div>
        {result ? <div className="ai-result-panel">
          <div className="ai-result-heading"><div><p className="eyebrow">AI DRAFT</p><h3>反映前の確認</h3></div><button className="primary-button" disabled={applying} onClick={() => void apply()}>{applying ? "反映中…" : "アジェンダに反映"}</button></div>
          <AiDocument title="詳しい議事録" text={result.minutes} copied={copied === "minutes"} onCopy={() => void copy("minutes", result.minutes)} />
          <AiDocument title="会議の要約" text={result.summary} copied={copied === "summary"} onCopy={() => void copy("summary", result.summary)} />
          <div className="ai-agenda-preview"><h4>抽出した議題・決定事項</h4>{result.agendas.map((agenda, index) => <article key={`${agenda.title}-${index}`}><strong>{agenda.title || `議題 ${index + 1}`}</strong>{agenda.decision ? <p><span>決定</span>{agenda.decision}</p> : null}{agenda.continueThinking ? <p><span>継続</span>{agenda.continueThinking}</p> : null}{agenda.tasks.map((task, taskIndex) => <p key={`${task.text}-${taskIndex}`}><span>ToDo</span>{task.text}{task.owner ? ` / ${task.owner}` : ""}{task.due ? ` / ${task.due}` : ""}</p>)}</article>)}</div>
        </div> : null}
      </div> : null}
    </section>
  );
}

function AiDocument({ title, text, copied, onCopy }: { title: string; text: string; copied: boolean; onCopy: () => void }) {
  return <section className="ai-document"><div><h4>{title}</h4><button onClick={onCopy}>{copied ? "✓ コピー済み" : "コピー"}</button></div><p>{text || "内容はありません"}</p></section>;
}
