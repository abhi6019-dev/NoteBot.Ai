const BACKEND = "https://YOUR-RENDER-URL.onrender.com";

let images = [];

document.getElementById("fileInput").addEventListener("change", e => {
  images = [...e.target.files];
});

async function generateNotes() {
  let text = "";

  for (let img of images) {
    let fd = new FormData();
    fd.append("image", img);

    let res = await fetch(BACKEND + "/ocr", {
      method: "POST",
      body: fd
    });

    let data = await res.json();
    text += data.text + "\n";
  }

  let res2 = await fetch(BACKEND + "/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  let data2 = await res2.json();
  document.getElementById("output").value = data2.notes;
}

async function explainDiagram() {
  let text = document.getElementById("output").value;

  let res = await fetch(BACKEND + "/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  let data = await res.json();
  document.getElementById("output").value = data.explanation;
}

async function downloadPDF() {
  let res = await fetch(BACKEND + "/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: document.getElementById("output").value })
  });

  let blob = await res.blob();
  let url = URL.createObjectURL(blob);

  let a = document.createElement("a");
  a.href = url;
  a.download = "notes.pdf";
  a.click();
}
  hideProgress();
}
