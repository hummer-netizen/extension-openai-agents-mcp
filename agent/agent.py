"""
Webfuse + OpenAI Agent Demo

AI agent that controls a live browser session via Webfuse MCP.
Keys stay server-side. The extension just sends a session ID.

    pip install fastapi uvicorn httpx
    OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
"""

import os
import json
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["*"])

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
WEBFUSE_KEY = os.environ["WEBFUSE_REST_KEY"]
MCP_URL = "https://session-mcp.webfu.se/mcp"

JOURNEY = [
    {
        "icon": "👀",
        "label": "Scanning current page",
        "prompt": 'Take a DOM snapshot with options {"root": "h1", "quality": 1}. What page are we on?',
    },
    {
        "icon": "🧭",
        "label": "Navigating to Wikipedia",
        "prompt": "Navigate to https://en.wikipedia.org/wiki/Amsterdam",
    },
    {
        "icon": "📊",
        "label": "Reading the infobox",
        "prompt": 'Take a DOM snapshot with options {"root": ".infobox", "quality": 1}. What is the population and area of Amsterdam?',
    },
    {
        "icon": "📜",
        "label": "Scrolling to Architecture",
        "prompt": 'Scroll to the element h3#Architecture using act_scroll.',
    },
    {
        "icon": "🏠",
        "label": "Clicking Begijnhof link",
        "prompt": 'Use act_click to click a[href="/wiki/Begijnhof,_Amsterdam"].',
    },
    {
        "icon": "✍️",
        "label": "Selecting a passage",
        "prompt": 'Use act_textSelect to select the text: "The ancient, restored wooden house (Het Houten Huys, 34 Begijnhof) is famous as one of the two wooden houses still existing in the center of Amsterdam"',
    },
    {
        "icon": "📖",
        "label": "Reading the selection",
        "prompt": "Use see_textSelection to read what text is currently selected on the page.",
    },
]

SYSTEM = (
    'You are a web automation agent. Use session_id "{sid}" in every tool call.\n'
    "RULES:\n"
    '- Always use "root" CSS selector in snapshot options to target small sections\n'
    "- Never snapshot a full page without a root selector\n"
    "- One or two sentence answers only."
)


async def call_openai(session_id: str, prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {OPENAI_KEY}"},
            json={
                "model": "gpt-4o",
                "instructions": SYSTEM.format(sid=session_id),
                "tools": [{
                    "type": "mcp",
                    "server_label": "webfuse",
                    "server_url": MCP_URL,
                    "require_approval": "never",
                    "headers": {"Authorization": f"Bearer {WEBFUSE_KEY}"},
                }],
                "input": f"session_id: {session_id}. {prompt}",
            },
        )
        resp.raise_for_status()
        return resp.json()


def extract_result(data: dict) -> tuple[str, str]:
    tools = " → ".join(o["name"] for o in (data.get("output") or []) if o.get("type") == "mcp_call")
    msg = next((o for o in (data.get("output") or []) if o.get("type") == "message"), None)
    text = ""
    if msg:
        text = next((c["text"] for c in (msg.get("content") or []) if c.get("type") == "output_text"), "")
    return tools, text


class RunRequest(BaseModel):
    session_id: str


@app.post("/run")
async def run(req: RunRequest):
    async def stream():
        yield f"data: {json.dumps({'type': 'start', 'steps': len(JOURNEY)})}\n\n"

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
