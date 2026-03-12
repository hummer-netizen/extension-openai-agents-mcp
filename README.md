# OpenAI Agent + Webfuse MCP Demo

An AI agent that controls a live browser session. Click "Start Demo" and watch it navigate Wikipedia, extract data from infoboxes, and click links — all through [Webfuse Session MCP](https://dev.webfu.se/session-mcp-server/).

**Try it:** [webfu.se/+openai-agent/](https://webfu.se/+openai-agent/)

## Architecture

```
Extension (sidepanel)      Agent Server (Python)
┌──────────────┐           ┌──────────────────────┐
│ sidepanel.html│──POST────▶│  agent.py            │
│ sidepanel.js  │  /run    │                       │
│               │  /chat   │  ┌─── OpenAI API ───┐ │
│  Renders SSE  │◀──SSE────│  │  gpt-4o           │ │
│  step by step │          │  └───────┬───────────┘ │
└──────────────┘           │          │ MCP         │
                           │  ┌───────▼───────────┐ │
  No API keys              │  │  Webfuse Session   │ │
  in the extension         │  │  MCP Server        │ │
                           │  └───────────────────┘ │
                           └───────────────────────┘
                             API keys stay here
```

The extension sends the session ID to the agent server. The server holds both keys (OpenAI + Webfuse), runs the agent, and streams results back as SSE events.

## API Endpoints

### `POST /run` — Guided Demo

Runs an 8-step Wikipedia Amsterdam journey: scan the page, read the infobox, scroll to sections, click links, select text, and open images. Great for showcasing what Webfuse MCP can do.

**Request:** `{ "session_id": "..." }`
**Response:** SSE stream with `step_start`, `step_done`, `step_error`, and `done` events.

### `POST /chat` — Free-form Chat

Send any message. The agent decides which MCP tools to use.

**Request:** `{ "session_id": "...", "message": "Find hotels in Amsterdam under 150 euros" }`
**Response:** SSE stream with `tools` (which tools were called), `text` (agent's response), and `done` events.

**Error handling:** Retries transient failures (timeouts, HTTP errors) up to 2 times with exponential backoff. Returns structured error events on failure.

### `GET /health`

Returns `{ "status": "ok" }`.

## Files

```
demo-extension/        Webfuse extension (deployed to Space)
  sidepanel.html       UI — step list, start button
  sidepanel.js         SSE client — streams agent results
  background.js        Positions the sidepanel widget
  manifest.json        Extension manifest

agent/                 Python agent server
  agent.py             FastAPI — /run (guided demo) + /chat (free-form)
  .env.example         Environment variables template

agent/worker/          Cloudflare Worker (optional CORS proxy)
  worker.js            Proxies requests to agent server
  wrangler.toml        Deploys to openai-agent.webfuse.it
```

## Run Locally

```bash
cd agent
pip install fastapi uvicorn httpx
OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
```

Then set `AGENT_URL` in the extension env to `http://localhost:8080`.

## How the Guided Demo Works

The agent runs an 8-step journey on Wikipedia's Amsterdam article:

1. **Scan** the current page (DOM snapshot of `<h1>`)
2. **Read** the infobox (population data)
3. **Scroll** to the Architecture section
4. **Click** the Begijnhof link
5. **Scroll** to The Wooden House section
6. **Select** a text passage about the wooden house
7. **Read** the selected text
8. **Open** the Wooden House image

Each step is an independent call to OpenAI's Responses API with Webfuse MCP tools. Snapshots use CSS root selectors (`.infobox`, `h1`) to stay within context limits.

## Session MCP Tools

| Tool | Description |
|------|-------------|
| `navigate` | Go to a URL |
| `see_domSnapshot` | Read page DOM (use `root` selector + `webfuseIDs=true`) |
| `see_accessibilityTree` | Read the accessibility tree |
| `see_guiSnapshot` | Take a screenshot |
| `see_textSelection` | Read currently selected text |
| `act_click` | Click an element |
| `act_type` | Type into a field |
| `act_keyPress` | Press a keyboard key |
| `act_scroll` | Scroll the page |
| `act_select` | Pick a dropdown option |
| `act_mouseMove` | Hover over an element |
| `act_textSelect` | Select text on the page |
| `wait` | Pause briefly (use sparingly) |

All tools require `session_id`. Target elements via Webfuse IDs, CSS selectors, or `[x,y]` coordinates.

## Limits

| Limit | Value |
|-------|-------|
| Tool call timeout | 15s |
| MCP connection | 3 min (auto-reconnects) |
| Agent retry | 2x with exponential backoff |

## Links

- [Webfuse](https://webfuse.com) — AI browser actuation layer
- [Session MCP Server docs](https://dev.webfu.se/session-mcp-server/)
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [Blog post](blog/draft.md)
