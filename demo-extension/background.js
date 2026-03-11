// OpenAI Agent Demo - Background Script
const MCP_URL = 'https://session-mcp.webfu.se/mcp';

async function sendToSidebar(tabId, msg) {
  try { await chrome.tabs.sendMessage(tabId, msg); } catch(e) { console.error('[agent] sidebar send failed:', e); }
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
  console.log('[agent] API response status:', resp.status);
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

async function runDemo(tabId) {
  console.log('[agent] runDemo called for tab:', tabId);

  // Get env vars
  let apiKey, restKey, sessionId;
  try {
    console.log('[agent] typeof browser:', typeof browser);
    console.log('[agent] typeof browser.webfuseSession:', typeof browser !== 'undefined' && typeof browser.webfuseSession);

    if (typeof browser !== 'undefined' && browser.webfuseSession) {
      apiKey = browser.webfuseSession.env.OPENAI_API_KEY;
      restKey = browser.webfuseSession.env.SPACE_REST_KEY;
      console.log('[agent] Got env vars via browser.webfuseSession.env');
      console.log('[agent] apiKey exists:', !!apiKey, 'restKey exists:', !!restKey);

      const info = await browser.webfuseSession.getSessionInfo();
      sessionId = info.sessionId;
      console.log('[agent] sessionId:', sessionId);
    } else {
      console.log('[agent] browser.webfuseSession not available, trying chrome.runtime');
      // Fallback: try getting from manifest
      const manifest = chrome.runtime.getManifest();
      const envVars = manifest.env || [];
      for (const e of envVars) {
        if (e.key === 'OPENAI_API_KEY') apiKey = e.value;
        if (e.key === 'SPACE_REST_KEY') restKey = e.value;
      }
      console.log('[agent] Got env from manifest:', !!apiKey, !!restKey);
      // No session ID available without webfuseSession
      sessionId = 'UNKNOWN';
    }
  } catch(e) {
    console.error('[agent] Error getting config:', e);
    await sendToSidebar(tabId, { type: 'result', text: '❌ Config error: ' + e.message });
    await sendToSidebar(tabId, { type: 'done' });
    return;
  }

  if (!apiKey) {
    await sendToSidebar(tabId, { type: 'result', text: '❌ No OPENAI_API_KEY found.' });
    await sendToSidebar(tabId, { type: 'done' });
    return;
  }

  await sendToSidebar(tabId, { type: 'step', icon: '🔗', label: `Session: ${sessionId}` });

  for (let i = 0; i < JOURNEY.length; i++) {
    const step = JOURNEY[i];
    await sendToSidebar(tabId, { type: 'step', icon: '⏳', label: step.label });

    try {
      const result = await callAgent(apiKey, restKey, sessionId, `session_id: ${sessionId}. ${step.prompt}`);
      const textItem = (result.output || []).find(o => o.type === 'message');
      const text = textItem?.content?.find(c => c.type === 'output_text')?.text;
      const tools = (result.output || []).filter(o => o.type === 'mcp_call').map(o => o.name).join(' → ');

      await sendToSidebar(tabId, { type: 'update', idx: i + 1, icon: '✅', label: step.label, detail: tools, cls: 'done' });
      if (text) await sendToSidebar(tabId, { type: 'result', text });
    } catch (err) {
      console.error('[agent] Step error:', err);
      await sendToSidebar(tabId, { type: 'update', idx: i + 1, icon: '❌', label: step.label, detail: err.message, cls: '' });
      break;
    }
  }

  await sendToSidebar(tabId, { type: 'result', text: '🎉 Demo complete!' });
  await sendToSidebar(tabId, { type: 'done' });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  console.log('[agent] Message received:', msg, 'from tab:', sender.tab?.id);
  if (msg.action === 'start_demo' && sender.tab) {
    runDemo(sender.tab.id);
  }
  return true; // keep channel open for async
});

console.log('[agent] Background script loaded');
