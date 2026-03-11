const AGENT_URL = browser.webfuseSession.env.AGENT_URL || 'https://openai-agent.webfuse.it';
const stepsEl = document.getElementById('steps');
const btn = document.getElementById('btn');

function addEl(cls, html) {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  stepsEl.appendChild(el);
  stepsEl.scrollTop = stepsEl.scrollHeight;
  return el;
}

const stepMap = {};

function handleEvent(event) {
  if (event.type === 'step_start') {
    stepMap[event.index] = addEl('step', `<span class="icon">⏳</span><span class="label">${event.icon} ${event.label}</span>`);
  }
  if (event.type === 'step_done') {
    const el = stepMap[event.index];
    if (el) {
      const lbl = el.querySelector('.label')?.textContent?.replace('⏳ ', '') || '';
      el.className = 'step done';
      el.innerHTML = `<span class="icon">✅</span><span class="label">${lbl}</span><div class="detail">${event.tools}</div>`;
    }
    if (event.text) addEl('result', event.text);
  }
  if (event.type === 'step_error') {
    const el = stepMap[event.index];
    if (el) {
      el.className = 'step';
      el.innerHTML = `<span class="icon">❌</span><span class="label">${el.querySelector('.label')?.textContent || ''}</span><div class="detail">${event.error}</div>`;
    }
  }
  if (event.type === 'done') {
    addEl('result', '🎉 Demo complete! The agent navigated pages, extracted data, and clicked links — all via Webfuse MCP.');
  }
}

// Listen for SSE events relayed from background
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'SSE') handleEvent(message.event);
  if (message?.type === 'SSE_END') {
    btn.disabled = false;
    btn.textContent = '▶ Run Again';
  }
});

async function startDemo() {
  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  stepsEl.innerHTML = '';
  Object.keys(stepMap).forEach(k => delete stepMap[k]);

  let sessionId;
  try {
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch (e) {
    addEl('result', '❌ ' + e.message);
    btn.disabled = false; btn.textContent = '▶ Start Demo';
    return;
  }

  addEl('step', `<span class="icon">🔗</span><span class="label">Session: ${sessionId.substring(0, 12)}...</span>`);

  // Send to background for CSP-free fetch
  browser.runtime.sendMessage({ type: 'START_DEMO', sessionId, agentUrl: AGENT_URL });
}
