const AGENT_URL = browser.webfuseSession.env.AGENT_URL || 'https://openai-mcp-proxy.nicholas-319.workers.dev';
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

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

// Lightweight markdown → HTML
function mdToHtml(md) {
  var html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" onclick="event.preventDefault();window.open(\'$2\',\'_blank\')">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/\n/g, '<br>');

  html = html.replace(/((?:^|\<br\>)\d+\.\s.+(?:\<br\>\d+\.\s.+)*)/g, function(block) {
    var items = block.split('<br>').filter(function(l) { return l.match(/^\d+\.\s/); });
    if (!items.length) return block;
    return '<ol>' + items.map(function(i) { return '<li>' + i.replace(/^\d+\.\s/, '') + '</li>'; }).join('') + '</ol>';
  });

  html = html.replace(/((?:^|\<br\>)[\-\*]\s.+(?:\<br\>[\-\*]\s.+)*)/g, function(block) {
    var items = block.split('<br>').filter(function(l) { return l.match(/^[\-\*]\s/); });
    if (!items.length) return block;
    return '<ul>' + items.map(function(i) { return '<li>' + i.replace(/^[\-\*]\s/, '') + '</li>'; }).join('') + '</ul>';
  });

  return html;
}

function addMessage(role, content) {
  var el = document.createElement('div');
  el.className = 'msg ' + role;
  if (role === 'ai' && content) {
    el.innerHTML = mdToHtml(content);
  } else {
    el.textContent = content;
  }
  messagesEl.appendChild(el);
  requestAnimationFrame(function() { messagesEl.scrollTop = messagesEl.scrollHeight; });
  return el;
}

function showTool(name) {
  var names = {
    see_domSnapshot: 'reading the page…',
    act_click: 'clicking…',
    act_type: 'typing…',
    act_keyPress: 'pressing key…',
    navigate: 'navigating…',
    act_scroll: 'scrolling…',
    act_textSelect: 'selecting text…',
    see_textSelection: 'reading selection…',
  };
  addMessage('tool', names[name] || ('using ' + name));
}

async function sendMessage() {
  var text = input.value.trim();
  if (!text || !sessionId) return;

  input.value = '';
  sendBtn.disabled = true;
  input.disabled = true;
  addMessage('user', text);

  var aiEl = addMessage('ai', '');
  aiEl.innerHTML = '<span class="typing">thinking…</span>';

  try {
    var resp = await fetch(AGENT_URL + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });

    if (!resp.ok) throw new Error('Server error ' + resp.status);

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var gotText = false;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('data: ')) continue;
        try {
          var ev = JSON.parse(lines[i].slice(6));
          if (ev.type === 'tools' && Array.isArray(ev.content)) {
            ev.content.forEach(function(t) { showTool(t); });
          }
          if (ev.type === 'text') {
            aiEl.innerHTML = mdToHtml(ev.content);
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
