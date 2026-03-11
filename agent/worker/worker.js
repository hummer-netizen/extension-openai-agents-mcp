// Cloudflare Worker — proxies requests to the agent server.
// Set ORIGIN_URL as a Workers environment variable via wrangler secret or dashboard.

export default {
  async fetch(request, env) {
    const origin = env.ORIGIN_URL;
    if (!origin) {
      return new Response('{"error":"ORIGIN_URL not configured"}', {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const target = origin + url.pathname + url.search;

    try {
      const init = { method: request.method, headers: {} };
      if (request.headers.get("Content-Type")) {
        init.headers["Content-Type"] = request.headers.get("Content-Type");
      }
      if (request.method === "POST") {
        init.body = await request.text();
      }

      const resp = await fetch(target, init);

      return new Response(resp.body, {
        status: resp.status,
        headers: {
          "Content-Type": resp.headers.get("Content-Type") || "application/json",
          "Cache-Control": "no-cache",
          ...cors,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
  },
};
