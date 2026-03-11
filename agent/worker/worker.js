const ORIGIN = "https://repository-lime-william-schema.trycloudflare.com";

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const target = ORIGIN + url.pathname + url.search;

    try {
      const init = { method: request.method, headers: {} };
      if (request.headers.get("Content-Type")) {
        init.headers["Content-Type"] = request.headers.get("Content-Type");
      }
      if (request.method === "POST") {
        init.body = await request.text();
      }

      const resp = await fetch(target, init);

      // Stream the response through — don't buffer
      return new Response(resp.body, {
        status: resp.status,
        headers: {
          "Content-Type": resp.headers.get("Content-Type") || "text/event-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
