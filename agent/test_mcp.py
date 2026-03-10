"""Quick test: connect OpenAI Agent to Webfuse Session MCP"""
import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async def main():
    mcp_server = MCPServerStreamableHttp(
        name="webfuse-session",
        params={
            "url": "https://session-mcp.webfu.se/mcp",
            "headers": {
                "Authorization": "Bearer rk_QApEyjVBgtSOVEKOW2H2QPoJjWey4HX2",
            },
        },
    )

    agent = Agent(
        name="Webfuse Test Agent",
        instructions="You are a web automation agent. Use the MCP tools to interact with a Webfuse session. Start by listing what tools you have available, then describe them briefly.",
        mcp_servers=[mcp_server],
    )

    print("Connecting to Webfuse Session MCP...")
    async with mcp_server:
        # List tools
        tools = await mcp_server.list_tools()
        print(f"\n✅ Connected! {len(tools)} tools available:")
        for t in tools:
            print(f"  - {t.name}: {t.description[:60]}...")
        
        print("\n--- Running agent ---")
        result = await Runner.run(
            agent,
            input="List all the MCP tools you have access to and briefly describe what each one does. Do NOT call any tools, just list them from your tool definitions.",
        )
        print(f"\nAgent response:\n{result.final_output}")

asyncio.run(main())
