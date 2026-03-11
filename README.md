# OpenAI Agent + Webfuse MCP Demo

An AI agent that controls a live browser session. Click "Start Demo" and watch it navigate Wikipedia, extract data from infoboxes, and click links — all through [Webfuse Session MCP](https://dev.webfu.se/session-mcp-server/).

**Try it:** [webfu.se/+openai-agent/](https://webfu.se/+openai-agent/)

## Architecture

```
Extension (popup)          Agent Server (Python)
┌──────────────┐           ┌──────────────────────┐
│  popup.html  │──POST────▶│  agent.py           │
│  popup.js    │  /run     │                      │
│              │           │  ┌─── OpenAI API ───┐│
│  Renders SSE │◀──SSE─────│  │  gpt-4o          ││
│  step by step│           │  └───────┬──────────┘│
└──────────────┘           │          │ MCP        │
                           │  ┌───────▼──────────┐│
  No API keys              │  │  Webfuse Session  ││
  in the extension         │  │  MCP Server       ││
                           │  └──────────────────┘│
                           └──────────────────────┘
                             API keys stay here
```

The extension sends the session ID to the agent server. The server holds both keys (OpenAI + Webfuse), runs the agent, and streams results back as SSE events.

## Files

```
demo-extension/     Webfuse extension (deployed to Space)
  popup.html        UI — step list, start button
  popup.js          SSE client — streams agent results
  background.js     Positions the popup widget
  manifest.json     Extension manifest

agent/              Python agent server
  agent.py         FastAPI — runs the journey, calls OpenAI + MCP

agent/worker/       Cloudflare Worker (optional)
  worker.js         Proxies requests to agent server
  wrangler.toml     Deploys to openai-agent.webfuse.it
```

## Run Locally

```bash
cd agent
pip install fastapi uvicorn httpx
OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
```

Then set `AGENT_URL` in the extension env to `http://localhost:8080`.

## How the Demo Works

The agent runs a 5-step journey:

1. **Scan** the current page (DOM snapshot of `<h1>`)
2. **Navigate** to Wikipedia's Amsterdam article
3. **Read** the infobox (population, area)
4. **Click** the Rijksmuseum link
5. **Read** the Rijksmuseum infobox (founded, annual visitors)

Each step is an independent call to OpenAI's Responses API with Webfuse MCP tools. Snapshots use CSS root selectors (`.infobox`, `h1`) to stay within context limits.

## Links

- [Webfuse](https://webfuse.com) — AI browser actuation layer
- [Session MCP Server docs](https://dev.webfu.se/session-mcp-server/)
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
