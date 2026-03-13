"""
Webfuse + OpenAI Agent Demo

AI agent that controls a live browser session via Webfuse MCP.
Keys stay server-side. The extension just sends a session ID.

    pip install fastapi uvicorn httpx
    OPENAI_API_KEY=sk-... WEBFUSE_REST_KEY=rk_... uvicorn agent:app --port 8080
"""

import os
import json
import asyncio
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Webfuse OpenAI Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
WEBFUSE_KEY = os.environ["WEBFUSE_REST_KEY"]
MCP_URL = "https://session-mcp.webfu.se/mcp"
MAX_RETRIES = 2

JOURNEY = [
    {
        "icon": "\U0001f440",
        "label": "Scanning current page",
        "prompt": 'Take a DOM snapshot with options {"root": "h1", "quality": 1}. What page are we on? Mention the city name.',
    },
    {
        "icon": "\U0001f4ca",
        "label": "Reading the infobox",
        "prompt": 'Take a DOM snapshot with options {"root": ".infobox", "quality": 1}. What is the population of Amsterdam?',
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
        "prompt": 'Use act_textSelect with target "body", text "The ancient, restored wooden house (Het Houten Huys, 34 Begijnhof) is famous as one of the two wooden houses still existing in the center of Amsterdam", and options {"scrollIntoView": false}.',
    },
    {
        "icon": "\U0001f4d6",
        "label": "Reading the selection",
        "prompt": "Use see_textSelection to read what text is currently selected on the page.",
    },
    {
        "icon": "\U0001f5bc",
        "label": "Opening the Wooden House image",
        "prompt": 'Use act_click with target \'a[href="/wiki/File:RM371_Amsterdam_-_Begijnhof_34.jpg"]\' and options {"scrollIntoView": false, "moveMouse": true}.',
    },
]

SYSTEM = (
    'You are a browsing assistant. Use session_id "{sid}" in every tool call.\n'
    "RULES:\n"
    '- Always use "root" CSS selector in snapshot options to target small sections\n'
    "- Start with quality 0.1 overview (body) to understand the page\n"
    "- Be concise: 1-3 sentences max\n"
    "- On Hacker News: story IDs in vote links (vote?id=XXXXX), comments at item?id=XXXXX\n"
    "- To write a comment: navigate to item page, type in textarea, do NOT submit\n"
    "- To open a story: click the title link\n"
    "- Always read the page before answering\n"
)


# ── OpenAI API call with retry ──────────────────────────────────────────

async def call_openai(session_id: str, prompt: str) -> dict:
    """Call OpenAI Responses API with Webfuse MCP tools. Retries on transient failures."""
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(MAX_RETRIES + 1):
            try:
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
            except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise


def extract_result(data: dict) -> tuple[str, str]:
    """Pull tool chain and final text from OpenAI response."""
    tools = " \u2192 ".join(
        o["name"] for o in (data.get("output") or [])
        if o.get("type") == "mcp_call"
    )
    msg = next(
        (o for o in (data.get("output") or []) if o.get("type") == "message"),
        None,
    )
    text = ""
    if msg:
        text = next(
            (c["text"] for c in (msg.get("content") or []) if c.get("type") == "output_text"),
            "",
        )
    return tools, text


# ── Guided demo endpoint ────────────────────────────────────────────────

class RunRequest(BaseModel):
    session_id: str


@app.post("/run")
async def run(req: RunRequest):
    """Run the guided Wikipedia Amsterdam demo."""

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


# ── Free-form chat endpoint ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str


@app.post("/chat")
async def chat(req: ChatRequest):
    """Free-form chat: send any message, agent uses MCP tools to interact with the page."""

    async def stream():
        try:
            result = await call_openai(req.session_id, req.message)
            tools, text = extract_result(result)

            if tools:
                payload = json.dumps({"type": "tools", "content": tools})
                yield f"data: {payload}\n\n"
            if text:
                payload = json.dumps({"type": "text", "content": text})
                yield f"data: {payload}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except httpx.HTTPStatusError as e:
            body = e.response.text[:300] if e.response else str(e)
            payload = json.dumps({"type": "error", "content": f"API error ({e.response.status_code}): {body}"})
            yield f"data: {payload}\n\n"
        except httpx.TimeoutException:
            payload = json.dumps({"type": "error", "content": "Request timed out. Try a more specific request."})
            yield f"data: {payload}\n\n"
        except Exception as e:
            payload = json.dumps({"type": "error", "content": str(e)[:300]})
            yield f"data: {payload}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── Health check ─────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}
