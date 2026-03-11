const AGENT_URL = browser.webfuseSession.env.AGENT_URL || 'https://agent.webfuse.it';
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

async function startDemo() {
  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  stepsEl.innerHTML = '';

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

  console.log('[popup] Fetching', AGENT_URL + '/run');
  let resp;
  try {
    resp = await fetch(`${AGENT_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    console.log('[popup] Response status:', resp.status);
  } catch (e) {
    console.error('[popup] Fetch failed:', e);
    addEl('result', '❌ Network error: ' + e.message);
    btn.disabled = false; btn.textContent = '▶ Start Demo';
    return;
  }

  if (!resp.ok) {
    addEl('result', '❌ Server error: ' + resp.status);
    btn.disabled = false; btn.textContent = '▶ Start Demo';
    return;
  }

  // Read SSE as text (more compatible than ReadableStream)
  const text = await resp.text();
  console.log('[popup] Got response, length:', text.length);
  const lines = text.split('\n');
  const stepMap = {};

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    let event;
    try { event = JSON.parse(line.slice(6)); } catch { continue; }
    console.log('[popup] Event:', event.type);

    if (event.type === 'step_start') {
      stepMap[event.index] = addEl('step', `<span class="icon">⏳</span><span class="label">${event.icon} ${event.label}</span>`);
    }
    if (event.type === 'step_done') {
      const el = stepMap[event.index];
      if (el) {
        el.className = 'step done';
        const lbl = el.querySelector('.label')?.textContent?.replace('⏳ ', '') || '';
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

  btn.disabled = false;
  btn.textContent = '▶ Run Again';
}
