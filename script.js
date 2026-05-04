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

const chatEl = document.getElementById("chatContainer");
const chatListEl = document.getElementById("chatList");
const memorySummaryEl = document.getElementById("memorySummary");
const statusLineEl = document.getElementById("statusLine");
const attachmentStripEl = document.getElementById("attachmentStrip");
const messageInputEl = document.getElementById("messageInput");
const fileInputEl = document.getElementById("fileInput");
const sendBtnEl = document.getElementById("sendBtn");
const dropZoneEl = document.getElementById("dropZone");
const sidebarEl = document.getElementById("sidebar");
const mobileBackdropEl = document.getElementById("mobileBackdrop");
const suggestionButtons = [...document.querySelectorAll(".suggestion")];
const modeButtons = [...document.querySelectorAll(".mode-pill")];

document.addEventListener("DOMContentLoaded", init);

function api(path) {
  return `${BACKEND}${path}`;
}

function setStatus(text) {
  statusLineEl.textContent = text;
}

function setMode(mode) {
  currentMode = mode;
  localStorage.setItem(modeKey, mode);
  modeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  setStatus(`Mode: ${mode}`);
}

function openSidebar() {
  sidebarEl.classList.add("open");
  mobileBackdropEl.classList.add("show");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  mobileBackdropEl.classList.remove("show");
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function markdown(text) {
  const html = marked.parse(text || "");
  return DOMPurify.sanitize(html);
}

function addMessage(role, text = "", attachments = []) {
  const row = document.createElement("div");
  row.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerText = text;

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

      const meta = document.createElement("div");
      meta.className = "file-chip";
      meta.textContent = att.name || "file";
      card.appendChild(meta);

      strip.appendChild(card);
    });

    bubble.appendChild(strip);
  }

  row.appendChild(bubble);
  chatEl.appendChild(row);
  scrollToBottom();

  return { row, bubble };
}

function renderWelcomeIfEmpty() {
  if (!chatEl) return;
  if (chatEl.children.length > 0) return;

  chatEl.innerHTML = "";

  const welcome = document.createElement("div");
  welcome.className = "message assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `
    <h2>Welcome to Notebot</h2>
    <p>Upload images, drop files, or type a question. Notebot keeps memory, streams responses, and saves your chats.</p>
  `;

  welcome.appendChild(bubble);
  chatEl.appendChild(welcome);
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

    const meta = document.createElement("div");
    meta.className = "meta";

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
  const imageFiles = files.filter(file => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    setStatus("Only images are enabled for OCR uploads right now.");
    return;
  }

  selectedFiles = [...selectedFiles, ...imageFiles].slice(0, 6);
  renderAttachmentStrip();
  setStatus(`${selectedFiles.length} image(s) attached.`);
}

async function fileToDataUrl(file) {
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
          setStatus(`OCR: ${Math.round((m.progress || 0) * 100)}%`);
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
  const imageFiles = files.filter(file => file.type.startsWith("image/"));

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    setStatus(`Reading image ${i + 1}/${imageFiles.length}…`);
    const text = await ocrImage(file);
    if (text) {
      combined += `\n[${file.name}]\n${text}\n`;
    }
  }

  return combined.trim();
}

async function createConversation() {
  const res = await fetch(api("/conversations"), {
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
  const res = await fetch(api(`/conversations?sessionId=${encodeURIComponent(sessionId)}`));
  const data = await res.json();

  if (!res.ok) {
    console.error(data);
    setStatus("Could not load chats.");
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

  const res = await fetch(api(`/messages/${id}`));
  const data = await res.json();

  if (!res.ok) {
    setStatus("Failed to load messages.");
    renderWelcomeIfEmpty();
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
      item.bubble.innerHTML = markdown(msg.content || "");
    }
  });

  scrollToBottom();
}

async function loadMemory() {
  const res = await fetch(api(`/memory/${encodeURIComponent(sessionId)}`));
  const data = await res.json();

  if (!res.ok) {
    memorySummaryEl.textContent = "Memory unavailable.";
    return;
  }

  memorySummaryEl.textContent =
    data.memorySummary || "No memory yet. Talk to Notebot and it will learn your style.";
}

async function deleteConversation(id) {
  const ok = confirm("Delete this conversation?");
  if (!ok) return;

  const res = await fetch(api(`/conversations/${encodeURIComponent(id)}`), {
    method: "DELETE"
  });

  if (!res.ok) {
    setStatus("Delete failed.");
    return;
  }

  if (id === conversationId) {
    chatEl.innerHTML = "";
    await createConversation();
    renderWelcomeIfEmpty();
  }

  await refreshSidebar();
}

async function copyLastAssistant() {
  const assistantMessages = [...chatEl.querySelectorAll(".message.assistant .bubble")];
  const last = assistantMessages.at(-1);
  if (!last) return;

  await navigator.clipboard.writeText(last.innerText);
  setStatus("Copied the last assistant reply.");
}

async function exportPdf() {
  if (!conversationId) return;

  const title = conversations.find(c => c.id === conversationId)?.title || "Notebot Notes";

  const res = await fetch(api("/export/pdf"), {
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

  const text = messageInputEl.value.trim();
  if (!text && selectedFiles.length === 0) return;

  if (!conversationId) {
    await createConversation();
  }

  isStreaming = true;
  sendBtnEl.disabled = true;
  sendBtnEl.textContent = "…";

  const previewFiles = selectedFiles.map(file => ({
    name: file.name,
    type: file.type,
    size: file.size,
    preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : ""
  }));

  addMessage("user", text || "📎 Attachment(s) only", previewFiles);

  const assistant = addMessage("assistant", "");
  assistant.row.classList.add("streaming");

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

  const res = await fetch(api("/chat/stream"), {
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
    assistant.bubble.textContent = errText || "Something went wrong.";
    assistant.row.classList.remove("streaming");
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
    assistant.bubble.textContent = full;
    scrollToBottom();
  }

  assistant.bubble.innerHTML = markdown(full || "No response.");
  assistant.row.classList.remove("streaming");

  selectedFiles = [];
  renderAttachmentStrip();
  messageInputEl.value = "";
  setStatus("Done.");

  await Promise.all([refreshSidebar(), loadMemory()]);
  sendBtnEl.disabled = false;
  sendBtnEl.textContent = "Send";
  isStreaming = false;
}

function bindEvents() {
  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  suggestionButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      messageInputEl.value = btn.dataset.suggest || "";
      messageInputEl.focus();
      autoGrowTextarea();
    });
  });

  document.getElementById("newChatBtn").addEventListener("click", async () => {
    await newChat();
    closeSidebar();
  });

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

  messageInputEl.addEventListener("input", autoGrowTextarea);
  messageInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  fileInputEl.addEventListener("change", (e) => {
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
}

function autoGrowTextarea() {
  messageInputEl.style.height = "auto";
  messageInputEl.style.height = Math.min(messageInputEl.scrollHeight, 180) + "px";
}

async function newChat() {
  const res = await fetch(api("/conversations"), {
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
  bindEvents();
  setMode(currentMode);

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

  autoGrowTextarea();
}

init().catch(err => {
  console.error(err);
  setStatus("Startup failed. Check backend and env vars.");
});
