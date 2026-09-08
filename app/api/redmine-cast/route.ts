import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonLdNode = { "@type"?: string; name?: string; alternateName?: string; "@graph"?: JsonLdNode[] };

function normalizeText(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function findPerson(value: JsonLdNode) {
  if (value["@type"] === "Person") return value;
  return value["@graph"]?.find((node) => node["@type"] === "Person");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") return NextResponse.json({ error: "URLを入力してください。" }, { status: 400 });
    const url = new URL(body.url.trim());
    const allowedHost = url.hostname === "star-guys.jp" || url.hostname === "www.star-guys.jp";
    if (url.protocol !== "https:" || !allowedHost || !/\/staff\/[^/]+\.html$/i.test(url.pathname)) {
      return NextResponse.json({ error: "Star-GuysのキャストページURLを入力してください。" }, { status: 400 });
    }
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MeetingAgenda/1.0)" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Star-Guys returned ${response.status}`);
    const html = await response.text();
    const people = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap((match) => {
      try {
        const person = findPerson(JSON.parse(match[1]) as JsonLdNode);
        return person ? [person] : [];
      } catch { return []; }
    });
    const person = people[0];
    const title = normalizeText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const segments = title.split(/\s*[┃|｜]\s*/).map(normalizeText).filter(Boolean);
    const name = normalizeText(person?.name ?? segments[0]?.replace(/\s*ホスト紹介.*$/, "") ?? "");
    const kana = normalizeText(person?.alternateName ?? "");
    const store = normalizeText((segments[1] ?? "").replace(/\s*[（(][^）)]*[）)]\s*/g, " "));
    const area = normalizeText((segments[2] ?? "").replace(/ホストクラブ.*$/, ""));
    if (!name) return NextResponse.json({ error: "キャスト情報を取得できませんでした。" }, { status: 422 });
    return NextResponse.json({ name, kana, area, store });
  } catch (error) {
    console.error("redmine cast fetch failed", error);
    return NextResponse.json({ error: "URLから情報を取得できませんでした。URLをご確認ください。" }, { status: 502 });
  }
}
