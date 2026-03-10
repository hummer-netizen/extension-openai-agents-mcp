// popup.js — Chat UI that connects to the Python agent backend

const messagesEl = document.getElementById("messages");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const statusDot = document.getElementById("statusDot");

let sessionId = null;
let restKey = null;
let backendUrl = null;

// Get session info and env vars from Webfuse
async function init() {
  try {
    const env = browser.webfuseSession.env;
    backendUrl = env.AGENT_BACKEND_URL;
    restKey = env.SPACE_REST_KEY;

    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.session_id;

    setStatus("ready");
    console.log("[OpenAI Agent] Connected. Session:", sessionId);
  } catch (err) {
    console.error("[OpenAI Agent] Init failed:", err);
    setStatus("error");
    addMessage("agent", "Failed to connect to Webfuse session. Make sure you are inside a Webfuse Space.");
  }
}

function setStatus(state) {
  statusDot.className = "status-dot";
  if (state === "working") statusDot.classList.add("working");
  if (state === "error") statusDot.classList.add("error");
  statusDot.title = state.charAt(0).toUpperCase() + state.slice(1);
}

function addMessage(role, content) {
  // Remove welcome message on first interaction
  const welcome = messagesEl.querySelector(".welcome");
  if (welcome) welcome.remove();

  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = formatContent(content);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return msg;
}

function formatContent(content) {
  // Render tool calls as pills
  return content.replace(
    /\[tool:(\w+)\]/g,
    '<span class="tool-pill">⚡ $1</span>'
  );
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || !sessionId) return;

  userInput.value = "";
  sendBtn.disabled = true;
  setStatus("working");

  addMessage("user", text);

  // Create a placeholder for the streamed response
  const agentMsg = addMessage("agent", "");
  let fullResponse = "";

  try {
    const response = await fetch(`${backendUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        session_id: sessionId,
        rest_key: restKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // Parse SSE lines
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === "text") {
            fullResponse += parsed.content;
            agentMsg.innerHTML = formatContent(fullResponse);
          } else if (parsed.type === "tool_call") {
            fullResponse += `[tool:${parsed.name}] `;
            agentMsg.innerHTML = formatContent(fullResponse);
          }
        } catch {
          // Plain text chunk
          fullResponse += data;
          agentMsg.innerHTML = formatContent(fullResponse);
        }
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  } catch (err) {
    console.error("[OpenAI Agent] Error:", err);
    if (!fullResponse) {
      agentMsg.innerHTML = `<span style="color: #f87171;">Error: ${err.message}</span>`;
    }
    setStatus("error");
    sendBtn.disabled = false;
    return;
  }

  setStatus("ready");
  sendBtn.disabled = false;
}

// Event listeners
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Initialize
init();
