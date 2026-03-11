const MCP_URL = 'https://session-mcp.webfu.se/mcp';
const stepsEl = document.getElementById('steps');
const btn = document.getElementById('btn');
const stepEls = [];

function addStep(icon, label, detail) {
  const el = document.createElement('div');
  el.className = 'step';
  el.innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>${detail ? `<div class="detail">${detail}</div>` : ''}`;
  stepsEl.appendChild(el);
  stepEls.push(el);
  stepsEl.scrollTop = stepsEl.scrollHeight;
}

function updateStep(idx, icon, label, detail, cls) {
  if (!stepEls[idx]) return;
  stepEls[idx].innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>${detail ? `<div class="detail">${detail}</div>` : ''}`;
  stepEls[idx].className = `step ${cls || ''}`;
}

function addResult(text) {
  const el = document.createElement('div');
  el.className = 'result';
  el.textContent = text;
  stepsEl.appendChild(el);
  stepsEl.scrollTop = stepsEl.scrollHeight;
}

async function callAgent(apiKey, restKey, sessionId, prompt) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      instructions: `You are a web automation agent. Always use session_id "${sessionId}" in every tool call.
For DOM snapshots, ALWAYS use options to keep them small: {"session_id": "...", "options": {"quality": 0.2, "root": "body", "interactiveOnly": false}}
Be concise. One sentence answers.`,
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
  { prompt: 'Take a DOM snapshot (use options quality 0.2) and describe what page we are on in one sentence.', label: '👀 Scanning the page' },
  { prompt: 'Navigate to https://en.wikipedia.org/wiki/Amsterdam', label: '🧭 Going to Wikipedia' },
  { prompt: 'Take a DOM snapshot with options: root ".mw-parser-output .infobox", quality 1. Find the population of Amsterdam from the infobox. Return just the number.', label: '📊 Finding population' },
  { prompt: 'Take a DOM snapshot with options: root "#toc", quality 1. List the main section headings of this article.', label: '📋 Reading table of contents' },
  { prompt: 'Click on the link for "Sister cities" or "Twin towns" in the article. Then take a DOM snapshot with options: quality 0.3. List the first 5 sister cities.', label: '🏙️ Finding sister cities' },
];

async function startDemo() {
  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  stepsEl.innerHTML = '';
  stepEls.length = 0;

  let apiKey, restKey, sessionId;
  try {
    apiKey = browser.webfuseSession.env.OPENAI_API_KEY;
    restKey = browser.webfuseSession.env.SPACE_REST_KEY;
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch(e) {
    addResult('❌ ' + e.message);
    btn.disabled = false; btn.textContent = '▶ Start Demo';
    return;
  }

  addStep('🔗', `Session: ${sessionId.substring(0, 12)}...`);

  for (let i = 0; i < JOURNEY.length; i++) {
    const step = JOURNEY[i];
    addStep('⏳', step.label);

    try {
      const result = await callAgent(apiKey, restKey, sessionId, `session_id: ${sessionId}. ${step.prompt}`);
      const textItem = (result.output || []).find(o => o.type === 'message');
      const text = textItem?.content?.find(c => c.type === 'output_text')?.text;
      const tools = (result.output || []).filter(o => o.type === 'mcp_call').map(o => o.name).join(' → ');

      updateStep(i + 1, '✅', step.label, tools, 'done');
      if (text) addResult(text);
    } catch (err) {
      updateStep(i + 1, '❌', step.label, err.message);
      break;
    }
  }

  addResult('🎉 Demo complete!');
  btn.disabled = false;
  btn.textContent = '▶ Run Again';
}
