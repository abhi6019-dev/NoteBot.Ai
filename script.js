
const BACKEND = "https://your-backend.onrender.com";

let files = [];
let chatBox = document.getElementById("chat");
let previewBar = document.getElementById("previewBar");

/* =========================
   FILE HANDLING (FIXED)
========================= */
document.getElementById("fileInput").addEventListener("change", (e) => {
  const newFiles = Array.from(e.target.files);
  files = files.concat(newFiles);
  renderPreviews();
});

/* =========================
   RENDER PREVIEWS
========================= */
function renderPreviews() {
  previewBar.innerHTML = "";

  files.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "preview-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);

    const btn = document.createElement("button");
    btn.innerText = "×";
    btn.className = "remove";
    btn.onclick = () => {
      files.splice(index, 1);
      renderPreviews();
    };

    div.appendChild(img);
    div.appendChild(btn);
    previewBar.appendChild(div);
  });
}

/* =========================
   CHAT UI
========================= */
function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.innerText = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* =========================
   SEND MESSAGE
========================= */
async function sendMessage() {
  const input = document.getElementById("textInput");
  const text = input.value;

  if (!text && files.length === 0) return;

  addMessage(text || "📎 Image input", "user");
  input.value = "";

  let extractedText = "";

  /* OCR STEP (optional backend) */
  for (let f of files) {
    const fd = new FormData();
    fd.append("image", f);

    const res = await fetch(`${BACKEND}/ocr`, {
      method: "POST",
      body: fd
    });

    const data = await res.json();
    extractedText += data.text + "\n";
  }

  files = [];
  renderPreviews();

  /* AI STEP */
  const res2 = await fetch(`${BACKEND}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text + "\n" + extractedText
    })
  });

  const data2 = await res2.json();
  addMessage(data2.reply, "ai");
}

/* =========================
   NEW CHAT
========================= */
function newChat() {
  chatBox.innerHTML = "";
  files = [];
  renderPreviews();
}
