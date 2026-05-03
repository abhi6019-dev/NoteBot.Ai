
const BACKEND = "https://your-backend.onrender.com";

const chat = document.getElementById("chat");

/* =========================
   CHAT RENDER
========================= */
function addMessage(text, type) {
  const div = document.createElement("div");
  div.classList.add("msg", type);
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/* =========================
   SEND MESSAGE
========================= */
async function sendMessage() {
  const input = document.getElementById("textInput");
  const text = input.value;

  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  const res = await fetch(`${BACKEND}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  const data = await res.json();

  addMessage(data.reply, "ai");
}

/* =========================
   NEW CHAT
========================= */
function newChat() {
  chat.innerHTML = "";
}
