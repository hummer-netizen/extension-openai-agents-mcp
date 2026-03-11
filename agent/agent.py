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
import logging
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Logging ─────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("webfuse-agent")

# ── Config ──────────────────────────────────────────────────────────────

MCP_BASE_URL = os.getenv("MCP_BASE_URL", "https://session-mcp.webfu.se/mcp")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Webfuse MCP connections have a 3-minute limit. We reconnect before that.
MCP_TTL_SECONDS = 170  # reconnect after 2m50s (10s safety margin)
MCP_MAX_RETRIES = 3

# Load the system prompt from SYSTEM_PROMPT.md (one level up)
_prompt_path = Path(__file__).resolve().parent.parent / "SYSTEM_PROMPT.md"
SYSTEM_PROMPT = _prompt_path.read_text() if _prompt_path.exists() else (
    "You are a web automation agent. Use the MCP tools to interact with the page."
)


# ── Conversation store (in-memory, per session) ────────────────────────

# Maps session_id -> list of {"role": "user"|"assistant", "content": str}
_conversations: dict[str, list[dict]] = {}
MAX_HISTORY = 20  # keep last N messages per session


def _get_history(session_id: str) -> list[dict]:
    return _conversations.get(session_id, [])


def _append_message(session_id: str, role: str, content: str):
    if session_id not in _conversations:
        _conversations[session_id] = []
    _conversations[session_id].append({"role": role, "content": content})
    # Trim to max
    if len(_conversations[session_id]) > MAX_HISTORY:
        _conversations[session_id] = _conversations[session_id][-MAX_HISTORY:]


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


def _build_input_with_history(session_id: str, message: str) -> str:
    """Build agent input including conversation history for context."""
    history = _get_history(session_id)
    if not history:
        return message

    context_lines = []
    for msg in history:
        prefix = "User" if msg["role"] == "user" else "Agent"
        # Truncate long messages in history
        content = msg["content"][:500] + "..." if len(msg["content"]) > 500 else msg["content"]
        context_lines.append(f"{prefix}: {content}")

    context = "\n".join(context_lines)
    return f"Previous conversation:\n{context}\n\nCurrent request: {message}"


async def _stream_response(request: ChatRequest):
    """Run the agent and yield SSE chunks. Handles MCP reconnection."""
    _append_message(request.session_id, "user", request.message)
    agent_input = _build_input_with_history(request.session_id, request.message)

    retries = 0
    full_response = ""

    while retries <= MCP_MAX_RETRIES:
        mcp = _build_mcp_server(request.session_id, request.rest_key)
        connect_time = time.monotonic()

        try:
            async with mcp:
                agent = _build_agent(mcp)
                log.info(
                    "Running agent for session %s (attempt %d)",
                    request.session_id, retries + 1
                )
                result = Runner.run_streamed(agent, input=agent_input)

                async for event in result.stream_events():
                    # Check MCP TTL
                    elapsed = time.monotonic() - connect_time
                    if elapsed > MCP_TTL_SECONDS:
                        log.warning(
                            "MCP TTL reached (%.0fs), will reconnect", elapsed
                        )
                        # Let the context manager close, then retry
                        raise _MCPTimeout()

                    # Text delta from the model
                    if event.type == "raw_response_event":
                        delta = getattr(event.data, "delta", None)
                        if delta and hasattr(delta, "text") and delta.text:
                            full_response += delta.text
                            chunk = json.dumps({
                                "type": "text", "content": delta.text
                            })
                            yield f"data: {chunk}\n\n"

                    # Tool call started
                    elif event.type == "run_item_stream_event":
                        item = event.item
                        raw = getattr(item, "raw_item", None)
                        if raw and getattr(raw, "type", None) == "function_call":
                            name = getattr(raw, "name", "unknown")
                            chunk = json.dumps({
                                "type": "tool_call", "name": name
                            })
                            yield f"data: {chunk}\n\n"

                # Completed without timeout
                final = result.final_output
                if final and not full_response:
                    full_response = str(final)
                    chunk = json.dumps({
                        "type": "done", "content": full_response
                    })
                    yield f"data: {chunk}\n\n"

                # Success -- store response and break
                if full_response:
                    _append_message(
                        request.session_id, "assistant", full_response
                    )
                break

        except _MCPTimeout:
            retries += 1
            log.info("Reconnecting MCP (attempt %d/%d)", retries, MCP_MAX_RETRIES)
            info = json.dumps({
                "type": "status",
                "content": "Reconnecting to session..."
            })
            yield f"data: {info}\n\n"
            # Update input to include partial progress
            if full_response:
                agent_input = (
                    f"Continue from where you left off. "
                    f"Your partial response so far: {full_response[-200:]}\n\n"
                    f"Original request: {request.message}"
                )
            continue

        except Exception as e:
            log.error("Agent error: %s", e, exc_info=True)
            error_chunk = json.dumps({
                "type": "error",
                "content": f"Agent error: {str(e)}"
            })
            yield f"data: {error_chunk}\n\n"
            break

    yield "data: [DONE]\n\n"


class _MCPTimeout(Exception):
    """Raised when MCP connection approaches the 3-minute limit."""
    pass


@app.post("/chat")
async def chat(request: ChatRequest):
    """Stream agent responses as server-sent events."""
    if not request.session_id or not request.rest_key:
        raise HTTPException(400, "session_id and rest_key are required")

    return StreamingResponse(
        _stream_response(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/chat/{session_id}/clear")
async def clear_history(session_id: str):
    """Clear conversation history for a session."""
    _conversations.pop(session_id, None)
    return {"status": "cleared"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
