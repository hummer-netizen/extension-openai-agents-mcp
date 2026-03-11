// Inject sidebar into the page
const SIDEBAR_WIDTH = '340px';

const sidebar = document.createElement('div');
sidebar.id = 'wf-agent-sidebar';
sidebar.innerHTML = `
<style>
  #wf-agent-sidebar {
    position: fixed; top: 0; right: 0; width: ${SIDEBAR_WIDTH}; height: 100vh;
    background: #0f0f1a; color: #e0e0e0; font-family: -apple-system, sans-serif;
    z-index: 999999; display: flex; flex-direction: column;
    border-left: 1px solid #2a2a4a; font-size: 14px;
  }
  #wf-agent-sidebar .header {
    padding: 16px; border-bottom: 1px solid #2a2a4a;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }
  #wf-agent-sidebar .header h2 { margin: 0 0 4px; font-size: 16px; color: #8b5cf6; }
  #wf-agent-sidebar .header p { margin: 0; font-size: 12px; color: #888; }
  #wf-agent-sidebar .steps { flex: 1; overflow-y: auto; padding: 12px; }
  #wf-agent-sidebar .step {
    padding: 10px 12px; margin: 6px 0; border-radius: 8px;
    background: #1a1a2e; border: 1px solid #2a2a4a; transition: all 0.3s;
  }
  #wf-agent-sidebar .step.active { border-color: #8b5cf6; background: #1e1b3a; }
  #wf-agent-sidebar .step.done { border-color: #34d399; }
  #wf-agent-sidebar .step .icon { display: inline-block; width: 20px; }
  #wf-agent-sidebar .step .label { font-size: 13px; }
  #wf-agent-sidebar .step .detail { font-size: 11px; color: #888; margin-top: 4px; }
  #wf-agent-sidebar .result {
    padding: 12px; margin: 8px 0; border-radius: 8px;
    background: #1a2e1a; border: 1px solid #34d399; font-size: 12px; line-height: 1.5;
  }
  #wf-agent-sidebar .controls { padding: 12px; border-top: 1px solid #2a2a4a; }
  #wf-agent-sidebar button {
    width: 100%; padding: 10px; border: none; border-radius: 8px;
    background: #8b5cf6; color: white; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background 0.2s;
  }
  #wf-agent-sidebar button:hover { background: #7c3aed; }
  #wf-agent-sidebar button:disabled { background: #444; cursor: not-allowed; }
  #wf-agent-sidebar .powered {
    text-align: center; padding: 8px; font-size: 11px; color: #555;
  }
  #wf-agent-sidebar .powered a { color: #8b5cf6; text-decoration: none; }
</style>
<div class="header">
  <h2>🤖 OpenAI Agent Demo</h2>
  <p>AI agent controlling this page via Webfuse MCP</p>
</div>
<div class="steps" id="wf-steps"></div>
<div class="controls">
  <button id="wf-start-btn" onclick="window.__wfStartDemo()">▶ Start Demo</button>
</div>
<div class="powered">Powered by <a href="https://webfuse.com" target="_blank">Webfuse</a> + <a href="https://openai.com" target="_blank">OpenAI</a></div>
`;
document.body.appendChild(sidebar);

// Shrink the page to make room
document.body.style.marginRight = SIDEBAR_WIDTH;

// Step management
const stepsEl = document.getElementById('wf-steps');
const steps = [];

function addStep(icon, label, detail) {
  const idx = steps.length;
  const el = document.createElement('div');
  el.className = 'step';
  el.innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>${detail ? `<div class="detail">${detail}</div>` : ''}`;
  stepsEl.appendChild(el);
  steps.push(el);
  stepsEl.scrollTop = stepsEl.scrollHeight;
  return idx;
}

function updateStep(idx, icon, label, detail, cls) {
  if (!steps[idx]) return;
  steps[idx].innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>${detail ? `<div class="detail">${detail}</div>` : ''}`;
  steps[idx].className = `step ${cls || ''}`;
  stepsEl.scrollTop = stepsEl.scrollHeight;
}

function addResult(text) {
  const el = document.createElement('div');
  el.className = 'result';
  el.textContent = text;
  stepsEl.appendChild(el);
  stepsEl.scrollTop = stepsEl.scrollHeight;
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'step') addStep(msg.icon, msg.label, msg.detail);
  if (msg.type === 'update') updateStep(msg.idx, msg.icon, msg.label, msg.detail, msg.cls);
  if (msg.type === 'result') addResult(msg.text);
  if (msg.type === 'done') {
    document.getElementById('wf-start-btn').disabled = false;
    document.getElementById('wf-start-btn').textContent = '▶ Run Again';
  }
});

window.__wfStartDemo = () => {
  document.getElementById('wf-start-btn').disabled = true;
  document.getElementById('wf-start-btn').textContent = '⏳ Running...';
  stepsEl.innerHTML = '';
  steps.length = 0;
  chrome.runtime.sendMessage({ action: 'start_demo' });
};
