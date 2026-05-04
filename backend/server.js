import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";

const app = express();

const {
  PORT = 3000,
  GROQ_API_KEY,
  GROQ_MODEL = "llama-3.1-8b-instant",
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
} = process.env;

if (!GROQ_API_KEY) console.warn("Missing GROQ_API_KEY");
if (!SUPABASE_URL) console.warn("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) console.warn("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

app.disable("x-powered-by");

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
}));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "20mb" }));

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, max = 12000) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function sanitizeMode(mode) {
  const allowed = new Set(["chat", "notes", "flashcards", "quiz", "explain", "planner"]);
  return allowed.has(mode) ? mode : "chat";
}

function makeTitle(text) {
  const clean = safeText(text, 160);
  if (!clean) return "New chat";
  const title = clean
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return title || "New chat";
}

function modePrompt(mode) {
  switch (mode) {
    case "notes":
      return `Turn the user's content into polished study notes with:
- clear headings
- bullet points
- key formulas if relevant
- exam-ready phrasing
- concise but useful structure`;
    case "flashcards":
      return `Create 8 to 12 compact flashcards in Q/A format.
Keep them accurate and short.`;
    case "quiz":
      return `Create a 5-question multiple choice quiz from the content.
Include answers at the end with brief explanations.`;
    case "explain":
      return `Explain the content step by step in simple student-friendly language.`;
    case "planner":
      return `Turn the content into a study plan, revision roadmap, and priorities.`;
    default:
      return `You are Notebot, a premium student assistant.
Be clear, structured, and helpful.
Use markdown when useful.`;
  }
}

async function groqChat(messages, { stream = false, temperature = 0.35 } = {}) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      stream
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Groq error ${response.status}: ${errText || response.statusText}`);
  }

  return response;
}

async function groqText(messages, opts = {}) {
  const response = await groqChat(messages, { ...opts, stream: false });
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function ensureProfile(sessionId) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        session_id: sessionId,
        updated_at: nowIso()
      },
      { onConflict: "session_id" }
    );

  if (error) throw error;
}

async function getMemorySummary(sessionId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("memory_summary")
    .eq("session_id", sessionId)
    .limit(1);

  if (error) throw error;
  return data?.[0]?.memory_summary || "";
}

async function setMemorySummary(sessionId, summary) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        session_id: sessionId,
        memory_summary: summary,
        updated_at: nowIso()
      },
      { onConflict: "session_id" }
    );

  if (error) throw error;
}

async function getConversation(conversationId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function getConversations(sessionId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,mode,created_at,updated_at")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getMessages(conversationId, limit = 50) {
  const { data, error } = await supabase
    .from("messages")
    .select("role,content,attachments_json,ocr_text,mode,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function insertMessage(row) {
  const { error } = await supabase.from("messages").insert([row]);
  if (error) throw error;
}

async function updateConversation(conversationId, patch) {
  const { error } = await supabase
    .from("conversations")
    .update({
      ...patch,
      updated_at: nowIso()
    })
    .eq("id", conversationId);

  if (error) throw error;
}

async function summarizeMemory(existingSummary, latestUser, latestAssistant) {
  const prompt = `
You maintain a compact memory summary for a student assistant.

Rules:
- keep only stable and useful facts/preferences
- remove fluff
- keep it under 120 words
- plain text only

Existing memory:
${existingSummary || "(none)"}

