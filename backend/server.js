import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const app = express();

const {
  PORT = 3000,
  CORS_ORIGIN = "*",
  GROQ_API_KEY,
  GROQ_MODEL = "llama-3.1-8b-instant",
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
} = process.env;

if (!GROQ_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Missing one or more required environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

const ai = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

const corsOrigins = CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",").map(s => s.trim());

app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: "20mb" }));

function nowIso() {
  return new Date().toISOString();
}

function safeTrim(value, max = 12000) {
  if (!value) return "";
  return String(value).trim().slice(0, max);
}

function makeTitleFromText(text) {
  const clean = safeTrim(text, 120);
  if (!clean) return "New chat";
  const words = clean
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
  return words.join(" ") || "New chat";
}

function modePrompt(mode) {
  switch (mode) {
    case "notes":
      return `You are Notebot, a world-class study assistant.
Turn the user's content into polished revision notes with:
- clear headings
- bullets
- key terms
- formulas if relevant
- compact exam-friendly phrasing`;
    case "flashcards":
      return `You are Notebot.
Create 8-12 concise flashcards in a clean Q/A format.
Keep answers short, accurate, and exam-ready.`;
    case "quiz":
      return `You are Notebot.
Create a 5-question multiple choice quiz from the user's content.
Provide answers at the end with brief explanations.`;
    case "explain":
      return `You are Notebot.
Explain the user's content simply, step by step, like a great teacher.`;
    case "planner":
      return `You are Notebot.
Create a practical study plan and revision roadmap from the user's content.`;
    default:
      return `You are Notebot, a fast, accurate AI study assistant.
Be concise, structured, and useful.`;
  }
}

function buildUserContext({ text, ocrText, attachments }) {
  const parts = [];
  if (text) parts.push(`User message:\n${text}`);
  if (ocrText) parts.push(`OCR text from attachments:\n${ocrText}`);
  if (attachments?.length) {
    const list = attachments.map(a => `- ${a.name || "file"} (${a.type || "unknown"})`).join("\n");
    parts.push(`Attachments:\n${list}`);
  }
  return parts.join("\n\n").trim();
}

async function ensureProfile(sessionId) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { session_id: sessionId, updated_at: nowIso() },
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

async function getMessages(conversationId, limit = 20) {
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
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", conversationId);

  if (error) throw error;
}

async function summarizeMemory({ existingSummary, latestUser, latestAssistant }) {
  const prompt = `
You maintain a compact memory summary for a student study assistant.

Rules:
- Keep only stable, useful facts and preferences.
- Remove fluff.
- Keep under 120 words.
- Return plain text only.

Existing memory:
${existingSummary || "(none)"}

Latest turn:
User: ${latestUser}
Assistant: ${latestAssistant}
`.trim();

  const completion = await ai.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: "Compress memory into a short stable profile." },
      { role: "user", content: prompt }
    ]
  });

  return completion.choices?.[0]?.message?.content?.trim() || existingSummary || "";
}

async function streamGroqResponse(messages, res) {
  const stream = await ai.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.35,
    stream: true,
    messages
  });

  let fullText = "";

  for await (const part of stream) {
    const token = part.choices?.[0]?.delta?.content || "";
    if (token) {
      fullText += token;
      res.write(token);
    }
  }

  return fullText;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "Notebot AI API" });
});

app.post("/conversations", async (req, res) => {
  try {
    const sessionId = safeTrim(req.body?.sessionId, 200);
    const mode = ["chat", "notes", "flashcards", "quiz", "explain", "planner"].includes(req.body?.mode)
      ? req.body.mode
      : "chat";

    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

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
    res.status(500).json({ error: "CREATE_CONVERSATION_FAILED", message: err.message });
  }
});

app.get("/conversations", async (req, res) => {
  try {
    const sessionId = safeTrim(req.query.sessionId, 200);
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const conversations = await getConversations(sessionId);
    res.json({ conversations });
  } catch (err) {
    console.error("LIST CONVERSATIONS ERROR:", err);
    res.status(500).json({ error: "LIST_CONVERSATIONS_FAILED", message: err.message });
  }
});

app.get("/messages/:conversationId", async (req, res) => {
  try {
    const conversationId = safeTrim(req.params.conversationId, 80);
    if (!conversationId) return res.status(400).json({ error: "Missing conversationId" });

    const messages = await getMessages(conversationId, 50);
    res.json({ messages });
  } catch (err) {
    console.error("LOAD MESSAGES ERROR:", err);
    res.status(500).json({ error: "LOAD_MESSAGES_FAILED", message: err.message });
  }
});

