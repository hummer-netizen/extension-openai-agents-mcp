# OpenAI Agent + Webfuse MCP

Connect an OpenAI Agents SDK agent to any website through Webfuse MCP. The agent can see, click, type, navigate, and extract data from live web pages.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  User opens: webfu.se/+yourspace/any-website    │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │   Webfuse Proxy Session     │
        │                             │
        │  ┌───────────────────────┐  │
        │  │  Extension (popup.js) │──┼──── HTTP POST /chat ────┐
        │  │  Chat widget UI       │  │                         │
        │  └───────────────────────┘  │                         │
        └──────────────┬──────────────┘                         │
                       │                                        │
                       │ MCP (Streamable HTTP)                  │
                       │                                        │
        ┌──────────────▼──────────────┐          ┌──────────────▼──────────┐
        │  Webfuse Session MCP Server │◄─────────│  Python Agent Backend   │
        │                             │  MCP     │                         │
        │  Tools:                     │          │  OpenAI Agents SDK      │
        │   - snapshot                │          │  + MCPServerStreamableHttp
        │   - click                   │          │                         │
        │   - type                    │          │  POST /chat endpoint    │
        │   - navigate                │          │  SSE streamed response  │
        │   - get_text                │          └─────────────────────────┘
        │   - submit_form             │
        └─────────────────────────────┘
```

## Quick Start

### 1. Create a Webfuse Space

1. Sign up at [webfuse.com](https://webfuse.com)
2. Create a new Space
3. Note your **Space REST Key** (starts with `rk_`)
4. Note your **Space slug** (e.g., `my-agent-space`)

### 2. Deploy the Extension

1. In your Space settings, go to **Extensions**
2. Upload all extension files:
   - `manifest.json`
   - `background.js`
   - `popup.html`
   - `popup.js`
   - `content.js`
3. Set the environment variables in `manifest.json`:
   - `AGENT_BACKEND_URL`: URL where your Python agent is running (e.g., `https://your-server.com`)
   - `SPACE_REST_KEY`: Your Space REST key

### 3. Set Up the Python Agent Backend

```bash
cd agent/

# Create a virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure your OpenAI API key
cp .env.example .env
# Edit .env and add your OpenAI API key

# Run the server
python agent.py
```

The agent backend runs on `http://localhost:8000` by default.

For production, deploy behind a reverse proxy with HTTPS (nginx, Caddy, etc.) or use a platform like Railway, Render, or Fly.io.

### 4. Test It

1. Open a Webfuse session: `webfu.se/+your-space/https://example.com`
2. The chat widget appears in the bottom-right corner
3. Type a message like "What's on this page?" or "Click the first link"
4. The agent uses MCP tools to interact with the page and responds

## Environment Variables

### Extension (`manifest.json` env)

| Variable | Description |
|---|---|
| `AGENT_BACKEND_URL` | URL of the Python agent backend |
| `SPACE_REST_KEY` | Webfuse Space REST key for MCP auth |

### Agent Backend (`.env`)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key |

## Customization

### System Prompt

Edit `SYSTEM_PROMPT.md` to change the agent's behavior, personality, and capabilities.

### Agent Model

In `agent/agent.py`, pass a `model` parameter to `Agent()`:

```python
agent = Agent(
    name="WebAgent",
    instructions=SYSTEM_PROMPT,
    mcp_servers=[mcp_server],
    model="gpt-4o",
)
```

## How It Works

1. User opens a website through a Webfuse Space URL
2. The extension loads and shows a chat widget (popup)
3. User sends a message via the chat widget
4. The popup sends the message + session ID + REST key to the Python backend
5. The Python backend creates an MCP connection to the Webfuse Session MCP server
6. The OpenAI agent plans and executes actions using MCP tools (snapshot, click, type, etc.)
7. Responses stream back to the chat widget via SSE

## License

MIT
