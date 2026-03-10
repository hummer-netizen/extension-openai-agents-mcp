# Webfuse Extension: OpenAI Agents SDK + MCP

## What This Is

A Webfuse extension that connects any OpenAI Agents SDK agent to a live web session via MCP. The agent can see, click, type, navigate, and extract data from any website running through the Webfuse proxy.

The user just opens a Webfuse Space URL. The extension surfaces a chat widget. The OpenAI agent gets full page access through MCP tools.

## Why OpenAI Agents SDK

- Biggest developer community building agents right now
- Native MCP support (HostedMCPTool for cloud, MCPServerStreamableHttp for local)
- Python SDK is clean and well-documented
- No one has built a "OpenAI Agents + real browser" integration yet
- SEO: "openai agents sdk mcp browser" is a high-value search

## Architecture

```
User opens webfu.se/+yourspace/ on any website
    ↓
Webfuse Extension loads:
    ├── popup.js → Chat widget (text input, streamed responses)
    ├── background.js → Positions popup, manages state
    └── content.js → (minimal, MCP handles page interaction)
    ↓
OpenAI Agent (Python, running externally) connects via MCP:
    Agent → MCPServerStreamableHttp → Webfuse Session MCP Server
    ↓
Webfuse MCP Server provides tools:
    - snapshot (get page DOM)
    - click (click element by wf-id or selector)
    - type (fill input)  
    - navigate (go to URL)
    - get_text (extract text)
    - submit_form (submit a form)
```

## Components

### 1. Webfuse Extension (deploys to Space)
- `manifest.json` - Extension config with env vars
- `background.js` - Popup positioning + auto-open
- `popup.html/js` - Chat UI that talks to the Python agent backend
- `content.js` - Minimal (MCP handles page tools)

### 2. Python Agent Backend
- `agent.py` - OpenAI Agents SDK agent with Webfuse MCP server
- `requirements.txt` - openai-agents, httpx
- Uses MCPServerStreamableHttp to connect to Webfuse Session MCP
- Exposes a simple HTTP endpoint for the extension to call

### 3. Blog Post
- Title: "Give Your OpenAI Agent Real Browser Superpowers with Webfuse"
- Angle: You've built an agent with the OpenAI Agents SDK. It can think, plan, call APIs. But it can't actually use a website. Webfuse fixes that in 10 minutes.
- Target: developers building with openai-agents-python who need web interaction

## Key Differentiator vs ElevenLabs Version

ElevenLabs = voice agent (widget embeds in page, agent talks to user)
OpenAI Agents SDK = text agent (Python backend, chat UI, more flexible)

The OpenAI version shows the programmatic/developer angle. The ElevenLabs version shows the voice/end-user angle. Together they demonstrate Webfuse works with any agent platform.

## MVP Scope

1. Extension: popup chat widget, connects to Python backend
2. Python agent: simple MCPServerStreamableHttp setup with Webfuse Session MCP
3. README with setup steps
4. Blog post draft

## File Structure

```
extension-openai-agents-mcp/
├── README.md
├── SYSTEM_PROMPT.md
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── content.js
├── agent/
│   ├── agent.py
│   ├── requirements.txt
│   └── .env.example
└── blog/
    └── draft.md
```
