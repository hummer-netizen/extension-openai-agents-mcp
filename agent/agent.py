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
    "mcp_hostname": "session20.webfu.se",
    "rest_key": "rk_YOUR_KEY" }
"""

import os
import json
import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


SYSTEM_PROMPT = """You are a web automation agent connected to a live browser session via Webfuse.

You can see and interact with the real page the user is browsing. You have tools to:
- Take DOM or accessibility snapshots to understand the page
- Click elements, type text, press keys
- Navigate to URLs
- Take screenshots

Rules:
1. Always start with see_domSnapshot to understand the current page
2. Use wf-id targeting when available (set webfuseIDs=true in snapshots)
3. After each action, take another snapshot to verify the result
4. Be efficient. Act, verify, move on.
5. When done, summarize what you accomplished in one sentence.

Target elements using: CSS selectors, Webfuse IDs (wf-id), or [x,y] coordinates.
Prefer wf-id > CSS selector > coordinates for reliability."""


class ChatRequest(BaseModel):
    message: str
    session_id: str
    mcp_hostname: str
    rest_key: str


app = FastAPI(title="Webfuse OpenAI Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(req: ChatRequest):
    """Run the agent with a user message against a live Webfuse session."""

    mcp_url = f"https://session-mcp.{req.mcp_hostname}/mcp"

    # Connect to Webfuse Session MCP Server
    mcp_server = MCPServerStreamableHttp(
        name="webfuse-session",
        params={
            "url": mcp_url,
            "headers": {
                "Authorization": f"Bearer {req.rest_key}",
            },
        },
    )

    agent = Agent(
        name="Webfuse Browser Agent",
        instructions=SYSTEM_PROMPT,
        mcp_servers=[mcp_server],
    )

    async def stream_response():
        try:
            async with mcp_server:
                result = await Runner.run(
                    agent,
                    input=f"Session ID: {req.session_id}\n\nUser request: {req.message}",
                )

                # Stream the final output
                for item in result.new_items:
                    if hasattr(item, 'text') and item.text:
                        yield f"data: {json.dumps({'type': 'text', 'content': item.text})}\n\n"
                    elif hasattr(item, 'name'):
                        # Tool call
                        yield f"data: {json.dumps({'type': 'tool', 'name': item.name, 'args': str(getattr(item, 'arguments', ''))[:200]})}\n\n"

                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
