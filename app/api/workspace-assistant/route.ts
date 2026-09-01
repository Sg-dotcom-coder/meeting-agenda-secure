import { generateText } from "ai";
import { getRequestUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type AssistantRequest = {
  question?: unknown;
  previousAnswer?: unknown;
  context?: unknown;
};

async function answer(prompt: string) {
  return generateText({
    model: "google/gemini-3.7-flash",
    maxOutputTokens: 1400,
    system: "あなたは撮影部の業務アシスタントです。提供されたワークスペース情報だけを根拠に、日本語で簡潔かつ実務的に回答してください。検索は行わず、不明な内容は不明と明示してください。回答は原則1,500文字以内。さらに続きが必要な場合は末尾に必ず [続きあり] と付けてください。",
    prompt,
  });
}

export async function POST(request: Request) {
  if (!await getRequestUser(request)) return Response.json({ error: "AI利用にはGoogle接続が必要です。" }, { status: 401 });

  const body = (await request.json()) as AssistantRequest;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 5000) : "";
  const previousAnswer = typeof body.previousAnswer === "string" ? body.previousAnswer.slice(-6000) : "";
  if (!question) return Response.json({ error: "質問を入力してください。" }, { status: 400 });

  const context = JSON.stringify(body.context ?? {}).slice(0, 45000);
  const prompt = previousAnswer
    ? `質問: ${question}\n\nここまでの回答:\n${previousAnswer}\n\n同じ内容を繰り返さず、続きを回答してください。\n\nワークスペース情報:\n${context}`
    : `質問: ${question}\n\nワークスペース情報:\n${context}`;

  try {
    let result = await answer(prompt);
    // 一時的な空応答だけを1回再試行する。無制限には再送しない。
    if (!result.text.trim()) result = await answer(`${prompt}\n\n空欄にせず回答してください。`);
    const hasMore = result.text.includes("[続きあり]") || result.text.length > 1500;
    const text = result.text.replaceAll("[続きあり]", "").trim().slice(0, 1500);
    return Response.json({ text, hasMore });
  } catch (error) {
    console.error("workspace assistant failed", error);
    return Response.json({ error: "AIの回答を生成できませんでした。時間をおいてお試しください。" }, { status: 500 });
  }
}
