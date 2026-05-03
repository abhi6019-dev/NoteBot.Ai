import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import PDFDocument from "pdfkit";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   MIDDLEWARE
========================= */
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

/* =========================
   HEALTH CHECK (IMPORTANT)
========================= */
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Notebot AI Backend",
    time: new Date().toISOString()
  });
});

/* =========================
   SAFE ERROR WRAPPER
========================= */
const safe = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("🔥 UNHANDLED ERROR:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message
    });
  });
};

/* =========================
   OCR (VISION AI - STABLE)
========================= */
app.post("/ocr", upload.single("image"), safe(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  try {
    const base64 = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all readable text accurately from this image."
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

    const text = response?.choices?.[0]?.message?.content?.trim();

    return res.json({
      text: text || ""
    });

  } catch (err) {
    console.error("OCR ERROR:", err);

    return res.status(500).json({
      error: "OCR_FAILED",
      message: "Failed to process image"
    });
  }
}));

/* =========================
   NOTES GENERATION (STABLE)
========================= */
app.post("/notes", safe(async (req, res) => {
  const text = req.body?.text;

  if (!text || text.trim().length < 3) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "No valid text received from OCR"
    });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Convert input into structured study notes with headings, bullet points, and simple explanations."
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
}));

/* =========================
   DIAGRAM EXPLANATION
========================= */
app.post("/diagram", safe(async (req, res) => {
  const text = req.body?.text;

  if (!text) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "No text provided"
    });
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
}));

/* =========================
   PDF GENERATION (STABLE)
========================= */
app.post("/pdf", safe((req, res) => {
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=notebot-notes.pdf"
  );

  doc.pipe(res);

  const text = req.body?.notes || "No content provided";

  doc.fontSize(18).text("Notebot AI Notes", { align: "center" });
  doc.moveDown();

  text.split("\n").forEach((line) => {
    doc.fontSize(11).text(line, { align: "left" });
  });

  doc.end();
}));

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Notebot backend running on port ${PORT}`);
});
