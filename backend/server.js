import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

/* =========================
   OCR (SIMPLIFIED MOCK / REPLACE LATER)
========================= */
app.post("/ocr", async (req, res) => {
  try {
    res.json({ text: "Sample extracted text from image (replace with OCR later)" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   NOTES (GROQ FREE AI)
========================= */
app.post("/notes", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "Convert into clean exam-ready notes with headings and bullet points."
          },
          {
            role: "user",
            content: text
          }
        ]
      })
    });

    const data = await response.json();

    const notes = data?.choices?.[0]?.message?.content || "No notes generated";

    res.json({ notes });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   DIAGRAM EXPLAINER
========================= */
app.post("/diagram", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "Explain diagrams simply step by step."
          },
          {
            role: "user",
            content: text
          }
        ]
      })
    });

    const data = await response.json();

    res.json({
      explanation: data?.choices?.[0]?.message?.content || ""
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Notebot running"));
