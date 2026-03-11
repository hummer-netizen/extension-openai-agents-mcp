browser.sidePanel.open();

// Proxy fetch through background to bypass sidepanel CSP
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'START_DEMO') {
    runDemo(message.sessionId, message.agentUrl);
  }
});

async function runDemo(sessionId, agentUrl) {
  try {
    const resp = await fetch(`${agentUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!resp.ok) {
      browser.runtime.sendMessage({ type: 'SSE', event: { type: 'step_error', index: 0, error: `Server ${resp.status}` } });
      browser.runtime.sendMessage({ type: 'SSE_END' });
      return;
    }

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
        try {
          browser.runtime.sendMessage({ type: 'SSE', event: JSON.parse(line.slice(6)) });
        } catch {}
      }
    }

    if (buffer.startsWith('data: ')) {
      try { browser.runtime.sendMessage({ type: 'SSE', event: JSON.parse(buffer.slice(6)) }); } catch {}
    }

    browser.runtime.sendMessage({ type: 'SSE_END' });
  } catch (e) {
    browser.runtime.sendMessage({ type: 'SSE', event: { type: 'step_error', index: 0, error: e.message } });
    browser.runtime.sendMessage({ type: 'SSE_END' });
  }
}
