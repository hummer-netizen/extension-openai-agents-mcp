const AGENT_URL = browser.webfuseSession.env.AGENT_URL || 'https://openai-agent.webfuse.it';
const stepsEl = document.getElementById('steps');
const messagesEl = document.getElementById('messages');
const btn = document.getElementById('btn');
const chatInput = document.getElementById('chatInput');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

let currentMode = 'demo';
let sessionId = null;

// ── Mode switching ──────────────────────────────────────────────────────

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));

  if (mode === 'demo') {
    stepsEl.style.display = '';
    messagesEl.style.display = 'none';
    btn.style.display = '';
    chatInput.style.display = 'none';
  } else {
    stepsEl.style.display = 'none';
    messagesEl.style.display = '';
    btn.style.display = 'none';
    chatInput.style.display = 'flex';
    userInput.focus();
  }
}

// ── Session ID ──────────────────────────────────────────────────────────

async function getSessionId() {
  if (sessionId) return sessionId;
  const info = await browser.webfuseSession.getSessionInfo();
  sessionId = info.sessionId;
  return sessionId;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function addEl(container, cls, html) {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

// ── SSE reader ──────────────────────────────────────────────────────────

async function readSSE(resp, onEvent) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try { onEvent(JSON.parse(line.slice(6))); } catch {}
    }
  }

  if (buffer.startsWith('data: ')) {
    try { onEvent(JSON.parse(buffer.slice(6))); } catch {}
  }
}

// ── Demo mode ───────────────────────────────────────────────────────────

function handleDemoEvent(event, stepMap) {
  if (event.type === 'step_start') {
    stepMap[event.index] = addEl(stepsEl, 'step', `<span class="icon">⏳</span><span class="label">${event.icon} ${event.label}</span>`);
  }
  if (event.type === 'step_done') {
    const el = stepMap[event.index];
    if (el) {
      const lbl = el.querySelector('.label')?.textContent?.replace('⏳ ', '') || '';
      el.className = 'step done';
      el.innerHTML = `<span class="icon">✅</span><span class="label">${lbl}</span><div class="detail">${event.tools}</div>`;
    }
    if (event.text) addEl(stepsEl, 'result', event.text);
  }
  if (event.type === 'step_error') {
    const el = stepMap[event.index];
    if (el) {
      el.className = 'step';
      el.innerHTML = `<span class="icon">❌</span><span class="label">${el.querySelector('.label')?.textContent || ''}</span><div class="detail">${event.error}</div>`;
    }
  }
  if (event.type === 'done') {
    addEl(stepsEl, 'result', '🎉 Demo complete! The agent navigated pages, extracted data, and clicked links.');
  }
}

async function startDemo() {
  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  stepsEl.innerHTML = '';

  let sid;
  try {
    sid = await getSessionId();
  } catch (e) {
    addEl(stepsEl, 'result', '❌ ' + e.message);
    btn.disabled = false; btn.textContent = '▶ Start Demo';
    return;
  }

  addEl(stepsEl, 'step', `<span class="icon">🔗</span><span class="label">Session: ${sid.substring(0, 12)}...</span>`);

  let resp;
  try {
    resp = await fetch(`${AGENT_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid }),
    });
  } catch (e) {
    addEl(stepsEl, 'result', '❌ Network error: ' + e.message);
    btn.disabled = false; btn.textContent = '▶ Start Demo';
    return;
  }

  const stepMap = {};
  await readSSE(resp, (ev) => handleDemoEvent(ev, stepMap));

  btn.disabled = false;
  btn.textContent = '▶ Run Again';
}

// ── Chat mode ───────────────────────────────────────────────────────────

async function sendChat() {
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  sendBtn.disabled = true;

  addEl(messagesEl, 'msg user', text);

  let sid;
  try {
    sid = await getSessionId();
  } catch (e) {
    addEl(messagesEl, 'msg error', '❌ ' + e.message);
    sendBtn.disabled = false;
    return;
  }

  const agentMsg = addEl(messagesEl, 'msg agent', '<span style="color:#888">Thinking...</span>');
  let fullText = '';
  let toolsUsed = '';

  try {
    const resp = await fetch(`${AGENT_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, message: text }),
    });

    await readSSE(resp, (ev) => {
      if (ev.type === 'tools') {
        toolsUsed = ev.content;
      }
      if (ev.type === 'text') {
        fullText = ev.content;
      }
      if (ev.type === 'error') {
        agentMsg.className = 'msg error';
        agentMsg.textContent = ev.content;
      }
    });

    if (fullText || toolsUsed) {
      let html = '';
      if (toolsUsed) html += `<div class="tools">⚡ ${toolsUsed}</div>`;
      if (fullText) html += fullText;
      agentMsg.innerHTML = html;
    }
  } catch (e) {
    agentMsg.className = 'msg error';
    agentMsg.textContent = '❌ ' + e.message;
  }

  sendBtn.disabled = false;
  userInput.focus();
}

// Enter to send in chat mode
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});
