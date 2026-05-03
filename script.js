

const BACKEND = "https://notebot-ai.onrender.com";

let files = [];
let chat = document.getElementById("chat");

/* =========================
   FILE HANDLING (FIXED)
========================= */
document.getElementById("fileInput").addEventListener("change", (e) => {
  files = Array.from(e.target.files);
});

/* =========================
   CREATE MESSAGE UI
========================= */
function addMessage(role, text, attachments = []) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;

  div.innerText = text;

  if (attachments.length > 0) {
    const att = document.createElement("div");
    att.className = "attachments";

    attachments.forEach(file => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      att.appendChild(img);
    });

    div.appendChild(att);
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  return div;
}

/* =========================
   STREAMING AI RESPONSE
========================= */
async function streamAI(payload, aiBubble) {

  const res = await fetch(`${BACKEND}/chat-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    text += decoder.decode(value);
    aiBubble.innerText = text;
  }
}

/* =========================
   SEND MESSAGE (FIXED FILE ISSUE)
========================= */
async function sendMessage() {
  const input = document.getElementById("textInput");
  const text = input.value;

  addMessage("user", text, files);

  const formData = new FormData();
  formData.append("text", text);

  files.forEach(f => formData.append("files", f));

  input.value = "";

  const aiBubble = addMessage("ai", "Thinking...");

  const res = await fetch(`${BACKEND}/chat`, {
    method: "POST",
    body: formData
  });

  const data = await res.json();

  aiBubble.innerText = data.reply;

  files = [];
}

/* =========================
   NEW CHAT
========================= */
function newChat() {
  chat.innerHTML = "";
  files = [];
}
