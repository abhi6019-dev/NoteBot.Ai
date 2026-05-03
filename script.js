const BACKEND = "https://YOUR-RENDER-URL.onrender.com";

const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const output = document.getElementById("output");

let images = [];

/* ---------------- FILE HANDLING (FIXED) ---------------- */
fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

function handleFiles(files) {
  [...files].forEach(file => {
    if (!file.type.startsWith("image/")) return;

    images.push(file);

    const reader = new FileReader();

    reader.onload = () => {
      const div = document.createElement("div");
      div.className = "img-card";

      const img = document.createElement("img");
      img.src = reader.result;

      const btn = document.createElement("button");
      btn.className = "remove";
      btn.innerText = "×";

      btn.onclick = () => {
        div.remove();
        images = images.filter(i => i !== file);
      };

      div.appendChild(img);
      div.appendChild(btn);
      preview.appendChild(div);
    };

    reader.readAsDataURL(file);
  });
}

/* ---------------- OCR + NOTES ---------------- */
async function generateNotes() {
  if (!images.length) {
    alert("Upload images first");
    return;
  }

  let text = "";

  for (let img of images) {
    const fd = new FormData();
    fd.append("image", img);

    const res = await fetch(BACKEND + "/ocr", {
      method: "POST",
      body: fd
    });

    const data = await res.json();
    text += data.text + "\n";
  }

  const res2 = await fetch(BACKEND + "/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  const data2 = await res2.json();
  output.value = data2.notes;
}

/* ---------------- DIAGRAM ---------------- */
async function explainDiagram() {
  const res = await fetch(BACKEND + "/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: output.value })
  });

  const data = await res.json();
  output.value = data.explanation;
}

/* ---------------- PDF ---------------- */
async function downloadPDF() {
  const res = await fetch(BACKEND + "/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: output.value })
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "notes.pdf";
  a.click();
}
