---
title: "Build an AI Agent That Controls a Live Browser (OpenAI + Webfuse MCP)"
description: "Wire the OpenAI Responses API to a real browser session via Webfuse MCP. Your agent navigates, clicks, reads, and extracts data from any website. Full source code included."
shortTitle: "OpenAI Agent + Webfuse MCP"
created: 2026-03-11
category: ai-agents
authorId: nicholas-piel
tags: ["openai", "responses-api", "mcp", "browser-automation", "webfuse"]
featurePriority: 0
relatedLinks:
  - text: "ChatGPT as Browser Agent"
    href: "/blog/turn-chatgpt-into-a-browser-agent-with-webfuse"
    description: "Zero-code alternative: connect ChatGPT directly to Webfuse MCP."
  - text: "Session MCP Server Docs"
    href: "https://dev.webfu.se/session-mcp-server/"
    description: "Full reference for Webfuse's browser MCP tools."
  - text: "GitHub Repository"
    href: "https://github.com/hummer-netizen/extension-openai-agents-mcp"
    description: "Full source code for the demo."
faqs:
  - question: "Does this require a headless browser?"
    answer: "No. The browser runs through Webfuse's proxy in the user's own browser tab. No Selenium, no Playwright, no headless Chrome. The agent connects via HTTP."
  - question: "Which OpenAI models work?"
    answer: "Any model that supports the Responses API with tool use. gpt-4o works well. gpt-4o-mini is faster and cheaper for simpler tasks."
  - question: "What about the 3-minute MCP connection limit?"
    answer: "Each step in the demo is an independent API call. No persistent MCP connection needed. The Responses API handles the MCP connection per request."
  - question: "Can I modify the journey?"
    answer: "Yes. The journey steps are defined in a Python list. Change the prompts, add steps, or remove them. The agent figures out the tool calls."
---

Your OpenAI agent can reason and call APIs. But open a website? Click a button? Read a table? Not without a browser.

This tutorial gives your agent a browser. A real one. Running in a real session. Not a headless instance on some server.

<TldrBox title="TL;DR">

**OpenAI Responses API + Webfuse MCP = an agent that controls a live browser.**

The agent connects to a Webfuse session via MCP. It gets tools to navigate, snapshot the DOM, click elements, type text, scroll, and select. Each step is one API call. No persistent connections. No browser dependencies.