Latest turn:
User: ${latestUser}
Assistant: ${latestAssistant}
`.trim();

  const summary = await groqText(
    [
      {
        role: "system",
        content: "Compress memory into a short stable profile."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    { temperature: 0.2 }
  );

  return summary || existingSummary || "";
}

async function streamGroq(messages, res) {
  const response = await groqChat(messages, { stream: true, temperature: 0.35 });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const token = parsed?.choices?.[0]?.delta?.content || "";
        if (token) {
          fullText += token;
          res.write(token);
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }

  if (buffer.trim().startsWith("data:")) {
    const data = buffer.trim().slice(5).trim();
    if (data && data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data);
        const token = parsed?.choices?.[0]?.delta?.content || "";
        if (token) {
          fullText += token;
          res.write(token);
        }
      } catch {
        // ignore
      }
    }
  }

  return fullText.trim();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "Notebot AI API" });
});

app.post("/conversations", async (req, res) => {
  try {
    const sessionId = safeText(req.body?.sessionId, 200);
    const mode = sanitizeMode(req.body?.mode || "chat");

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    await ensureProfile(sessionId);

    const { data, error } = await supabase
      .from("conversations")
      .insert([
        {
          session_id: sessionId,
          title: "New chat",
          mode,
          updated_at: nowIso()
        }
      ])
      .select("*")
      .single();

    if (error) throw error;

    res.json({ conversation: data });
  } catch (err) {
    console.error("CREATE CONVERSATION ERROR:", err);
    res.status(500).json({
      error: "CREATE_CONVERSATION_FAILED",
      message: err.message
    });
  }
});

app.get("/conversations", async (req, res) => {
  try {
    const sessionId = safeText(req.query.sessionId, 200);
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const conversations = await getConversations(sessionId);
    res.json({ conversations });
  } catch (err) {
    console.error("LIST CONVERSATIONS ERROR:", err);
    res.status(500).json({
      error: "LIST_CONVERSATIONS_FAILED",
      message: err.message
    });
  }
});

app.get("/messages/:conversationId", async (req, res) => {
  try {
    const conversationId = safeText(req.params.conversationId, 80);
    if (!conversationId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    const messages = await getMessages(conversationId, 50);
    res.json({ messages });
  } catch (err) {
    console.error("LOAD MESSAGES ERROR:", err);
    res.status(500).json({
      error: "LOAD_MESSAGES_FAILED",
      message: err.message
    });
  }
});

app.get("/memory/:sessionId", async (req, res) => {
  try {
    const sessionId = safeText(req.params.sessionId, 200);
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const memorySummary = await getMemorySummary(sessionId);
    res.json({ memorySummary });
  } catch (err) {
    console.error("LOAD MEMORY ERROR:", err);
    res.status(500).json({
      error: "LOAD_MEMORY_FAILED",
      message: err.message
    });
  }
});

app.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const conversationId = safeText(req.params.conversationId, 80);
    if (!conversationId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (messagesError) throw messagesError;

    const { error: conversationError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (conversationError) throw conversationError;

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE CONVERSATION ERROR:", err);
    res.status(500).json({
      error: "DELETE_CONVERSATION_FAILED",
      message: err.message
    });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const sessionId = safeText(req.body?.sessionId, 200);
    const conversationId = safeText(req.body?.conversationId, 80);
    const text = safeText(req.body?.text, 12000);
    const ocrText = safeText(req.body?.ocrText, 20000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const mode = sanitizeMode(req.body?.mode || "chat");

    if (!sessionId || !conversationId) {
      return res.status(400).json({ error: "Missing sessionId or conversationId" });
    }

    if (!text && !ocrText && attachments.length === 0) {
      return res.status(400).json({ error: "Empty message" });
    }

    await ensureProfile(sessionId);

    const convo = await getConversation(conversationId);
    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const priorMessages = await getMessages(conversationId, 16);
    const memorySummary = await getMemorySummary(sessionId);

    const attachmentNames = attachments
      .map(a => `- ${safeText(a?.name, 120)} (${safeText(a?.type, 80)})`)
      .join("\n");

    const userContext = [
      text ? `User message:\n${text}` : "",
      ocrText ? `OCR text from images:\n${ocrText}` : "",
      attachmentNames ? `Attachments:\n${attachmentNames}` : ""
    ].filter(Boolean).join("\n\n").trim();

    const systemPrompt = `
${modePrompt(mode)}

You are Notebot, a premium student assistant inside a ChatGPT-style product.

Rules:
- Be accurate and structured.
- Use markdown when useful.
- If the user asks for notes, use headings and bullets.
- If the user asks for flashcards, format as Q:/A:.
- If the user asks for a quiz, give answers at the end.
- If OCR text exists, use it.
- Keep it readable on mobile screens.
`.trim();

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Long-term memory summary:\n${memorySummary || "(none yet)"}`.trim()
      },
      ...priorMessages.map(m => ({
        role: m.role,
        content: m.content
      })),
      {
        role: "user",
        content: userContext
      }
    ];

    const reply = await groqText(messages, { temperature: 0.35 });

    await insertMessage({
      conversation_id: conversationId,
      role: "user",
      content: userContext,
      attachments_json: attachments.map(a => ({
        name: a?.name || "file",
        type: a?.type || "unknown",
        size: a?.size || 0
      })),
      ocr_text: ocrText,
      mode
    });

    await insertMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
      attachments_json: [],
      ocr_text: "",
      mode
    });

    await updateConversation(conversationId, {
      title: convo.title === "New chat" ? makeTitle(text || ocrText) : convo.title,
      mode
    });

    const updatedMemory = await summarizeMemory(
      memorySummary,
      text || ocrText || "(attachment only)",
      reply
    );

    await setMemorySummary(sessionId, updatedMemory);

    res.json({ reply });
  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({
      error: "CHAT_FAILED",
      message: err.message
    });
  }
});

