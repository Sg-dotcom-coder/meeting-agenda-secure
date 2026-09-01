const UPSTREAM = "https://meeting-agenda-secure-mbt9dyogl-vzst46qzwb-3303s-projects.vercel.app/";

export default async function handler(request, response) {
  const requestUrl = new URL(request.url, "https://meeting-agenda-secure.vercel.app");
  const upstreamUrl = new URL(UPSTREAM);
  upstreamUrl.search = requestUrl.search;

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      accept: request.headers.accept || "text/html",
      "user-agent": request.headers["user-agent"] || "meeting-agenda-overlay"
    }
  });

  let html = await upstreamResponse.text();
  if (!html.includes('/summary-patch.js')) {
    html = html.replace(
      "</head>",
      '<script src="/summary-patch.js" defer></script></head>'
    );
  }

  response.status(upstreamResponse.status);
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.send(html);
}
