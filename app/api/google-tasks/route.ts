import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!accessToken) return Response.json({ error: "Google接続が必要です。" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wlftsodmwfdhixwlsojo.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_rgjg1TjQkY7NuQmGrpOSqQ_Pjs4-zJY";
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return Response.json({ error: "ログイン情報を確認できませんでした。" }, { status: 401 });

  const body = await request.json() as { providerToken?: unknown; title?: unknown; notes?: unknown; due?: unknown };
  const providerToken = typeof body.providerToken === "string" ? body.providerToken : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 1000) : "";
  if (!providerToken || !title) return Response.json({ error: "Googleの再接続が必要です。" }, { status: 400 });
  const due = typeof body.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? `${body.due}T00:00:00.000Z` : undefined;
  const response = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, notes: typeof body.notes === "string" ? body.notes.slice(0, 8000) : "", ...(due ? { due } : {}) }),
  });
  const result = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !result.id) return Response.json({ error: result.error?.message || "Google Tasksへ追加できませんでした。再接続してください。" }, { status: response.status || 500 });
  return Response.json({ id: result.id });
}