app.post("/chat/stream", async (req, res) => {
  const sessionId = safeText(req.body?.sessionId, 200);
  const conversationId = safeText(req.body?.conversationId, 80);
  const text = safeText(req.body?.text, 12000);
  const ocrText = safeText(req.body?.ocrText, 20000);
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const mode = sanitizeMode(req.body?.mode || "chat");

  if (!sessionId || !conversationId) {
    return res.status(400).json({ error: "Missing sessionId or conversationId" });
  }

  if (!text && !ocrText && attachments.length === 0) {
    return res.status(400).json({ error: "Empty message" });
  }

  try {
    await ensureProfile(sessionId);

    const convo = await getConversation(conversationId);
    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const priorMessages = await getMessages(conversationId, 16);
    const memorySummary = await getMemorySummary(sessionId);

    const attachmentNames = attachments
      .map(a => `- ${safeText(a?.name, 120)} (${safeText(a?.type, 80)})`)
      .join("\n");

    const userContext = [
      text ? `User message:\n${text}` : "",
      ocrText ? `OCR text from images:\n${ocrText}` : "",
      attachmentNames ? `Attachments:\n${attachmentNames}` : ""
    ].filter(Boolean).join("\n\n").trim();

    const systemPrompt = `
${modePrompt(mode)}

You are Notebot, a premium student assistant inside a ChatGPT-style product.

Rules:
- Be accurate and structured.
- Use markdown when useful.
- If the user asks for notes, use headings and bullets.
- If the user asks for flashcards, format as Q:/A:.
- If the user asks for a quiz, give answers at the end.
- If OCR text exists, use it.
- Keep it readable on mobile screens.
`.trim();

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Long-term memory summary:\n${memorySummary || "(none yet)"}`.trim()
      },
      ...priorMessages.map(m => ({
        role: m.role,
        content: m.content
      })),
      {
        role: "user",
        content: userContext
      }
    ];

    await insertMessage({
      conversation_id: conversationId,
      role: "user",
      content: userContext,
      attachments_json: attachments.map(a => ({
        name: a?.name || "file",
        type: a?.type || "unknown",
        size: a?.size || 0
      })),
      ocr_text: ocrText,
      mode
    });

    await updateConversation(conversationId, {
      title: convo.title === "New chat" ? makeTitle(text || ocrText) : convo.title,
      mode
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.flushHeaders?.();

    let assistantText = "";

    try {
      assistantText = await streamGroq(messages, res);
    } catch (streamErr) {
      console.error("STREAM ERROR:", streamErr);
      res.write("\n\n[Response interrupted]");
    }

    res.end();

    try {
      await insertMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: assistantText || "",
        attachments_json: [],
        ocr_text: "",
        mode
      });

      const updatedMemory = await summarizeMemory(
        memorySummary,
        text || ocrText || "(attachment only)",
        assistantText
      );

      await setMemorySummary(sessionId, updatedMemory);

      await updateConversation(conversationId, {
        title: convo.title === "New chat" ? makeTitle(text || ocrText) : convo.title,
        mode
      });
    } catch (postErr) {
      console.error("POST-PROCESS ERROR:", postErr);
    }
  } catch (err) {
    console.error("CHAT STREAM ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "CHAT_STREAM_FAILED",
        message: err.message
      });
    } else {
      res.end();
    }
  }
});

app.post("/export/pdf", async (req, res) => {
  try {
    const conversationId = safeText(req.body?.conversationId, 80);
    const title = safeText(req.body?.title, 120) || "Notebot Notes";

    if (!conversationId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    const convo = await getConversation(conversationId);
    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = await getMessages(conversationId, 200);
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title.replace(/[^\w\- ]+/g, "").slice(0, 50) || "notebot"}.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(20).text(title, { align: "center" });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#666").text(`Generated by Notebot • ${new Date().toLocaleString()}`, {
      align: "center"
    });
    doc.moveDown(1.2);
    doc.fillColor("#000");

    for (const msg of messages) {
      doc.fontSize(12).font("Helvetica-Bold").text(msg.role === "user" ? "You" : "Notebot");
      doc.font("Helvetica").text(msg.content || "");
      doc.moveDown(0.8);
    }

    doc.end();
  } catch (err) {
    console.error("PDF EXPORT ERROR:", err);
    res.status(500).json({
      error: "PDF_EXPORT_FAILED",
      message: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Notebot AI API running on port ${PORT}`);
});
