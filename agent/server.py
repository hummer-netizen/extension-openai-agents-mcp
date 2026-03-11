"""
Webfuse + OpenAI Agent Server

Runs a demo agent that controls a live browser session via Webfuse MCP.
Keys stay server-side. The extension just sends a session ID.

Usage:
    pip install fastapi uvicorn httpx
    OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn server:app --port 8080
"""

import os
import json
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Webfuse Agent Demo")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["*"])

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
WEBFUSE_REST_KEY = os.environ["WEBFUSE_REST_KEY"]
MCP_URL = "https://session-mcp.webfu.se/mcp"

JOURNEY = [
    {
        "icon": "👀",
        "label": "Scanning current page",
        "prompt": 'Take a DOM snapshot with options {{"root": "h1", "quality": 1}}. What page are we on?',
    },
    {
        "icon": "🧭",
        "label": "Navigating to Wikipedia",
        "prompt": "Navigate to https://en.wikipedia.org/wiki/Amsterdam",
    },
    {
        "icon": "📊",
        "label": "Reading population & area",
        "prompt": 'Take a DOM snapshot with options {{"root": ".infobox", "quality": 1}}. Find the population and area of Amsterdam.',
    },
    {
        "icon": "🔍",
        "label": "Clicking a landmark link",
        "prompt": 'Use act_click to click a[href="/wiki/Rijksmuseum"]. If that fails, navigate to https://en.wikipedia.org/wiki/Rijksmuseum.',
    },
    {
        "icon": "🏛️",
        "label": "Reading about the Rijksmuseum",
        "prompt": 'Take a DOM snapshot with options {{"root": ".infobox", "quality": 1}}. When was it established and how many visitors per year?',
    },
]


def make_system_prompt(session_id: str) -> str:
    return (
        f'You are a web automation agent. Use session_id "{session_id}" in every tool call.\n\n'
        "RULES:\n"
        '- Always use "root" CSS selector in snapshot options to target small sections\n'
        "- Never snapshot a full page without a root selector\n"
        "- One or two sentence answers only."
    )


async def call_openai(session_id: str, prompt: str) -> dict:
    """Single stateless call to OpenAI Responses API with Webfuse MCP."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": "gpt-4o",
                "instructions": make_system_prompt(session_id),
                "tools": [
                    {
                        "type": "mcp",
                        "server_label": "webfuse",
                        "server_url": MCP_URL,
                        "require_approval": "never",
                        "headers": {"Authorization": f"Bearer {WEBFUSE_REST_KEY}"},
                    }
                ],
                "input": f"session_id: {session_id}. {prompt}",
            },
        )
        resp.raise_for_status()
        return resp.json()


def extract_result(data: dict) -> tuple[str, str]:
    """Extract tools used and text response from OpenAI output."""
    tools = " → ".join(
        o["name"] for o in (data.get("output") or []) if o.get("type") == "mcp_call"
    )
    msg = next((o for o in (data.get("output") or []) if o.get("type") == "message"), None)
    text = ""
    if msg:
        text = next(
            (c["text"] for c in (msg.get("content") or []) if c.get("type") == "output_text"),
            "",
        )
    return tools, text


class RunRequest(BaseModel):
    session_id: str


@app.post("/run")
async def run_demo(req: RunRequest):
    """Run the demo journey, streaming each step as an SSE event."""

    async def stream():
        yield f"data: {json.dumps({'type': 'start', 'session_id': req.session_id, 'steps': len(JOURNEY)})}\n\n"

        for i, step in enumerate(JOURNEY):
            yield f"data: {json.dumps({'type': 'step_start', 'index': i, 'icon': step['icon'], 'label': step['label']})}\n\n"

            try:
                result = await call_openai(req.session_id, step["prompt"])
                tools, text = extract_result(result)
                yield f"data: {json.dumps({'type': 'step_done', 'index': i, 'tools': tools, 'text': text})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'step_error', 'index': i, 'error': str(e)[:200]})}\n\n"
                break

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}
