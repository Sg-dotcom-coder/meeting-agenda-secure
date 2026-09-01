"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export function MeetingAiWorkspace({ context, onApply, isConnected, onConnect }: {
  context: { title: string; participants: string; agendaTitles: string[] };
  onApply: (result: MeetingAiResult) => Promise<void>;
  isConnected: boolean;
  onConnect: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<MeetingAiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    stream.current?.getTracks().forEach((track) => track.stop());
  }, [audioUrl]);

  function selectAudio(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      setError("音声は50MB以下にしてください。長い場合は前後半に分けてください。");
      return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setError("");
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("このブラウザでは録音できません。音声ファイルを選択してください。");
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const mediaRecorder = new MediaRecorder(mediaStream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      stream.current = mediaStream;
      recorder.current = mediaRecorder;
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : "webm";
        selectAudio(new File(chunks.current, `meeting-${Date.now()}.${extension}`, { type }));
        mediaStream.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        chunks.current = [];
        setRecording(false);
      };
      mediaRecorder.start(1000);
      setRecording(true);
    } catch {
      setError("マイクを使用できませんでした。ブラウザのマイク許可をご確認ください。");
    }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function analyze() {
    if (transcript.trim().length < 20 || busy) return;
    if (!isConnected) {
      await onConnect();
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError("AI利用にはGoogle接続が必要です。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/meeting-assistant", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionData.session.access_token}`, "Content-Type": "application/json" },
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

  async function analyzeAudio() {
    if (!audioFile || busy) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setError("音声解析にはGoogle接続が必要です。");
      return;
    }
    setBusy(true);
    setError("");
    setUploadProgress(10);
    const extension = audioFile.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webm";
    const storagePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from("meeting-audio-temp").upload(storagePath, audioFile, { cacheControl: "0", contentType: audioFile.type || "audio/webm", upsert: false });
      if (uploadError) throw new Error(`音声をアップロードできませんでした: ${uploadError.message}`);
      setUploadProgress(100);
      const response = await fetch("/api/meeting-assistant", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ storagePath, audioType: audioFile.type, context }) });
      const data = await response.json() as MeetingAiResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "音声を解析できませんでした。");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "音声を解析できませんでした。");
    } finally {
      await supabase.storage.from("meeting-audio-temp").remove([storagePath]);
      setUploadProgress(0);
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
          <div><p className="eyebrow">AI MEETING NOTES</p><h3>音声・文字起こしを整理</h3><p>この場で録音するか、音声ファイルまたは文字起こしを使って議事録を作成できます。</p></div>
          <div className="audio-source-grid">
            <div className="audio-source-card"><span className="audio-icon">●</span><div><strong>この場で録音</strong><p>会議終了後に解析します。</p></div>{recording ? <button className="record-stop-button" onClick={stopRecording}>■ 録音終了</button> : <button onClick={() => void startRecording()}>録音開始</button>}</div>
            <label className="audio-source-card file-source"><span className="audio-icon">↑</span><div><strong>音声ファイル</strong><p>MP3・M4A・WAV・WebM／50MBまで</p></div><span className="file-select-button">選択</span><input type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.mp4" onChange={(event) => { const file = event.target.files?.[0]; if (file) selectAudio(file); event.currentTarget.value = ""; }} /></label>
          </div>
          {recording ? <div className="recording-status"><span /><strong>録音中</strong><small>終了すると音声を確認できます</small></div> : null}
          {audioFile ? <div className="selected-audio"><div><strong>{audioFile.name}</strong><span>{(audioFile.size / 1024 / 1024).toFixed(1)} MB</span></div>{audioUrl ? <audio controls src={audioUrl} /> : null}{isConnected ? <button className="primary-button" disabled={busy} onClick={() => void analyzeAudio()}>{busy ? uploadProgress < 100 ? `送信中 ${uploadProgress}%` : "文字起こし・整理中…" : "✦ 音声を解析する"}</button> : <button className="primary-button" onClick={() => void onConnect()}>Google接続して解析</button>}</div> : null}
          <div className="ai-input-divider"><span>または文字起こしを貼り付け</span></div>
          <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="会議の文字起こしを貼り付け" />
          <div className="ai-input-actions"><span>{transcript.length.toLocaleString()}文字</span><button className="primary-button" disabled={busy || transcript.trim().length < 20} onClick={() => void analyze()}>{busy ? "整理中…" : isConnected ? "✦ AIで整理する" : "Google接続して整理"}</button></div>
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
