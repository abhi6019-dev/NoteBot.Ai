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
   UTILITY: SAFE RESPONSE
========================= */
const ok = (res, data) => res.json({ success: true, data });
const fail = (res, msg, code = 500) =>
  res.status(code).json({ success: false, error: msg });

/* =========================
   HEALTH
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Notebot AI Pro 🚀" });
});

/* =========================
   OCR (ROBUST VISION PIPELINE)
========================= */
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer) return fail(res, "No image uploaded", 400);

    const base64 = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text clearly and preserve structure."
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

    if (!text.trim()) return fail(res, "OCR_EMPTY");

    return ok(res, { text });

  } catch (err) {
    console.error(err);
    return fail(res, err.message);
  }
});

/* =========================
   NOTES ENGINE (SMART STRUCTURING)
========================= */
app.post("/notes", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text?.trim()) return fail(res, "EMPTY_INPUT", 400);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `
You are a world-class academic assistant.

Convert text into:
- Headings
- Bullet points
- Key formulas (if any)
- Exam revision format
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return ok(res, {
      notes: response?.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error(err);
    return fail(res, "NOTES_FAILED");
  }
});

/* =========================
   DIAGRAM EXPLAINER (ADVANCED)
========================= */
app.post("/diagram", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text?.trim()) return fail(res, "EMPTY_INPUT", 400);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "Explain diagrams step-by-step with logic flow and simple language."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return ok(res, {
      explanation: response?.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error(err);
    return fail(res, "DIAGRAM_FAILED");
  }
});

/* =========================
   PDF EXPORT (CLEAN STYLE)
========================= */
app.post("/pdf", (req, res) => {
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=notebot.pdf");

  doc.pipe(res);

  doc.fontSize(20).text("Notebot AI Notes", { align: "center" });
  doc.moveDown();

  const text = req.body?.notes || "";

  text.split("\n").forEach(line => {
    doc.fontSize(11).text(line);
  });

  doc.end();
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Notebot AI Pro running"));
