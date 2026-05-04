const BACKEND = "https://notebot-ai.onrender.com";

const sessionKey = "notebot_session_id";
const conversationKey = "notebot_conversation_id";
const modeKey = "notebot_mode";

const sessionId = localStorage.getItem(sessionKey) || crypto.randomUUID();
localStorage.setItem(sessionKey, sessionId);

let conversationId = localStorage.getItem(conversationKey) || "";
let currentMode = localStorage.getItem(modeKey) || "chat";
let selectedFiles = [];
let conversations = [];
let isStreaming = false;

const chatEl = document.getElementById("chat");
const chatListEl = document.getElementById("chatList");
const memorySummaryEl = document.getElementById("memorySummary");
const statusLineEl = document.getElementById("statusLine");
const attachmentStripEl = document.getElementById("attachmentStrip");
const textInputEl = document.getElementById("textInput");
const fileInputEl = document.getElementById("fileInput");
const sendBtnEl = document.getElementById("sendBtn");
const dropZoneEl = document.getElementById("dropZone");
const sidebarEl = document.getElementById("sidebar");
const mobileBackdropEl = document.getElementById("mobileBackdrop");

const modeButtons = [...document.querySelectorAll(".mode-pill")];
modeButtons.forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.getElementById("newChatBtn").addEventListener("click", newChat);
document.getElementById("refreshChatsBtn").addEventListener("click", refreshSidebar);
document.getElementById("exportBtn").addEventListener("click", exportPdf);
document.getElementById("copyLastBtn").addEventListener("click", copyLastAssistant);
document.getElementById("clearFilesBtn").addEventListener("click", () => {
  selectedFiles = [];
  renderAttachmentStrip();
});
document.getElementById("menuBtn").addEventListener("click", openSidebar);
mobileBackdropEl.addEventListener("click", closeSidebar);

sendBtnEl.addEventListener("click", sendMessage);

textInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

fileInputEl.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  appendFiles(files);
  fileInputEl.value = "";
});

dropZoneEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZoneEl.classList.add("active");
});

dropZoneEl.addEventListener("dragleave", () => {
  dropZoneEl.classList.remove("active");
});

dropZoneEl.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZoneEl.classList.remove("active");
  const files = [...e.dataTransfer.files];
  appendFiles(files);
});

async function bootstrap() {
  setMode(currentMode);

  if (!conversationId) {
    await createConversation();
  }

  await Promise.all([refreshSidebar(), loadMemory(), loadMessages(conversationId)]);
  renderWelcomeIfEmpty();
}

function setMode(mode) {
  currentMode = mode;
  localStorage.setItem(modeKey, mode);
  modeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  statusLineEl.textContent = `Mode: ${mode}`;
}

function openSidebar() {
  sidebarEl.classList.add("open");
  mobileBackdropEl.classList.add("show");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  mobileBackdropEl.classList.remove("show");
}

function renderWelcomeIfEmpty() {
  if (chatEl.children.length > 0) return;

  const welcome = addMessage("assistant", `Welcome to Notebot. Upload a screenshot or type a message, and I’ll turn it into clean notes, flashcards, quiz items, or an explanation.`);
  welcome.classList.add("streaming");
}

function addMessage(role, text = "", attachments = []) {
  const row = document.createElement("div");
  row.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (attachments.length) {
    const strip = document.createElement("div");
    strip.className = "attachments";

    attachments.forEach(att => {
      const card = document.createElement("div");
      card.className = "attachment";

      if (att.preview) {
        const img = document.createElement("img");
        img.src = att.preview;
        img.alt = att.name || "attachment";
        card.appendChild(img);
      } else {
        const chip = document.createElement("div");
        chip.className = "file-chip";
        chip.textContent = att.name || "file";
        card.appendChild(chip);
      }

      if (att.name) {
        const meta = document.createElement("div");
        meta.className = "file-chip";
        meta.textContent = att.name;
        card.appendChild(meta);
      }

      strip.appendChild(card);
    });

    bubble.appendChild(strip);
  }

  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;

  return { row, bubble };
}

function renderMarkdown(text) {
  const safe = DOMPurify.sanitize(marked.parse(text || ""));
  return safe;
}

