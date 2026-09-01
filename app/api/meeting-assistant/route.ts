import { generateText, Output } from "ai";
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
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ error: "AI接続がまだ設定されていません。" }, { status: 503 });
  }

  const body = await request.json() as { transcript?: unknown; context?: unknown };
  const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 70000) : "";
  if (transcript.length < 20) return Response.json({ error: "文字起こしを20文字以上入力してください。" }, { status: 400 });
  const context = JSON.stringify(body.context ?? {}).slice(0, 12000);

  try {
    const result = await generateText({
      model: "google/gemini-3.7-flash",
      maxOutputTokens: 5000,
      output: Output.object({ schema: minutesSchema }),
      system: "あなたは日本語の会議議事録を整理する専門アシスタントです。発言にない事実を補わず、曖昧な担当者・期限は空文字にしてください。議題、決定事項、継続検討、ToDoを実務で使える粒度に分けてください。summaryは会議全体の要点を簡潔にまとめてください。",
      prompt: `会議情報:\n${context}\n\n文字起こし:\n${transcript}`,
    });
    return Response.json(result.output);
  } catch (error) {
    console.error("meeting assistant failed", error);
    return Response.json({ error: "議事録を整理できませんでした。入力を短く分けてお試しください。" }, { status: 500 });
  }
}
