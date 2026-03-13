const AGENT_URL = browser.webfuseSession.env.AGENT_URL || 'https://openai-mcp-proxy.nicholas-319.workers.dev';
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const examplesEl = document.getElementById('examples');
const chipList = document.getElementById('chipList');
const chipToggle = document.getElementById('chipToggle');

let sessionId = null;

(async () => {
  try {
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch (e) {
    addMessage('ai', '⚠️ Could not connect to session.');
  }
})();

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function askExample(el) {
  input.value = el.textContent;
  sendMessage();
}

function showChips() {
  chipList.style.display = '';
  chipToggle.style.display = 'none';
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  messagesEl.appendChild(el);
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  return el;
}

function showTool(name) {
  const names = {
    see_domSnapshot: 'reading the page...',
    act_click: 'clicking...',
    act_type: 'typing...',
    act_keyPress: 'pressing key...',
    navigate: 'navigating...',
    act_scroll: 'scrolling...',
    act_textSelect: 'selecting text...',
    see_textSelection: 'reading selection...',
  };
  addMessage('tool', names[name] || ('using ' + name));
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || !sessionId) return;

  // Collapse chips
  if (chipList) chipList.style.display = 'none';
  if (chipToggle) chipToggle.style.display = 'block';

  input.value = '';
  sendBtn.disabled = true;
  input.disabled = true;
  addMessage('user', text);

  const aiEl = addMessage('ai', '');
  aiEl.innerHTML = '<span class="typing">thinking…</span>';

  try {
    const resp = await fetch(AGENT_URL + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });

    if (!resp.ok) throw new Error('Server error ' + resp.status);

    // Read SSE stream
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let gotText = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'tools' && Array.isArray(ev.content)) {
            ev.content.forEach(t => showTool(t));
          }
          if (ev.type === 'text') {
            aiEl.textContent = ev.content;
            gotText = true;
          }
          if (ev.type === 'error') {
            aiEl.textContent = '❌ ' + ev.content;
            gotText = true;
          }
        } catch (_) {}
      }
    }

    if (!gotText) aiEl.textContent = '🤔 No response. Try again.';

  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