function renderAttachmentStrip() {
  attachmentStripEl.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "attach-preview";

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderAttachmentStrip();
    });

    const meta = document.createElement("div");
    meta.className = "meta";

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      card.appendChild(img);
    } else {
      const chip = document.createElement("div");
      chip.className = "file-chip";
      chip.textContent = file.name;
      card.appendChild(chip);
    }

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = file.name;

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${Math.round(file.size / 1024)} KB`;

    meta.appendChild(name);
    meta.appendChild(sub);
    card.appendChild(meta);
    card.appendChild(removeBtn);
    attachmentStripEl.appendChild(card);
  });

  dropZoneEl.style.display = selectedFiles.length ? "block" : "none";
}

function appendFiles(files) {
  const imagesOnly = files.filter(file => file.type.startsWith("image/"));
  if (!imagesOnly.length) {
    setStatus("Only images are enabled right now.");
    return;
  }

  selectedFiles = [...selectedFiles, ...imagesOnly].slice(0, 6);
  renderAttachmentStrip();
  setStatus(`${selectedFiles.length} image(s) attached.`);
}

function setStatus(text) {
  statusLineEl.textContent = text;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ocrImage(file) {
  try {
    const result = await Tesseract.recognize(file, "eng", {
      logger: m => {
        if (m.status === "recognizing text") {
          setStatus(`Reading image… ${Math.round((m.progress || 0) * 100)}%`);
        }
      }
    });
    return result?.data?.text?.trim() || "";
  } catch (err) {
    console.error("OCR error:", err);
    return "";
  }
}

async function ocrFiles(files) {
  let combined = "";
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith("image/")) continue;
    setStatus(`OCR ${i + 1}/${files.length}…`);
    const text = await ocrImage(file);
    if (text) combined += `\n[${file.name}]\n${text}\n`;
  }
  return combined.trim();
}

async function createConversation() {
  const res = await fetch(`${BACKEND}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, mode: currentMode })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || "Failed to create conversation");

  conversationId = data.conversation.id;
  localStorage.setItem(conversationKey, conversationId);
  return conversationId;
}

async function refreshSidebar() {
  const res = await fetch(`${BACKEND}/conversations?sessionId=${encodeURIComponent(sessionId)}`);
  const data = await res.json();

  if (!res.ok) {
    console.error(data);
    return;
  }

  conversations = data.conversations || [];
  chatListEl.innerHTML = "";

  conversations.forEach(convo => {
    const item = document.createElement("div");
    item.className = `chat-item ${convo.id === conversationId ? "active" : ""}`;

    const left = document.createElement("div");
    left.style.minWidth = "0";

    const title = document.createElement("div");
    title.className = "chat-item-title";
    title.textContent = convo.title || "New chat";

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";
    meta.textContent = `${convo.mode || "chat"} • ${new Date(convo.updated_at).toLocaleDateString()}`;

    left.appendChild(title);
    left.appendChild(meta);

    const del = document.createElement("button");
    del.className = "chat-item-delete";
    del.textContent = "⋯";
    del.title = "Delete chat";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteConversation(convo.id);
    });

    item.appendChild(left);
    item.appendChild(del);

    item.addEventListener("click", async () => {
      conversationId = convo.id;
      localStorage.setItem(conversationKey, conversationId);
      await loadMessages(conversationId);
      await refreshSidebar();
      closeSidebar();
    });

    chatListEl.appendChild(item);
  });
}

async function loadMessages(id) {
  chatEl.innerHTML = "";

  const res = await fetch(`${BACKEND}/messages/${id}`);
  const data = await res.json();

  if (!res.ok) {
    setStatus("Failed to load messages.");
    return;
  }

  const messages = data.messages || [];
  if (!messages.length) {
    renderWelcomeIfEmpty();
    return;
  }

  messages.forEach(msg => {
    const item = addMessage(msg.role === "assistant" ? "assistant" : "user", msg.content || "");
    if (msg.role === "assistant") {
      item.bubble.innerHTML = renderMarkdown(msg.content || "");
    }
  });

  chatEl.scrollTop = chatEl.scrollHeight;
}

