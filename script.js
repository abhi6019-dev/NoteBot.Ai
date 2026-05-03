const BACKEND = "https://notebot-ai.onrender.com/";

let images = [];

document.getElementById("fileInput").addEventListener("change", (e) => {
  images = [...e.target.files];
  render();
});

function render() {
  const preview = document.getElementById("preview");
  preview.innerHTML = "";

  images.forEach(file => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = document.createElement("img");
      img.src = reader.result;
      preview.appendChild(img);
    };

    reader.readAsDataURL(file);
  });
}

function showLoader(state) {
  document.getElementById("loader").classList.toggle("hidden", !state);
}

/* =========================
   NOTES PIPELINE
========================= */
async function generateNotes() {
  showLoader(true);

  try {
    let text = "";

    for (let img of images) {
      const fd = new FormData();
      fd.append("image", img);

      const res = await fetch(BACKEND + "/ocr", {
        method: "POST",
        body: fd
      });

      const data = await res.json();
      text += data.data.text + "\n";
    }

    const res2 = await fetch(BACKEND + "/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data2 = await res2.json();
    document.getElementById("output").value = data2.data.notes;

  } finally {
    showLoader(false);
  }
}

/* =========================
   DIAGRAM
========================= */
async function explainDiagram() {
  const text = document.getElementById("output").value;

  const res = await fetch(BACKEND + "/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  const data = await res.json();
  document.getElementById("output").value = data.data.explanation;
}

/* =========================
   PDF
========================= */
async function downloadPDF() {
  const res = await fetch(BACKEND + "/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: document.getElementById("output").value })
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "notebot.pdf";
  a.click();
}
