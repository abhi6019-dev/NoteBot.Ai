import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CHAT AI (GROQ FREE AI)
========================= */
app.post("/chat", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
You are Notebot AI, a study assistant.
Give short, clear, structured answers.
`
          },
          {
            role: "user",
            content: text
          }
        ]
      })
    });

    const data = await response.json();

    const reply = data?.choices?.[0]?.message?.content || "No response";

    res.json({ reply });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(3000, () => console.log("Notebot ChatGPT UI running"));
