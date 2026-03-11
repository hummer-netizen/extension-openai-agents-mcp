// OpenAI Agent Demo - Background Script
// Calls OpenAI Responses API with Webfuse MCP tools directly

const MCP_URL = 'https://session-mcp.webfu.se/mcp';

// Send updates to content script sidebar
async function sendToSidebar(tabId, msg) {
  try { await chrome.tabs.sendMessage(tabId, msg); } catch(e) { console.error('sidebar send failed:', e); }
}

// Call OpenAI Responses API with MCP
async function callAgent(apiKey, restKey, sessionId, prompt) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      instructions: `You are a web automation agent controlling a live browser via MCP tools.\nIMPORTANT: Always use session_id "${sessionId}" in every tool call.\nFor snapshots, put options inside the "options" parameter: {"session_id": "...", "options": {"webfuseIDs": true}}\nBe concise.`,
      tools: [{
        type: 'mcp',
        server_label: 'webfuse',
        server_url: MCP_URL,
        require_approval: 'never',
        headers: { 'Authorization': `Bearer ${restKey}` },
      }],
      input: prompt,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
  return resp.json();
}

// Parse API response into events
function parseOutput(output) {
  const events = [];
  for (const item of output || []) {
    if (item.type === 'mcp_list_tools') events.push({ type: 'tools', count: item.tools.length });
    else if (item.type === 'mcp_call') events.push({ type: 'tool', name: item.name, error: item.error });
    else if (item.type === 'message') {
      for (const c of item.content || [])
        if (c.type === 'output_text') events.push({ type: 'text', content: c.text });
    }
  }
  return events;
}

// The demo journey
const JOURNEY = [
  { prompt: 'Take a DOM snapshot and describe what page we are on in one sentence.', label: '👀 Scanning the page' },
  { prompt: 'Navigate to https://en.wikipedia.org/wiki/Amsterdam', label: '🧭 Going to Wikipedia: Amsterdam' },
  { prompt: 'Take a DOM snapshot. Find the population of Amsterdam and the area in km². Return just those two numbers.', label: '📊 Finding population & area' },
  { prompt: 'Take a DOM snapshot. Find the "Twin cities" or "Sister cities" section. List the first 5 sister cities.', label: '🏙️ Finding sister cities' },
  { prompt: 'Click on the link for the first sister city to navigate to that page.', label: '🔗 Following a link' },
  { prompt: 'Take a DOM snapshot. What city are we on now? Describe it in one sentence.', label: '👀 Reading the new page' },
];

async function runDemo(tabId) {
  // Get env vars and session info via Webfuse API
  let apiKey, restKey, sessionId;
  try {
    apiKey = browser.webfuseSession.env.OPENAI_API_KEY;
    restKey = browser.webfuseSession.env.SPACE_REST_KEY;
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch(e) {
    await sendToSidebar(tabId, { type: 'result', text: '❌ Could not get session info: ' + e.message });
    await sendToSidebar(tabId, { type: 'done' });
    return;
  }

  if (!apiKey) {
    await sendToSidebar(tabId, { type: 'result', text: '❌ Missing OPENAI_API_KEY in extension env.' });
    await sendToSidebar(tabId, { type: 'done' });
    return;
  }

  await sendToSidebar(tabId, { type: 'step', icon: '🔗', label: `Session: ${sessionId.substring(0, 12)}...` });

  for (let i = 0; i < JOURNEY.length; i++) {
    const step = JOURNEY[i];
    const stepIdx = i + 1;

    await sendToSidebar(tabId, { type: 'step', icon: '⏳', label: step.label });

    try {
      const prompt = `Use session_id "${sessionId}". ${step.prompt}`;
      const result = await callAgent(apiKey, restKey, sessionId, prompt);
      const events = parseOutput(result.output);

      const tools = events.filter(e => e.type === 'tool').map(e => e.name).join(' → ');
      const text = events.find(e => e.type === 'text');

      await sendToSidebar(tabId, {
        type: 'update', idx: stepIdx, icon: '✅', label: step.label, detail: tools, cls: 'done'
      });

      if (text) {
        await sendToSidebar(tabId, { type: 'result', text: text.content });
      }
    } catch (err) {
      await sendToSidebar(tabId, {
        type: 'update', idx: stepIdx, icon: '❌', label: step.label, detail: err.message, cls: ''
      });
      break;
    }
  }

  await sendToSidebar(tabId, {
    type: 'result',
    text: '🎉 Demo complete! The agent navigated Wikipedia, extracted data, and followed links — all via Webfuse MCP + OpenAI.',
  });
  await sendToSidebar(tabId, { type: 'done' });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'start_demo' && sender.tab) runDemo(sender.tab.id);
});
