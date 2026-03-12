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
  - question: "Can the user take over from the agent?"
    answer: "Yes. The agent works in the user's real browser session. At any point, the user can grab the mouse and continue manually. No context is lost."
---

Your OpenAI agent can reason, plan, and call APIs. But it can't open a website. It can't click a button. It can't read what's on the screen.

One MCP endpoint changes that.

<TldrBox title="TL;DR">

**Connect the OpenAI Responses API to Webfuse's Session MCP Server.** Your agent gets 13 browser tools automatically. Point it at any website and give it a task. The user watches it happen in their own browser and can take over at any time.

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

```
"What is the population of Amsterdam? Read the infobox on this page."
```

The agent decides how to get there. It takes a snapshot, finds the data, returns the answer.

Want it to navigate and explore?

```
"Find the Architecture section and click through to the Begijnhof article."
```

It scrolls, finds the link, clicks it, confirms it landed on the right page.

Want it to highlight something?

```
"Select the passage about the oldest wooden house and read it to me."
```

It finds the text, highlights it in the browser, and reads it back.

Each prompt is a step. String them together and you have a full journey. The agent handles the how.

## The Real Opportunity: Agent + Human, Together

Here's what makes this different from headless browser automation.

Traditional browser bots run in the background. On a server. In a virtual browser the user never sees. If something goes wrong, the bot fails silently. If the task needs human judgment, you're stuck.

With Webfuse, the agent works in the user's actual browser session. The user watches it happen. The agent fills out a form, the user sees each field populate. The agent navigates to a page, the user sees the page load.

And at any point, the user can just grab the mouse and take over.

Think about what that enables:

- **Onboarding:** An agent walks a new user through a complex setup flow, filling in defaults and explaining each step. The user corrects anything that looks wrong and hits submit themselves.
- **Research:** An agent gathers data across multiple sites, opens tabs, highlights relevant passages. The user reviews what it found and makes the final call.
- **Support:** A customer service agent pre-fills a return form, navigates to the right page, selects the right options. The customer confirms and submits.
- **Training:** An agent demonstrates a workflow step by step. The user watches, then repeats it on their own.

The agent does the tedious parts. The human stays in control. No handoff. No copy-pasting between systems. They're both working in the same browser, on the same page, at the same time.

This is what "human in the loop" actually looks like when it's done right.

::ArticleSignupCta
---
heading: "Give your AI agent a browser"
subtitle: "Webfuse connects any AI agent to live web sessions via MCP. No headless browsers, no credential sharing. Try it free."
---
::

## The Demo

We built a Webfuse extension that runs a 7-step Wikipedia journey. Click "Start Demo" and watch the agent:

1. Scan the current page
2. Read population data from the infobox
3. Scroll to the Architecture section
4. Click through to the Begijnhof article
5. Scroll to the section about the Wooden House
6. Select and read a passage
7. Open an image

Each step streams to a sidebar in real time. You see the agent working in the browser as it happens.

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

## The Server Is ~200 Lines

The entire agent server is a single Python file with two endpoints. For each step, one API request with a prompt. The model figures out which tools to call, calls them through MCP, and returns a result.

```python
response = client.responses.create(
    model="gpt-4o",
    input=[{"role": "user", "content": step["prompt"]}],
    tools=[mcp_tool],
    truncation="auto",
)
```

Stream the response to the UI as SSE events and you get a live step-by-step view.

## Running It

**1. Start the agent server:**

```bash
cd agent
pip install -r requirements.txt
OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
```

**2. Deploy the extension** to your Webfuse Space. Set `AGENT_URL` to your server's URL.

**3. Open your Space** and click "Start Demo."

The repo includes a Cloudflare Worker (`agent/worker/`) for production deployment with CORS.

## Beyond the Demo

The demo runs a fixed journey. But the pattern works for anything:

- **Chat interface:** Replace the journey with a `/chat` endpoint for freeform conversations
- **Multi-site workflows:** Search, compare, and book across different websites
- **Co-pilot mode:** Agent handles routine steps, pauses for user decisions, continues after
- **Data extraction:** Read tables, forms, and structured content from any page

The browser is just another tool. Connect it via MCP. Write prompts. Let the agent figure it out. Let the user stay in control.

## Source Code

Everything is on GitHub: [hummer-netizen/extension-openai-agents-mcp](https://github.com/hummer-netizen/extension-openai-agents-mcp)

- `demo-extension/` -- Webfuse extension (sidepanel UI)
- `agent/agent.py` -- FastAPI server (~200 lines, guided demo + free-form chat)
- `agent/worker/` -- Cloudflare Worker for production