app.get("/memory/:sessionId", async (req, res) => {
  try {
    const sessionId = safeTrim(req.params.sessionId, 200);
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const memorySummary = await getMemorySummary(sessionId);
    res.json({ memorySummary });
  } catch (err) {
    console.error("LOAD MEMORY ERROR:", err);
    res.status(500).json({ error: "LOAD_MEMORY_FAILED", message: err.message });
  }
});

app.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const conversationId = safeTrim(req.params.conversationId, 80);
    if (!conversationId) return res.status(400).json({ error: "Missing conversationId" });

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
    res.status(500).json({ error: "DELETE_CONVERSATION_FAILED", message: err.message });
  }
});

app.post("/chat/stream", async (req, res) => {
  const sessionId = safeTrim(req.body?.sessionId, 200);
  const conversationId = safeTrim(req.body?.conversationId, 80);
  const text = safeTrim(req.body?.text, 12000);
  const ocrText = safeTrim(req.body?.ocrText, 20000);
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const mode = ["chat", "notes", "flashcards", "quiz", "explain", "planner"].includes(req.body?.mode)
    ? req.body.mode
    : "chat";

  if (!sessionId || !conversationId) {
    return res.status(400).json({ error: "Missing sessionId or conversationId" });
  }

  if (!text && !ocrText && attachments.length === 0) {
    return res.status(400).json({ error: "Empty message" });
  }

  try {
    await ensureProfile(sessionId);

    const convo = await getConversation(conversationId);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });

    const priorMessages = await getMessages(conversationId, 16);
    const memorySummary = await getMemorySummary(sessionId);

    const userContext = buildUserContext({
      text,
      ocrText,
      attachments: attachments.map(a => ({
        name: a?.name,
        type: a?.type
      }))
    });

    const titleCandidate = convo.title === "New chat" ? makeTitleFromText(text || ocrText) : convo.title;

    const systemPrompt = `${modePrompt(mode)}

You are Notebot, a premium study assistant inside a ChatGPT-style product.
Always be:
- accurate
- visually structured
- concise when the user wants notes
- friendly and polished
- useful on mobile screens

If the user uploads images, use the OCR text that comes with the message.
If the user asks for notes, use markdown headings and bullet points.
If the user asks for flashcards, format as Q: / A:.
If the user asks for a quiz, give numbered questions and answers at the end.`.trim();

    const contextMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Long-term memory summary:\n${memorySummary || "(none yet)"}`.trim()
      },
      ...priorMessages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userContext }
    ];

    await insertMessage({
      conversation_id: conversationId,
      role: "user",
      content: userContext,
      attachments_json: JSON.stringify(
        attachments.map(a => ({
          name: a?.name || "file",
          type: a?.type || "unknown",
          size: a?.size || 0
        }))
      ),
      ocr_text: ocrText,
      mode
    });

    await updateConversation(conversationId, {
      title: titleCandidate,
      mode
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.flushHeaders?.();

    let assistantText = "";

    try {
      const streamed = await streamGroqResponse(contextMessages, res);
      assistantText = streamed;
    } catch (streamErr) {
      console.error("STREAM ERROR:", streamErr);
      res.write("\n\n[Response interrupted]");
    }

    res.end();

    await insertMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantText || "",
      attachments_json: "[]",
      ocr_text: "",
      mode
    });

    await updateConversation(conversationId, { title: titleCandidate, mode });

    const updatedMemory = await summarizeMemory({
      existingSummary: memorySummary,
      latestUser: text || ocrText || "(attachment only)",
      latestAssistant: assistantText
    });

    await setMemorySummary(sessionId, updatedMemory);
  } catch (err) {
    console.error("CHAT STREAM ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "CHAT_STREAM_FAILED", message: err.message });
    } else {
      res.end();
    }
  }
});

app.post("/export/pdf", async (req, res) => {
  try {
    const conversationId = safeTrim(req.body?.conversationId, 80);
    const title = safeTrim(req.body?.title, 120) || "Notebot Notes";

    if (!conversationId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    const convo = await getConversation(conversationId);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });

    const messages = await getMessages(conversationId, 200);

    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${title.replace(/[^\w\- ]+/g, "").slice(0, 50) || "notebot"}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).text(title, { align: "center" });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#666").text(`Generated by Notebot • ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown(1.2);
    doc.fillColor("#000");

    for (const msg of messages) {
      doc.fontSize(12).fillColor(msg.role === "user" ? "#0f172a" : "#111827");
      doc.font("Helvetica-Bold").text(msg.role === "user" ? "You" : "Notebot");
      doc.font("Helvetica").text(msg.content || "");
      doc.moveDown(0.8);
    }

    doc.end();
  } catch (err) {
    console.error("PDF EXPORT ERROR:", err);
    res.status(500).json({ error: "PDF_EXPORT_FAILED", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Notebot AI API running on port ${PORT}`);
});
