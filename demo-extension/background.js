// OpenAI Agent Demo - Background Script
// Calls OpenAI Responses API with Webfuse MCP tools directly

const MCP_URL = 'https://session-mcp.webfu.se/mcp';

// Get env vars (Webfuse extension env)
function getEnv(key) {
  return (typeof __ENV !== 'undefined' && __ENV[key]) || '';
}

// Send step updates to content script
async function sendToSidebar(tabId, msg) {
  try { await chrome.tabs.sendMessage(tabId, msg); } catch(e) {}
}

// Call OpenAI Responses API with MCP
async function callAgent(apiKey, restKey, sessionId, messages) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      instructions: `You are a web automation agent. You control a live browser session via MCP tools.
IMPORTANT: Always use session_id "${sessionId}" in every tool call.
Be concise. After completing a task, summarize what you did in 1-2 sentences.`,
      tools: [{
        type: 'mcp',
        server_label: 'webfuse',
        server_url: MCP_URL,
        require_approval: 'never',
        headers: { 'Authorization': `Bearer ${restKey}` },
      }],
      input: messages,
    }),
  });
  return resp.json();
}

// Extract tool calls and results from API response
function parseOutput(output) {
  const events = [];
  for (const item of output || []) {
    if (item.type === 'mcp_list_tools') {
      events.push({ type: 'tools_loaded', count: item.tools.length });
    } else if (item.type === 'mcp_call') {
      events.push({
        type: 'tool_call',
        name: item.name,
        error: item.error,
        output: item.output ? item.output.substring(0, 200) : null,
      });
    } else if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type === 'output_text') {
          events.push({ type: 'text', content: c.text });
        }
      }
    }
  }
  return events;
}

// Pretty name for tool calls
const TOOL_LABELS = {
  see_domSnapshot: '👀 Reading the page...',
  see_accessibilityTree: '👀 Reading accessibility tree...',
  see_guiSnapshot: '📸 Taking a screenshot...',
  act_click: '👆 Clicking...',
  act_type: '⌨️ Typing...',
  act_keyPress: '⌨️ Pressing key...',
  act_scroll: '📜 Scrolling...',
  act_select: '📋 Selecting option...',
  act_mouseMove: '🖱️ Hovering...',
  navigate: '🧭 Navigating...',
};

// Run the demo journey
async function runDemo(tabId) {
  const apiKey = getEnv('OPENAI_API_KEY');
  const restKey = getEnv('SPACE_REST_KEY');

  if (!apiKey || apiKey === 'sk-proj-placeholder') {
    await sendToSidebar(tabId, { type: 'result', text: '❌ Missing OPENAI_API_KEY. Set it in extension env vars.' });
    await sendToSidebar(tabId, { type: 'done' });
    return;
  }

  // Get session ID from current tab URL
  const tab = await chrome.tabs.get(tabId);
  const urlMatch = tab.url && tab.url.match(/webfu\.se\/([a-zA-Z0-9]+)/);
  const sessionId = urlMatch ? urlMatch[1] : null;

  if (!sessionId) {
    await sendToSidebar(tabId, { type: 'result', text: '❌ No Webfuse session found. Open a page through webfu.se first.' });
    await sendToSidebar(tabId, { type: 'done' });
    return;
  }

  await sendToSidebar(tabId, { type: 'step', icon: '🔗', label: `Session: ${sessionId}` });

  // The journey: multi-step tasks
  const journey = [
    {
      prompt: `Use session_id "${sessionId}". Take a DOM snapshot and describe what page we are on in one sentence.`,
      label: 'Scanning the page',
    },
    {
      prompt: `Use session_id "${sessionId}". Navigate to https://en.wikipedia.org/wiki/Amsterdam`,
      label: 'Navigating to Wikipedia: Amsterdam',
    },
    {
      prompt: `Use session_id "${sessionId}". Take a DOM snapshot. Find the population of Amsterdam and the area in km². Return just those two numbers.`,
      label: 'Finding population & area',
    },
    {
      prompt: `Use session_id "${sessionId}". Take a DOM snapshot. Find the "Twin cities" or "Sister cities" section. List the first 5 twin/sister cities of Amsterdam.`,
      label: 'Finding sister cities',
    },
    {
      prompt: `Use session_id "${sessionId}". Click on the link for the first twin/sister city to navigate to that city's Wikipedia page.`,
      label: 'Following a link',
    },
    {
      prompt: `Use session_id "${sessionId}". Take a DOM snapshot. Describe this new city page in one sentence - what city are we on now?`,
      label: 'Reading the new page',
    },
  ];

  for (let i = 0; i < journey.length; i++) {
    const step = journey[i];
    const stepIdx = i + 1; // offset by 1 for session step

    await sendToSidebar(tabId, {
      type: 'step', icon: '⏳', label: step.label,
    });

    try {
      const result = await callAgent(apiKey, restKey, sessionId, step.prompt);
      const events = parseOutput(result.output);

      // Show tool calls
      let detail = '';
      for (const ev of events) {
        if (ev.type === 'tools_loaded') {
          // First call loads tools, just note it
        } else if (ev.type === 'tool_call') {
          const toolLabel = TOOL_LABELS[ev.name] || `🔧 ${ev.name}`;
          detail += (detail ? ' → ' : '') + ev.name;
        } else if (ev.type === 'text') {
          // Update step as done
          await sendToSidebar(tabId, {
            type: 'update', idx: stepIdx, icon: '✅', label: step.label,
            detail: detail, cls: 'done',
          });
          await sendToSidebar(tabId, { type: 'result', text: ev.content });
        }
      }

      // If no text output, still mark done
      if (!events.some(e => e.type === 'text')) {
        await sendToSidebar(tabId, {
          type: 'update', idx: stepIdx, icon: '✅', label: step.label,
          detail: detail, cls: 'done',
        });
      }

    } catch (err) {
      await sendToSidebar(tabId, {
        type: 'update', idx: stepIdx, icon: '❌', label: step.label,
        detail: err.message, cls: '',
      });
    }
  }

  await sendToSidebar(tabId, {
    type: 'result',
    text: '🎉 Demo complete! The agent navigated Wikipedia, extracted data, and followed links - all through Webfuse MCP.',
  });
  await sendToSidebar(tabId, { type: 'done' });
}

// Listen for start command
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'start_demo' && sender.tab) {
    runDemo(sender.tab.id);
  }
});
