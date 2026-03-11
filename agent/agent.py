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
        "icon": "\U0001f440",
        "label": "Scanning current page",
        "prompt": 'Take a DOM snapshot with options {"root": "h1", "quality": 1}. What page are we on?',
    },
    {
        "icon": "\U0001f9ed",
        "label": "Navigating to Wikipedia",
        "prompt": "Navigate to https://en.wikipedia.org/wiki/Amsterdam",
    },
    {
        "icon": "\U0001f4ca",
        "label": "Reading the infobox",
        "prompt": 'Take a DOM snapshot with options {"root": ".infobox", "quality": 1}. What is the population of Amsterdam?',
    },
    {
        "icon": "\u270d\ufe0f",
        "label": "Selecting the population",
        "prompt": 'Use act_textSelect with target "body" and text "933,680" to highlight the population number on the page.',
    },
    {
        "icon": "\U0001f4dc",
        "label": "Scrolling to Architecture",
        "prompt": 'Use act_click with target "h3#Architecture" and options {"scrollIntoView": true, "moveMouse": true}.',
    },
    {
        "icon": "\U0001f3e0",
        "label": "Clicking Begijnhof link",
        "prompt": 'Use act_click to click a[href="/wiki/Begijnhof,_Amsterdam"].',
    },
    {
        "icon": "\U0001f53d",
        "label": "Scrolling to The Wooden House",
        "prompt": 'Use act_click with target "h3#The_Wooden_House" and options {"scrollIntoView": true, "moveMouse": true}.',
    },
    {
        "icon": "\u270d\ufe0f",
        "label": "Selecting a passage",
        "prompt": 'Use act_textSelect with target "body" and text "The ancient, restored wooden house (Het Houten Huys, 34 Begijnhof) is famous as one of the two wooden houses still existing in the center of Amsterdam" to highlight it on the page.',
    },
    {
        "icon": "\U0001f4d6",
        "label": "Reading the selection",
        "prompt": "Use see_textSelection to read what text is currently selected on the page.",
    },
]

SYSTEM = (
    'You are a web automation agent. Use session_id "{sid}" in every tool call.\n'
    "RULES:\n"
    '- Always use "root" CSS selector in snapshot options to target small sections\n'
    "- Never snapshot a full page without a root selector\n"
    '- For act_textSelect: the "target" parameter must be a CSS selector like "body", and "text" is the string to select\n'
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
    tools = " \u2192 ".join(o["name"] for o in (data.get("output") or []) if o.get("type") == "mcp_call")
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