Full source: [github.com/hummer-netizen/extension-openai-agents-mcp](https://github.com/hummer-netizen/extension-openai-agents-mcp)

</TldrBox>

## What You Get

A Webfuse extension with a "Start Demo" button. Click it and watch the agent:

1. Scan the current page (reads the `<h1>`)
2. Read the Wikipedia Amsterdam infobox (population, area)
3. Scroll to the Architecture section
4. Click through to the Begijnhof article
5. Select and read a passage about Amsterdam's oldest wooden house
6. Open an image of Het Houten Huys

Each step streams to the UI in real time. You see the agent's tool calls and results as they happen.

## Architecture

```
Extension (popup)          Agent Server (Python)
                           
  popup.html               agent.py (FastAPI)
  popup.js    ---POST--->  
                           OpenAI Responses API
  Renders SSE  <--SSE---   + MCP tool connector
  step by step             
                           Webfuse Session MCP
  No API keys              
  in extension             Keys stay server-side
```

The extension knows one thing: the session ID. It sends that to the agent server. The server holds both keys (OpenAI and Webfuse), runs the agent, and streams results back as server-sent events.

No API keys leave the server. The extension is just a UI.

::ArticleSignupCta
---
heading: "Give your AI agent a browser"
subtitle: "Webfuse connects any AI agent to live web sessions via MCP. No headless browsers, no credential sharing. Try it free."
---
::

## The Agent Server

The server is 120 lines of Python. FastAPI, httpx, and the OpenAI Responses API. No SDK wrapper needed.

The key part: the MCP tool connector.

```python
"tools": [{
    "type": "mcp",
    "server_label": "webfuse",
    "server_url": "https://session-mcp.webfu.se/mcp",
    "require_approval": "never",
    "headers": {"Authorization": f"Bearer {rest_key}"},
}],
```

That's it. One tool definition. The Responses API discovers all 13 MCP tools automatically: DOM snapshots, accessibility trees, screenshots, clicking, typing, scrolling, text selection, navigation.

You don't define tool schemas. You don't parse tool calls. The API handles the MCP protocol end-to-end.

## Defining Steps

Each step is a prompt. The agent figures out which tools to call.

```python
JOURNEY = [
    {
        "icon": "👀",
        "label": "Scanning current page",
        "prompt": "Take a DOM snapshot with options "
                  '{"root": "h1", "quality": 1}. '
                  "What page are we on?",
    },
    {
        "icon": "📊",
        "label": "Reading the infobox",
        "prompt": "Take a DOM snapshot with options "
                  '{"root": ".infobox", "quality": 1}. '
                  "What is the population of Amsterdam?",
    },
    # ... more steps
]
```

Each step is independent. No conversation history accumulates. No context window overflow. The agent gets a fresh prompt, calls the right MCP tools, and returns a result.

This is important. Wikipedia articles are massive. A full-page DOM snapshot would blow past any context limit. By using CSS `root` selectors (`.infobox`, `h1`, `h3#Architecture`), each snapshot returns just the relevant section.

## The Snapshot Trick

The Session MCP Server's `see_domSnapshot` tool accepts an `options` object:

- `root`: CSS selector to scope the snapshot (critical for large pages)
- `quality`: 0 to 1, controls how much detail is included
- `webfuseIDs`: adds stable IDs to elements for precise targeting

For a page overview: `{"root": "h1", "quality": 1}`
For a data table: `{"root": ".infobox", "quality": 1}`
For a broad scan: `{"quality": 0.2}` (low detail, full page)

This keeps every API call small and fast. No wasted tokens on irrelevant page content.

## Streaming to the UI

The server streams SSE events. The extension renders them as a step list:

```json
{"type": "step_start", "index": 0, "icon": "👀", "label": "Scanning current page"}
{"type": "step_done",  "index": 0, "tools": "see_domSnapshot", "text": "We're on the Amsterdam Wikipedia article."}
```

The popup.js is 80 lines. It reads the SSE stream, updates the step list, and shows tool calls as they happen. Users see exactly what the agent is doing.

## Running It

**Agent server:**

```bash
cd agent
pip install fastapi uvicorn httpx
OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
```

**Extension:** Deploy to your Webfuse Space. Set `AGENT_URL` to your server's URL.

**Try it:** Open your Space URL, navigate to Wikipedia's Amsterdam article, click "Start Demo."

For production: deploy the agent server behind HTTPS. The repo includes a Cloudflare Worker (`agent/worker/`) that proxies requests and adds CORS headers.

## Beyond the Demo

This demo runs a fixed journey. But the pattern works for anything:

- **Free-form chat:** Replace the journey list with a `/chat` endpoint that takes user messages
- **Multi-page flows:** Chain steps across different websites (search, compare, book)
- **Data extraction:** Snapshot tables and structured content from any page
- **Testing:** Run QA scenarios against live web apps

The MCP tools work on any website loaded through Webfuse. Same tools, any site.

## Why Not Headless Chrome?

Headless browsers run on YOUR server. They need compute, memory, and browser binaries. They don't have the user's cookies or login state. Every session is a fresh browser.

Webfuse is different. The session runs in the USER's browser. Real auth. Real cookies. Real state. The agent connects via HTTP. No browser dependencies on the server side.

The agent server is just Python + HTTP. Deploy it anywhere.

## Source Code

Everything is on GitHub: [hummer-netizen/extension-openai-agents-mcp](https://github.com/hummer-netizen/extension-openai-agents-mcp)

- `demo-extension/` -- Webfuse extension (popup UI + background positioning)
- `agent/agent.py` -- FastAPI server with the OpenAI Responses API + MCP integration
- `agent/worker/` -- Optional Cloudflare Worker for CORS proxying
