const BACKEND = "https://notebot-ai.onrender.com";

let files = [];

const chat = document.getElementById("chat");
const bar = document.getElementById("attachBar");

/* =========================
   FILES (FIXED)
========================= */
document.getElementById("fileInput").addEventListener("change", (e) => {
  files = [...files, ...Array.from(e.target.files)];
  renderFiles();
});

/* =========================
   CHAT BUBBLES
========================= */
function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/* =========================
   FILE PREVIEW (CHATGPT STYLE)
========================= */
function renderFiles() {
  bar.innerHTML = "";

  files.forEach((f, i) => {
    const wrap = document.createElement("div");
    wrap.className = "attach-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);

    const btn = document.createElement("button");
    btn.innerText = "×";
    btn.className = "remove";
    btn.onclick = () => {
      files.splice(i, 1);
      renderFiles();
    };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    bar.appendChild(wrap);
  });
}

/* =========================
   SEND MESSAGE (FIXED)
========================= */
async function sendMessage() {
  const input = document.getElementById("textInput");
  const text = input.value;

  addMsg("user", text || "📎 Image");

  const form = new FormData();
  form.append("text", text);

  files.forEach(f => form.append("files", f));

  input.value = "";

  const res = await fetch(`${BACKEND}/chat`, {
    method: "POST",
    body: form
  });

  const data = await res.json();

  addMsg("ai", data.reply);

  files = [];
  renderFiles();
}

/* =========================
   NEW CHAT
========================= */
function newChat() {
  chat.innerHTML = "";
  files = [];
  renderFiles();
}
