"""
OpenAI Agents SDK + Webfuse Session MCP Server

Connects an OpenAI agent to a live browser session via Webfuse's MCP endpoint.
The agent can navigate, read pages, click, type, and take screenshots.

Usage:
  pip install -r requirements.txt
  export OPENAI_API_KEY=sk-...
  python agent.py

Then POST to http://localhost:8000/chat with:
  { "message": "Open booking.com and search for hotels in Amsterdam",
    "session_id": "sGpUNaFXihCSxCUfb3zezgaCw",
    "rest_key": "rk_YOUR_KEY" }
"""

import os
import json
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────────────────────────

MCP_BASE_URL = os.getenv("MCP_BASE_URL", "https://session-mcp.webfu.se/mcp")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Load the system prompt from SYSTEM_PROMPT.md (one level up)
_prompt_path = Path(__file__).resolve().parent.parent / "SYSTEM_PROMPT.md"
SYSTEM_PROMPT = _prompt_path.read_text() if _prompt_path.exists() else (
    "You are a web automation agent. Use the MCP tools to interact with the page."
)


# ── FastAPI app ─────────────────────────────────────────────────────────

app = FastAPI(title="Webfuse OpenAI Agent Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str
    rest_key: str


def _build_mcp_server(session_id: str, rest_key: str) -> MCPServerStreamableHttp:
    """Create an MCP server connection for the given Webfuse session."""
    return MCPServerStreamableHttp(
        name="webfuse",
        params={
            "url": MCP_BASE_URL,
            "headers": {
                "Authorization": f"Token {rest_key}",
                "x-session-id": session_id,
            },
        },
    )


def _build_agent(mcp_server: MCPServerStreamableHttp) -> Agent:
    """Create an OpenAI Agent wired to the Webfuse MCP server."""
    return Agent(
        name="WebAgent",
        instructions=SYSTEM_PROMPT,
        mcp_servers=[mcp_server],
    )


async def _stream_response(request: ChatRequest):
    """Run the agent and yield SSE chunks."""
    mcp = _build_mcp_server(request.session_id, request.rest_key)

    async with mcp:
        agent = _build_agent(mcp)
        result = Runner.run_streamed(agent, input=request.message)

        async for event in result.stream_events():
            # Text delta from the model
            if event.type == "raw_response_event":
                delta = getattr(event.data, "delta", None)
                if delta and hasattr(delta, "text") and delta.text:
                    chunk = json.dumps({"type": "text", "content": delta.text})
                    yield f"data: {chunk}\n\n"

            # Tool call started
            elif event.type == "run_item_stream_event":
                item = event.item
                if hasattr(item, "raw_item") and hasattr(item.raw_item, "type"):
                    if item.raw_item.type == "function_call":
                        name = getattr(item.raw_item, "name", "unknown")
                        chunk = json.dumps({"type": "tool_call", "name": name})
                        yield f"data: {chunk}\n\n"

        # Final complete output (if the stream missed pieces)
        final = result.final_output
        if final:
            chunk = json.dumps({"type": "done", "content": str(final)})
            yield f"data: {chunk}\n\n"

    yield "data: [DONE]\n\n"


@app.post("/chat")
async def chat(request: ChatRequest):
    """Stream agent responses as server-sent events."""
    return StreamingResponse(
        _stream_response(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
