---
title: "Build an AI Agent That Controls a Live Browser (OpenAI + Webfuse MCP)"
description: "Connect the OpenAI Agents SDK to a real browser session with one MCP endpoint. Your agent navigates, clicks, reads, and extracts — no Selenium, no Puppeteer. Full source code."
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
    answer: "No. The browser runs through Webfuse in the user's own browser tab. No Selenium, no Playwright, no headless Chrome. The agent connects via HTTP."
  - question: "Which OpenAI models work?"
    answer: "Any model that supports the Responses API with tool use. gpt-4o works well. gpt-4o-mini is faster and cheaper for simpler tasks."
  - question: "Can I build my own journeys?"
    answer: "Yes. Each step is just a plain English prompt. Change them, add them, remove them. The agent figures out which browser tools to call."
  - question: "What websites does this work on?"
    answer: "Any website loaded through a Webfuse session. The MCP tools work the same everywhere."
---

Your OpenAI agent can reason, plan, and call APIs. But it can't open a website. It can't click a button. It can't read what's on the screen.

One MCP endpoint changes that.

<TldrBox title="TL;DR">

**Connect the OpenAI Responses API to Webfuse's Session MCP Server.** Your agent gets 13 browser tools: navigate, click, type, scroll, read the DOM, take screenshots, select text. Point it at any website and give it a task.

Full source: [github.com/hummer-netizen/extension-openai-agents-mcp](https://github.com/hummer-netizen/extension-openai-agents-mcp)

</TldrBox>

## One Endpoint, Full Browser Control

Here's the entire MCP configuration:

```python
"tools": [{
    "type": "mcp",
    "server_label": "webfuse",
    "server_url": "https://session-mcp.webfu.se/mcp",
    "require_approval": "never",
    "headers": {"Authorization": f"Bearer {rest_key}"},
}],
```

That's it. The OpenAI Responses API discovers all 13 browser tools automatically. You don't define tool schemas. You don't parse tool calls. You don't write browser automation code.

You write prompts.

## Just Tell It What to Do

Want the agent to read a Wikipedia infobox?

```python
"What is the population of Amsterdam? Read the infobox on this page."
```

The agent decides to take a DOM snapshot, finds the infobox, and returns the answer. You didn't tell it which tool to use. You didn't specify CSS selectors. You just asked.

Want it to click a link and explore?

```python
"Find the Architecture section and click through to the Begijnhof article."
```

The agent scrolls down, finds the link, clicks it, and confirms it landed on the right page.

Want it to highlight something interesting?

```python
"Select the passage about the oldest wooden house and read it to me."
```

It finds the text, selects it (you see the highlight in the browser), and reads it back.

Each prompt is a step. String them together and you have a full browsing journey. The agent handles the how.

## The Demo

We built a Webfuse extension that runs a 7-step Wikipedia journey. Click "Start Demo" and watch the agent:

1. Scan the current page
2. Read population data from the infobox
3. Scroll to the Architecture section
4. Click through to the Begijnhof article
5. Scroll to the section about the Wooden House
6. Select and read a passage
7. Open an image

Each step streams to the sidebar in real time. You see exactly what the agent is doing in the browser as it does it.

## Architecture

```
Sidepanel UI               Agent Server (Python)

  sidepanel.js              agent.py (FastAPI)
  "Start Demo"  --POST-->   
                            OpenAI Responses API
  Renders steps  <--SSE--   + Webfuse MCP
  in real time              
                            13 browser tools
  Zero API keys             discovered automatically
  in extension              
```

The extension only knows the session ID. It sends that to the agent server. The server holds both API keys (OpenAI and Webfuse), runs the agent, and streams results back.

Zero secrets in the client. The extension is pure UI.

::ArticleSignupCta
---
heading: "Give your AI agent a browser"
subtitle: "Webfuse connects any AI agent to live web sessions via MCP. No headless browsers, no credential sharing. Try it free."
---
::

## The Server Is 120 Lines

The entire agent server is a single Python file. FastAPI handles the HTTP. The OpenAI Responses API handles the MCP connection and tool calls.

For each step, you send one API request with a prompt. The model figures out which tools to call, calls them through MCP, and returns a result. That's the whole loop.

```python
response = client.responses.create(
    model="gpt-4o",
    input=[{"role": "user", "content": step["prompt"]}],
    tools=[mcp_tool],
    truncation="auto",
)
```

The response includes everything: which tools the model called, what they returned, and the final answer. Stream it to the UI as SSE events and you get a live step-by-step view.

## Running It

**1. Start the agent server:**

```bash
cd agent
pip install fastapi uvicorn httpx
OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
```

**2. Deploy the extension** to your Webfuse Space. Set `AGENT_URL` to your server's URL.

**3. Open your Space** and click "Start Demo."

For production, the repo includes a Cloudflare Worker (`agent/worker/`) that proxies requests and adds CORS headers.

## Why Webfuse, Not Headless Chrome?

Headless browsers run on your server. They need compute, memory, and browser binaries. They don't have the user's cookies, sessions, or login state. Every run starts from scratch.

Webfuse sessions run in the user's real browser. Real auth. Real cookies. Real state. Your agent server is just Python and HTTP. No browser dependencies. Deploy it anywhere.

The MCP tools work on any website loaded through Webfuse. Same tools, any site, any page.

## What's Next

This demo runs a fixed journey, but the pattern works for anything:

- **Chat interface:** Replace the journey with a `/chat` endpoint that takes freeform user messages
- **Multi-site workflows:** Search on one site, compare on another, book on a third
- **Data extraction:** Read tables, forms, and structured content from any page
- **QA testing:** Run test scenarios against live web apps

The browser is just another tool. Connect it via MCP. Write prompts. Let the agent figure it out.

## Source Code

Everything is on GitHub: [hummer-netizen/extension-openai-agents-mcp](https://github.com/hummer-netizen/extension-openai-agents-mcp)

- `demo-extension/` -- Webfuse extension (sidepanel UI)
- `agent/agent.py` -- FastAPI server (120 lines)
- `agent/worker/` -- Cloudflare Worker for production proxying
