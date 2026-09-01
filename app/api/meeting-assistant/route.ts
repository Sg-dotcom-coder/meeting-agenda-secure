import { generateText, Output } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const taskSchema = z.object({ text: z.string(), owner: z.string(), due: z.string() });
const agendaSchema = z.object({
  title: z.string(),
  decideTarget: z.string(),
  note: z.string(),
  decision: z.string(),
  continueThinking: z.string(),
  tasks: z.array(taskSchema),
});
const minutesSchema = z.object({
  transcript: z.string(),
  minutes: z.string(),
  summary: z.string(),
  agendas: z.array(agendaSchema),
});

export async function POST(request: Request) {
  const body = await request.json() as { transcript?: unknown; storagePath?: unknown; audioType?: unknown; context?: unknown };
  const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 70000) : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (transcript.length < 20 && !storagePath) return Response.json({ error: "文字起こしまたは音声を指定してください。" }, { status: 400 });
  const context = JSON.stringify(body.context ?? {}).slice(0, 12000);

  try {
    let messages;
    if (storagePath) {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!token) return Response.json({ error: "音声解析にはGoogle接続が必要です。" }, { status: 401 });
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wlftsodmwfdhixwlsojo.supabase.co";
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_rgjg1TjQkY7NuQmGrpOSqQ_Pjs4-zJY";
      const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data: userData, error: userError } = await client.auth.getUser(token);
      if (userError || !userData.user || !storagePath.startsWith(`${userData.user.id}/`)) return Response.json({ error: "音声へのアクセス権を確認できませんでした。" }, { status: 403 });
      const { data: audio, error: downloadError } = await client.storage.from("meeting-audio-temp").download(storagePath);
      if (downloadError || !audio) throw downloadError ?? new Error("音声を取得できませんでした");
      if (audio.size > 50 * 1024 * 1024) return Response.json({ error: "音声は50MB以下にしてください。" }, { status: 413 });
      messages = [{ role: "user" as const, content: [
        { type: "file" as const, data: new Uint8Array(await audio.arrayBuffer()), mediaType: typeof body.audioType === "string" ? body.audioType : audio.type || "audio/webm" },
        { type: "text" as const, text: `会議情報:\n${context}\n\nこの音声を日本語で文字起こしし、議事録として整理してください。` },
      ] }];
    }
    const result = await generateText({
      model: "google/gemini-3.7-flash",
      maxOutputTokens: 5000,
      output: Output.object({ schema: minutesSchema }),
      system: "あなたは日本語の会議議事録を整理する専門アシスタントです。発言にない事実を補わず、曖昧な担当者・期限は空文字にしてください。議題、決定事項、継続検討、ToDoを実務で使える粒度に分けてください。summaryは会議全体の要点を簡潔にまとめてください。",
      ...(messages ? { messages } : { prompt: `会議情報:\n${context}\n\n文字起こし:\n${transcript}` }),
    });
    return Response.json(result.output);
  } catch (error) {
    console.error("meeting assistant failed", error);
    return Response.json({ error: "議事録を整理できませんでした。入力を短く分けてお試しください。" }, { status: 500 });
  }
}
