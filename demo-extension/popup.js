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

  const resp = await fetch(`${AGENT_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const stepMap = {};
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const event = JSON.parse(line.slice(6));

      if (event.type === 'step_start') {
        stepMap[event.index] = addEl('step', `<span class="icon">⏳</span><span class="label">${event.icon} ${event.label}</span>`);
      }
      if (event.type === 'step_done') {
        const el = stepMap[event.index];
        if (el) {
          el.className = 'step done';
          el.innerHTML = `<span class="icon">✅</span><span class="label">${el.querySelector('.label').textContent.replace('⏳ ', '')}</span><div class="detail">${event.tools}</div>`;
        }
        if (event.text) addEl('result', event.text);
      }
      if (event.type === 'step_error') {
        const el = stepMap[event.index];
        if (el) {
          el.className = 'step';
          el.innerHTML = `<span class="icon">❌</span><span class="label">${el.querySelector('.label').textContent}</span><div class="detail">${event.error}</div>`;
        }
      }
      if (event.type === 'done') {
        addEl('result', '🎉 Demo complete! The agent navigated pages, extracted data, and clicked links — all via Webfuse MCP.');
      }
    }
  }

  btn.disabled = false;
  btn.textContent = '▶ Run Again';
}