async function loadMemory() {
  const res = await fetch(`${BACKEND}/memory/${encodeURIComponent(sessionId)}`);
  const data = await res.json();

  if (!res.ok) {
    memorySummaryEl.textContent = "Memory unavailable.";
    return;
  }

  memorySummaryEl.textContent = data.memorySummary || "No memory yet. Talk to Notebot and it will learn your style.";
}

async function deleteConversation(id) {
  const ok = confirm("Delete this conversation?");
  if (!ok) return;

  const res = await fetch(`${BACKEND}/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!res.ok) return;

  if (id === conversationId) {
    await createConversation();
    chatEl.innerHTML = "";
    renderWelcomeIfEmpty();
  }

  await refreshSidebar();
}

async function copyLastAssistant() {
  const assistantMessages = [...chatEl.querySelectorAll(".message.assistant .bubble")];
  const last = assistantMessages.at(-1);
  if (!last) return;

  const text = last.innerText;
  await navigator.clipboard.writeText(text);
  setStatus("Copied the last assistant reply.");
}

async function exportPdf() {
  if (!conversationId) return;

  const title = conversations.find(c => c.id === conversationId)?.title || "Notebot Notes";

  const res = await fetch(`${BACKEND}/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, title })
  });

  if (!res.ok) {
    setStatus("PDF export failed.");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\- ]+/g, "").slice(0, 50) || "notebot"}.pdf`;
  a.click();

  URL.revokeObjectURL(url);
}

async function sendMessage() {
  if (isStreaming) return;

  const text = textInputEl.value.trim();
  if (!text && selectedFiles.length === 0) return;

  if (!conversationId) {
    await createConversation();
  }

  isStreaming = true;
  sendBtnEl.disabled = true;
  sendBtnEl.textContent = "…";

  const previewFiles = await Promise.all(
    selectedFiles.map(async file => ({
      name: file.name,
      type: file.type,
      size: file.size,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : ""
    }))
  );

  addMessage("user", text || "📎 Attachment(s) only", previewFiles);

  const placeholder = addMessage("assistant", "");
  placeholder.row.classList.add("streaming");
  setStatus("Reading attachments…");

  const ocrText = await ocrFiles(selectedFiles);
  const attachmentPayload = await Promise.all(
    selectedFiles.map(async file => ({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: await fileToDataUrl(file)
    }))
  );

  setStatus("Streaming answer…");

  const res = await fetch(`${BACKEND}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      conversationId,
      text,
      ocrText,
      attachments: attachmentPayload,
      mode: currentMode
    })
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    placeholder.bubble.textContent = errText || "Something went wrong.";
    placeholder.row.classList.remove("streaming");
    sendBtnEl.disabled = false;
    sendBtnEl.textContent = "Send";
    isStreaming = false;
    setStatus("Request failed.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    full += decoder.decode(value, { stream: true });
    placeholder.bubble.textContent = full;
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  placeholder.bubble.innerHTML = renderMarkdown(full || "No response.");
  placeholder.row.classList.remove("streaming");

  selectedFiles = [];
  renderAttachmentStrip();
  textInputEl.value = "";
  setStatus("Done.");

  await Promise.all([refreshSidebar(), loadMemory()]);
  sendBtnEl.disabled = false;
  sendBtnEl.textContent = "Send";
  isStreaming = false;
}

async function newChat() {
  const res = await fetch(`${BACKEND}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, mode: currentMode })
  });

  const data = await res.json();
  if (!res.ok) {
    setStatus("Could not start a new chat.");
    return;
  }

  conversationId = data.conversation.id;
  localStorage.setItem(conversationKey, conversationId);

  selectedFiles = [];
  renderAttachmentStrip();
  chatEl.innerHTML = "";
  renderWelcomeIfEmpty();
  await refreshSidebar();
  setStatus("New chat ready.");
}

async function init() {
  if (!conversationId) {
    await newChat();
  } else {
    await refreshSidebar();
    await loadMessages(conversationId);
  }

  await loadMemory();

  if (!chatEl.children.length) {
    renderWelcomeIfEmpty();
  }
}

init().catch(err => {
  console.error(err);
  setStatus("Startup failed. Check backend and env vars.");
});
