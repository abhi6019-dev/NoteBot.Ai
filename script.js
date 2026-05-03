
const BACKEND = "https://notebot-ai.onrender.com";

let images = [];

/* =========================
   DOM ELEMENTS
========================= */
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const output = document.getElementById("output");
const loading = document.getElementById("loading");

/* =========================
   FILE HANDLING
========================= */
fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

function handleFiles(files) {
  [...files].forEach((file) => {
    if (!file.type.startsWith("image/")) return;

    images.push(file);

    const reader = new FileReader();

    reader.onload = () => {
      const card = document.createElement("div");
      card.className = "img-card";

      const img = document.createElement("img");
      img.src = reader.result;

      const btn = document.createElement("button");
      btn.className = "remove";
      btn.innerText = "×";

      btn.onclick = () => {
        card.remove();
        images = images.filter((i) => i !== file);
      };

      card.appendChild(img);
      card.appendChild(btn);
      preview.appendChild(card);
    };

    reader.readAsDataURL(file);
  });
}

/* =========================
   LOADING CONTROL
========================= */
function showLoading(text = "Processing AI...") {
  loading.innerText = text;
  loading.classList.remove("hidden");
}

function hideLoading() {
  loading.classList.add("hidden");
}

/* =========================
   GENERATE NOTES (OCR → AI)
========================= */
async function generateNotes() {
  if (!images.length) {
    alert("Please upload images first");
    return;
  }

  try {
    showLoading("Reading images...");

    let extractedText = "";

    for (let i = 0; i < images.length; i++) {
      const fd = new FormData();
      fd.append("image", images[i]);

      const res = await fetch(`${BACKEND}/ocr`, {
        method: "POST",
        body: fd
      });

      const data = await res.json();
      extractedText += (data.text || "") + "\n";
    }

    showLoading("Generating AI notes...");

    const res2 = await fetch(`${BACKEND}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: extractedText })
    });

    const data2 = await res2.json();

    output.value = data2.notes || "No notes generated.";

  } catch (err) {
    console.error("Generate Notes Error:", err);
    output.value = "Error generating notes.";
  } finally {
    hideLoading();
  }
}

/* =========================
   DIAGRAM EXPLANATION
========================= */
async function explainDiagram() {
  if (!output.value.trim()) {
    alert("No content to analyze");
    return;
  }

  try {
    showLoading("Analyzing diagram...");

    const res = await fetch(`${BACKEND}/diagram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: output.value })
    });

    const data = await res.json();

    output.value = data.explanation || "No explanation generated.";

  } catch (err) {
    console.error("Diagram Error:", err);
    output.value = "Failed to explain diagram.";
  } finally {
    hideLoading();
  }
}

/* =========================
   PDF DOWNLOAD
========================= */
async function downloadPDF() {
  try {
    showLoading("Creating PDF...");

    const res = await fetch(`${BACKEND}/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ notes: output.value })
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "notebot-notes.pdf";
    a.click();

    URL.revokeObjectURL(url);

  } catch (err) {
    console.error("PDF Error:", err);
    alert("PDF generation failed");
  } finally {
    hideLoading();
  }
}

/* =========================
   GLOBAL EXPORT (CRITICAL FIX)
========================= */
window.generateNotes = generateNotes;
window.explainDiagram = explainDiagram;
window.downloadPDF = downloadPDF;
