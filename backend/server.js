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

/* ---------------- ROOT ---------------- */
app.get("/", (req, res) => {
  res.send("Notebot AI Backend Running 🚀");
});

/* ---------------- OCR (VISION AI) ---------------- */
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text from this image." },
            { type: "image_url", image_url: { url: base64 } }
          ]
        }
      ]
    });

    res.json({ text: response.choices[0].message.content });

  } catch (err) {
    res.status(500).json({ error: "OCR failed" });
  }
});

/* ---------------- NOTES ---------------- */
app.post("/notes", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Convert text into:
- Structured study notes
- Headings
- Bullet points
- Exam revision format
          `
        },
        { role: "user", content: text }
      ]
    });

    res.json({ notes: response.choices[0].message.content });

  } catch (err) {
    res.status(500).json({ error: "Notes failed" });
  }
});

/* ---------------- DIAGRAM EXPLANATION ---------------- */
app.post("/diagram", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Explain diagrams clearly:
- What it shows
- Labels meaning
- Step-by-step explanation
          `
        },
        { role: "user", content: text }
      ]
    });

    res.json({ explanation: response.choices[0].message.content });

  } catch (err) {
    res.status(500).json({ error: "Diagram failed" });
  }
});

/* ---------------- PDF ---------------- */
app.post("/pdf", (req, res) => {
  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=notebot.pdf");

  doc.pipe(res);

  const text = req.body.notes || "";

  doc.fontSize(20).text("📒 Notebot AI Notes", { align: "center" });
  doc.moveDown();

  text.split("\n").forEach(line => {
    if (line.startsWith("#")) {
      doc.fontSize(16).text(line.replace("#", ""), { underline: true });
    } else if (line.startsWith("-")) {
      doc.fontSize(12).text("• " + line.replace("-", ""));
    } else {
      doc.fontSize(12).text(line);
    }
    doc.moveDown(0.3);
  });

  doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
