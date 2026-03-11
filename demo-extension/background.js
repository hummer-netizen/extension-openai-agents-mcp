// OpenAI Agent Demo - Background Script
const MCP_URL = 'https://session-mcp.webfu.se/mcp';

// Track the content script tab
let activeTabId = null;

async function sendToSidebar(msg) {
  if (!activeTabId) return;
  try { await chrome.tabs.sendMessage(activeTabId, msg); } catch(e) { console.error('[agent] send failed:', e); }
}

async function callAgent(apiKey, restKey, sessionId, prompt) {
  console.log('[agent] Calling OpenAI API...');
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      instructions: `You are a web automation agent. Always use session_id "${sessionId}" in every tool call. Be concise.`,
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
  console.log('[agent] API status:', resp.status);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

const JOURNEY = [
  { prompt: 'Take a DOM snapshot and describe what page we are on in one sentence.', label: '👀 Scanning the page' },
  { prompt: 'Navigate to https://en.wikipedia.org/wiki/Amsterdam', label: '🧭 Going to Wikipedia: Amsterdam' },
  { prompt: 'Take a DOM snapshot. Find the population of Amsterdam. Return just the number.', label: '📊 Finding population' },
];

async function runDemo() {
  console.log('[agent] runDemo started');

  let apiKey, restKey, sessionId;
  try {
    if (typeof browser !== 'undefined' && browser.webfuseSession) {
      apiKey = browser.webfuseSession.env.OPENAI_API_KEY;
      restKey = browser.webfuseSession.env.SPACE_REST_KEY;
      const info = await browser.webfuseSession.getSessionInfo();
      sessionId = info.sessionId;
      console.log('[agent] Got config. Session:', sessionId);
    } else {
      throw new Error('browser.webfuseSession not available');
    }
  } catch(e) {
    console.error('[agent] Config error:', e);
    await sendToSidebar({ type: 'result', text: '❌ ' + e.message });
    await sendToSidebar({ type: 'done' });
    return;
  }

  await sendToSidebar({ type: 'step', icon: '🔗', label: `Session: ${sessionId.substring(0, 12)}...` });

  for (let i = 0; i < JOURNEY.length; i++) {
    const step = JOURNEY[i];
    await sendToSidebar({ type: 'step', icon: '⏳', label: step.label });

    try {
      const result = await callAgent(apiKey, restKey, sessionId, `session_id: ${sessionId}. ${step.prompt}`);
      const textItem = (result.output || []).find(o => o.type === 'message');
      const text = textItem?.content?.find(c => c.type === 'output_text')?.text;
      const tools = (result.output || []).filter(o => o.type === 'mcp_call').map(o => o.name).join(' → ');

      await sendToSidebar({ type: 'update', idx: i + 1, icon: '✅', label: step.label, detail: tools, cls: 'done' });
      if (text) await sendToSidebar({ type: 'result', text });
    } catch (err) {
      console.error('[agent] Step error:', err);
      await sendToSidebar({ type: 'update', idx: i + 1, icon: '❌', label: step.label, detail: err.message });
      break;
    }
  }

  await sendToSidebar({ type: 'result', text: '🎉 Demo complete!' });
  await sendToSidebar({ type: 'done' });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  console.log('[agent] Message:', msg.action, 'sender.tab:', sender.tab?.id, 'sender.url:', sender.url);
  if (msg.action === 'start_demo') {
    // Get tab ID from sender or query for it
    if (sender.tab) {
      activeTabId = sender.tab.id;
    }
    // If no tab, find the active tab
    if (!activeTabId) {
      chrome.tabs.query({ active: true }, (tabs) => {
        activeTabId = tabs[0]?.id;
        console.log('[agent] Found tab via query:', activeTabId);
        runDemo();
      });
    } else {
      runDemo();
    }
  }
  return true;
});

console.log('[agent] Background script loaded');
