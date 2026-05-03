import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import PDFDocument from "pdfkit";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Notebot AI running 🚀" });
});

/* =========================
   OCR (VISION FIXED)
========================= */
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64 = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text clearly from this image."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64}`
              }
            }
          ]
        }
      ]
    });

    const text = response?.choices?.[0]?.message?.content || "";

    return res.json({ text });

  } catch (err) {
    console.error("OCR ERROR:", err);
    return res.status(500).json({
      error: "OCR_FAILED",
      message: err.message
    });
  }
});

/* =========================
   NOTES GENERATION
========================= */
app.post("/notes", async (req, res) => {
  try {
    const text = req.body?.text;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "EMPTY_INPUT"
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Convert text into clean exam-ready structured notes with headings and bullet points."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return res.json({
      notes: response?.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error("NOTES ERROR:", err);
    return res.status(500).json({
      error: "NOTES_FAILED",
      message: err.message
    });
  }
});

/* =========================
   DIAGRAM EXPLANATION
========================= */
app.post("/diagram", async (req, res) => {
  try {
    const text = req.body?.text;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "EMPTY_INPUT" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Explain diagrams step-by-step in simple student-friendly language."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return res.json({
      explanation: response?.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error("DIAGRAM ERROR:", err);
    return res.status(500).json({
      error: "DIAGRAM_FAILED",
      message: err.message
    });
  }
});

/* =========================
   PDF EXPORT
========================= */
app.post("/pdf", (req, res) => {
  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=notebot.pdf");

  doc.pipe(res);

  doc.fontSize(18).text("Notebot AI Notes", { align: "center" });
  doc.moveDown();

  const text = req.body?.notes || "";

  text.split("\n").forEach(line => {
    doc.fontSize(11).text(line);
  });

  doc.end();
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Notebot AI running on", PORT));
