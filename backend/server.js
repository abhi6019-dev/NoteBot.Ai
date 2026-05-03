import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

/* =========================
   NORMAL CHAT (FILES INCLUDED)
========================= */
app.post("/chat", upload.array("files"), async (req, res) => {
  const text = req.body.text;

  // convert images to text (placeholder)
  let extracted = "";

  if (req.files) {
    for (let f of req.files) {
      extracted += "[image uploaded]\n";
    }
  }

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
          content: "You are Notebot AI. Be concise and structured."
        },
        {
          role: "user",
          content: text + "\n" + extracted
        }
      ]
    })
  });

  const data = await response.json();

  res.json({
    reply: data?.choices?.[0]?.message?.content || ""
  });
});

/* =========================
   STREAMING ENDPOINT (CHATGPT STYLE)
========================= */
app.post("/chat-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  const text = req.body.text;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      stream: true,
      messages: [
        {
          role: "user",
          content: text
        }
      ]
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    res.write(decoder.decode(value));
  }

  res.end();
});

app.listen(3000, () => console.log("ChatGPT Notebot running"));
