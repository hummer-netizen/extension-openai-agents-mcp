// OpenAI Agent Demo - Background Script
const MCP_URL = 'https://session-mcp.webfu.se/mcp';

async function callAgent(apiKey, restKey, sessionId, prompt) {
  console.log('[agent] Calling OpenAI...');
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
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
  return resp.json();
}

const JOURNEY = [
  { prompt: 'Take a DOM snapshot and describe what page we are on in one sentence.', label: '👀 Scanning the page' },
  { prompt: 'Navigate to https://en.wikipedia.org/wiki/Amsterdam', label: '🧭 Going to Wikipedia: Amsterdam' },
  { prompt: 'Take a DOM snapshot. Find the population of Amsterdam. Return just the number.', label: '📊 Finding population' },
];

// Use a port-based connection so we can send multiple messages back
chrome.runtime.onConnect.addListener((port) => {
  console.log('[agent] Port connected:', port.name);
  if (port.name !== 'agent-demo') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action !== 'start_demo') return;
    console.log('[agent] Starting demo via port');

    let apiKey, restKey, sessionId;
    try {
      apiKey = browser.webfuseSession.env.OPENAI_API_KEY;
      restKey = browser.webfuseSession.env.SPACE_REST_KEY;
      const info = await browser.webfuseSession.getSessionInfo();
      sessionId = info.sessionId;
      console.log('[agent] Session:', sessionId);
    } catch(e) {
      console.error('[agent] Config error:', e);
      port.postMessage({ type: 'result', text: '❌ ' + e.message });
      port.postMessage({ type: 'done' });
      return;
    }

    port.postMessage({ type: 'step', icon: '🔗', label: `Session: ${sessionId.substring(0, 12)}...` });

    for (let i = 0; i < JOURNEY.length; i++) {
      const step = JOURNEY[i];
      port.postMessage({ type: 'step', icon: '⏳', label: step.label });

      try {
        const result = await callAgent(apiKey, restKey, sessionId, `session_id: ${sessionId}. ${step.prompt}`);
        const textItem = (result.output || []).find(o => o.type === 'message');
        const text = textItem?.content?.find(c => c.type === 'output_text')?.text;
        const tools = (result.output || []).filter(o => o.type === 'mcp_call').map(o => o.name).join(' → ');

        port.postMessage({ type: 'update', idx: i + 1, icon: '✅', label: step.label, detail: tools, cls: 'done' });
        if (text) port.postMessage({ type: 'result', text });
      } catch (err) {
        console.error('[agent] Step error:', err);
        port.postMessage({ type: 'update', idx: i + 1, icon: '❌', label: step.label, detail: err.message });
        break;
      }
    }

    port.postMessage({ type: 'result', text: '🎉 Demo complete!' });
    port.postMessage({ type: 'done' });
  });
});

console.log('[agent] Background loaded');
