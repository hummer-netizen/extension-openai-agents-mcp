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


