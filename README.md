# Webfuse Extension: OpenAI Agents SDK + MCP

Connect an [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) agent to any website through [Webfuse](https://webfuse.com). Your agent sees the page, clicks buttons, fills forms, and navigates - all via the [Session MCP Server](https://dev.webfu.se/session-mcp-server/).

```
┌─────────────────────────────────────────────────┐
│  User's browser                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  webfu.se/+yourspace/                     │  │
│  │  ┌─────────────────┐  ┌───────────────┐  │  │
│  │  │   Any website    │  │  Chat widget  │  │  │
│  │  │   (proxied)      │  │  (extension)  │  │  │
│  │  └─────────────────┘  └───────┬───────┘  │  │
│  └───────────────────────────────┼───────────┘  │
└──────────────────────────────────┼──────────────┘
                                   │ HTTP
                          ┌────────▼────────┐
                          │  Python backend  │
                          │  (agent.py)      │
                          │  OpenAI Agent    │
                          └────────┬────────┘
                                   │ MCP (StreamableHTTP)
                          ┌────────▼────────┐
                          │  Webfuse Session │
                          │  MCP Server      │
                          │  session-mcp.    │
                          │  HOSTNAME/mcp    │
                          └─────────────────┘
```

## How It Works

1. User opens your Webfuse Space URL (e.g., `webfu.se/+myspace/`)
2. The extension loads a chat widget in the corner
3. User types a request ("Find hotels in Amsterdam under 150 euros")
4. The widget sends the request to your Python backend
5. The backend runs an OpenAI agent that connects to the Webfuse Session MCP Server
6. The agent uses MCP tools to see the page (`see_domSnapshot`), click elements (`act_click`), type text (`act_type`), and navigate (`navigate`)
7. Results stream back to the chat widget

## Prerequisites

- A [Webfuse](https://webfuse.com) account with a Space
- An [OpenAI API key](https://platform.openai.com/api-keys)
- Python 3.10+
- The Automation App installed on your Space (Settings > Apps)

## Setup

### 1. Create a Webfuse Space

1. Go to [Webfuse Studio](https://webfuse.com/studio/)
2. Create a new Space
3. Go to Settings > API Keys and generate a REST key (`rk_...`)
4. Go to a Session > Apps tab > Install the Automation app
5. Restart the session

### 2. Deploy the Python Agent Backend

```bash
cd agent/
cp .env.example .env
# Edit .env with your OpenAI API key
pip install -r requirements.txt
python agent.py
```

The backend runs on `http://localhost:8000`. For production, deploy behind HTTPS.

### 3. Install the Extension

1. Edit `manifest.json`:
   - Set `AGENT_BACKEND_URL` to your backend URL
   - Set `SPACE_REST_KEY` to your Webfuse REST key
2. Deploy the extension to your Webfuse Space via Studio or API

### 4. Test It

1. Open your Space URL
2. Navigate to any website (e.g., booking.com)
3. Type in the chat widget: "Search for hotels in Amsterdam"
4. Watch the agent work

## Session MCP Server Tools

The agent gets access to these tools via MCP:

| Tool | Description |
|------|-------------|
| `navigate` | Go to a URL |
| `see_domSnapshot` | Read page DOM (use webfuseIDs=true for targeting) |
| `see_accessibilityTree` | Read the accessibility tree |
| `see_guiSnapshot` | Take a screenshot |
| `see_textSelection` | Read currently selected text |
| `act_click` | Click an element |
| `act_type` | Type into an input field |
| `act_keyPress` | Press a keyboard key |
| `act_scroll` | Scroll the page |
| `act_select` | Pick a dropdown option |
| `act_mouseMove` | Hover over an element |
| `act_textSelect` | Select text on the page |
| `wait` | Pause briefly (use sparingly) |

All tools accept a `session_id` and most accept a `target` (CSS selector, Webfuse ID, or `[x,y]` coordinates).

## Limits

| Limit | Value |
|-------|-------|
| Tool call timeout | 15s |
| MCP connection duration | 3 min (reconnect after) |
| Tool call input | 16 KiB |
| Tool call response | 10 MiB |

## Links

- [Webfuse Session MCP Server docs](https://dev.webfu.se/session-mcp-server/)
- [OpenAI Agents SDK MCP docs](https://openai.github.io/openai-agents-python/mcp/)
- [Webfuse Automation API](https://dev.webfu.se/automation-api/)
