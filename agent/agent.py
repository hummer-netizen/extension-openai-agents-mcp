"""
OpenAI Agents SDK agent with Webfuse MCP integration.

Exposes a FastAPI endpoint that the Webfuse extension calls.
The agent connects to the Webfuse Session MCP server to control the browser.
"""

import os
import json
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

load_dotenv()

# Load system prompt
SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "SYSTEM_PROMPT.md"
SYSTEM_PROMPT = SYSTEM_PROMPT_PATH.read_text() if SYSTEM_PROMPT_PATH.exists() else (
    "You are a web automation agent. You can see and interact with web pages "
    "through MCP tools. Be direct and efficient."
)


def build_mcp_url(session_id: str) -> str:
    """Build the Webfuse Session MCP endpoint URL."""
    return f"https://webfuse.com/mcp/{session_id}/mcp"


def build_mcp_server(session_id: str, rest_key: str) -> MCPServerStreamableHttp:
    """Create an MCP server connection to the Webfuse session."""
    return MCPServerStreamableHttp(
        name="webfuse",
        params={
            "url": build_mcp_url(session_id),
            "headers": {
                "Authorization": f"Bearer {rest_key}",
            },
        },
    )


def build_agent(mcp_server: MCPServerStreamableHttp) -> Agent:
    """Create the OpenAI agent with Webfuse MCP tools."""
    return Agent(
        name="WebAgent",
        instructions=SYSTEM_PROMPT,
        mcp_servers=[mcp_server],
    )


# --- FastAPI app ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="OpenAI Agent + Webfuse MCP", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(request: Request):
    """
    Chat endpoint called by the Webfuse extension popup.

    Expects JSON: { "message": str, "session_id": str, "rest_key": str }
    Returns SSE stream with agent response.
    """
    body = await request.json()
    message = body["message"]
    session_id = body["session_id"]
    rest_key = body["rest_key"]

    async def event_stream():
        mcp_server = build_mcp_server(session_id, rest_key)

        async with mcp_server:
            agent = build_agent(mcp_server)

            result = Runner.run_streamed(agent, input=message)

            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    data = event.data
                    # Handle text deltas
                    if hasattr(data, "delta") and data.delta:
                        payload = json.dumps({"type": "text", "content": data.delta})
                        yield f"data: {payload}\n\n"
                elif event.type == "run_item_stream_event":
                    item = event.item
                    # Handle tool calls
                    if (
                        hasattr(item, "type")
                        and item.type == "tool_call_item"
                        and hasattr(item, "raw_item")
                        and hasattr(item.raw_item, "name")
                    ):
                        payload = json.dumps({
                            "type": "tool_call",
                            "name": item.raw_item.name,
                        })
                        yield f"data: {payload}\n\n"

            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
