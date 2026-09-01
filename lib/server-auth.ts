import { createClient, type User } from "@supabase/supabase-js";

export async function getRequestUser(request: Request): Promise<User | null> {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wlftsodmwfdhixwlsojo.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_rgjg1TjQkY7NuQmGrpOSqQ_Pjs4-zJY";
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.getUser(accessToken);
  return error ? null : data.user;
}
