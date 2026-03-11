---
title: "Give Your OpenAI Agent Real Browser Superpowers with Webfuse"
description: "Connect the OpenAI Agents SDK to a live browser session using Webfuse MCP. Your agent can see, click, type, and navigate any website."
shortTitle: "OpenAI Agents + Webfuse MCP"
created: 2026-03-10
category: ai-agents
authorId: nicholas-piel
tags:
  - openai
  - agents-sdk
  - mcp
  - browser-automation
  - webfuse
relatedLinks:
  - title: "OpenAI Agents SDK"
    url: "https://github.com/openai/openai-agents-python"
  - title: "Webfuse MCP Documentation"
    url: "https://dev.webfu.se/session-mcp-server/"
  - title: "GitHub Repository"
    url: "https://github.com/hummer-netizen/extension-openai-agents-mcp"
faqs:
  - question: "Does the agent need a local browser?"
    answer: "No. The browser runs through the Webfuse proxy. Your agent connects via MCP over HTTP. No Selenium, no Playwright, no headless Chrome."
  - question: "Which OpenAI models work with this?"
    answer: "Any model supported by the OpenAI Agents SDK. GPT-4o works great. GPT-4o-mini is faster and cheaper for simple tasks."
  - question: "Can I use this in production?"
    answer: "Yes. Webfuse sessions are isolated and secure. Deploy the Python backend behind HTTPS and you are production-ready."
---

Your OpenAI agent can reason, plan, and call APIs. But it cannot use a website. It cannot fill out a form, click a button, or read what is on screen. That is a huge gap.

Webfuse fixes that in about 10 minutes.

<TldrBox>
Connect the OpenAI Agents SDK to any live website using Webfuse MCP. No Selenium. No headless browser. Just an MCP server that gives your agent tools to see, click, type, and navigate real web pages. This tutorial walks through the full setup: a Webfuse extension with a chat UI, plus a Python agent backend.
</TldrBox>

## The Problem

The OpenAI Agents SDK has native MCP support. That means your agent can connect to any MCP server and use its tools. There are MCP servers for databases, file systems, APIs, and more.

But there was no good option for browsers. Existing solutions require running a local browser instance, dealing with Selenium or Playwright, and managing the complexity of headless Chrome. That is fine for testing. It is not fine for giving your agent real-time access to websites your users are browsing.

## How Webfuse Solves This

Webfuse is a web augmentation platform. It proxies any website and exposes a Session MCP server for each browsing session. The MCP server provides tools like:

- **see_domSnapshot**: Read the page DOM structure (with Webfuse IDs for targeting)
- **see_accessibilityTree**: Read the accessibility tree
- **see_guiSnapshot**: Take a visual screenshot
- **act_click**: Click an element by selector, Webfuse ID, or coordinates
- **act_type**: Type into input fields
- **navigate**: Go to a URL
- **act_keyPress**: Press keyboard keys
- **act_scroll**: Scroll the page

Your agent connects to this MCP server over standard HTTP. No browser binaries. No drivers. No dependencies.

<ArticleSignupCta />

## The Architecture

The setup has two parts:

1. **A Webfuse extension** that shows a chat widget inside the browsing session
2. **A Python backend** that runs the OpenAI agent with Webfuse MCP tools

When a user opens a website through Webfuse, the extension loads automatically. The user types a message. The extension sends it to the Python backend. The backend runs the agent, which uses MCP tools to interact with the page, and streams the response back.

```
User in Webfuse session
    → Extension chat widget
        → Python backend (FastAPI)
            → OpenAI Agents SDK
                → Webfuse Session MCP Server
                    → Live web page
```

## Building It

### Step 1: The Extension

The Webfuse extension is a standard browser extension with a twist: it runs inside the Webfuse proxy session and gets access to session info and environment variables.

The `manifest.json` defines two env vars: `AGENT_BACKEND_URL` (where your Python server runs) and `SPACE_REST_KEY` (for MCP authentication).

The `background.js` positions a floating chat widget in the bottom-right corner:

```js
browser.browserAction.resizePopup(420, 620);
browser.browserAction.setPopupPosition({ bottom: "30px", right: "30px" });
browser.browserAction.detachPopup();
browser.browserAction.openPopup();
```

The `popup.js` grabs the session ID and REST key from the Webfuse API, then sends user messages to the backend via POST:

```js
const env = browser.webfuseSession.env;
const info = await browser.webfuseSession.getSessionInfo();

const response = await fetch(`${env.AGENT_BACKEND_URL}/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: text,
    session_id: info.session_id,
    rest_key: env.SPACE_REST_KEY,
  }),
});
```

Responses stream back as server-sent events. Tool calls show up as action pills in the UI so the user can see what the agent is doing.

### Step 2: The Python Agent

The backend is a FastAPI server that uses the OpenAI Agents SDK. The key part is `MCPServerStreamableHttp`, which connects to the Webfuse Session MCP endpoint:

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

mcp_server = MCPServerStreamableHttp(
    name="webfuse",
    params={
        "url": "https://session-mcp.webfu.se/mcp",
        "headers": {
            "Authorization": f"Token {rest_key}",
            "x-session-id": session_id,
        },
    },
)

agent = Agent(
    name="WebAgent",
    instructions=system_prompt,
    mcp_servers=[mcp_server],
)

result = Runner.run_streamed(agent, input=user_message)
```

That is the entire MCP integration. The OpenAI Agents SDK handles tool discovery, execution, and response formatting. Your agent automatically gets access to all the Webfuse MCP tools without you defining them manually.

### Step 3: Run It

```bash
cd agent/
pip install -r requirements.txt
cp .env.example .env  # Add your OpenAI API key
python agent.py
```

Deploy the extension to your Webfuse Space, set the env vars, and open any website through your Space URL. The chat widget appears. Ask the agent to do something. Watch it work.

## What You Can Build

This pattern opens up a lot of possibilities:

- **Customer support agents** that can actually navigate your web app alongside the user
- **Data extraction pipelines** that work on any website without writing scrapers
- **QA testing agents** that explore and test web applications
- **Personal assistants** that can book flights, fill forms, and manage accounts

The agent sees what the user sees. It interacts with the real page. No simulated environments. No mock data.

## Try It

The full source code is on [GitHub](https://github.com/hummer-netizen/extension-openai-agents-mcp). Clone it, deploy it to a Webfuse Space, and give your OpenAI agent the browser superpowers it has been missing.
