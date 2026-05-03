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

app.use(cors({ origin: "*" }));
app.use(express.json());

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("Notebot AI Backend Running 🚀");
});

/* ---------------- OCR (VISION) ---------------- */
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text clearly from this image." },
            { type: "image_url", image_url: { url: base64 } }
          ]
        }
      ]
    });

    res.json({
      text: response.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error("OCR ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- NOTES ---------------- */
app.post("/notes", async (req, res) => {
  try {
    const text = req.body.text;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "No text provided" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Convert text into structured exam-ready notes with headings, bullet points, and simple explanations."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    res.json({
      notes: response.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error("NOTES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- DIAGRAM ---------------- */
app.post("/diagram", async (req, res) => {
  try {
    const text = req.body.text;

    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Explain diagrams clearly: components, flow, and meaning step-by-step."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    res.json({
      explanation: response.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    console.error("DIAGRAM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- PDF ---------------- */
app.post("/pdf", (req, res) => {
  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=notebot.pdf");

  doc.pipe(res);

  const text = req.body.notes || "No content";

  doc.fontSize(18).text("Notebot AI Notes", { align: "center" });
  doc.moveDown();

  text.split("\n").forEach(line => {
    doc.fontSize(12).text(line);
  });

  doc.end();
});

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
