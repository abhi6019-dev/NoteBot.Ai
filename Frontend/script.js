const dropBox = document.getElementById("dropBox");
const fileElem = document.getElementById("fileElem");
const preview = document.getElementById("preview");
const extractBtn = document.getElementById("extractBtn");
const notesOutput = document.getElementById("notesOutput");
const downloadBtn = document.getElementById("downloadBtn");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");

let images = [];

function showProgress() {
  progressContainer.style.display = "block";
  progressBar.style.width = "10%"; // Start
}

function updateProgress(percent) {
  progressBar.style.width = percent + "%";
}

function hideProgress() {
  progressBar.style.width = "100%";
  setTimeout(() => {
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
  }, 500);
}

dropBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropBox.classList.add("highlight");
});

dropBox.addEventListener("dragleave", () => {
  dropBox.classList.remove("highlight");
});

dropBox.addEventListener("drop", (e) => {
  e.preventDefault();
  dropBox.classList.remove("highlight");
  handleFiles(e.dataTransfer.files);
});

fileElem.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

function handleFiles(files) {
  [...files].forEach(file => {
    if (!file.type.startsWith("image/")) return;

    images.push(file);

    const reader = new FileReader();
    reader.onload = () => {
      const imageContainer = document.createElement("div");
      imageContainer.classList.add("image-container");

      const img = document.createElement("img");
      img.src = reader.result;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✖";
      removeBtn.classList.add("remove-btn");
      removeBtn.onclick = () => {
        preview.removeChild(imageContainer);
        images = images.filter(i => i !== file);
      };

      imageContainer.appendChild(img);
      imageContainer.appendChild(removeBtn);
      preview.appendChild(imageContainer);
    };
    reader.readAsDataURL(file);
  });
}

extractBtn.addEventListener("click", async () => {
  if (images.length === 0) {
    alert("Please upload at least one image.");
    return;
  }

  let allText = "";

  for (const image of images) {
    const formData = new FormData();
    formData.append("image", image);

    const response = await fetch("https://replit.com/@abhi6019/NoteBotai-Backend", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    if (result.text) {
      allText += result.text + "\n";
    }
  }

  const notesRes = await fetch("https://replit.com/@abhi6019/NoteBotai-Backend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: allText
    }),
  });

  const notesJson = await notesRes.json();
  notesOutput.value = notesJson.notes || "Failed to generate notes.";
});

downloadBtn.addEventListener("click", async () => {
  const response = await fetch("https://replit.com/@abhi6019/NoteBotai-Backend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      notes: notesOutput.value
    }),
  });

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notes.pdf";
  a.click();
  window.URL.revokeObjectURL(url);
});

async function extractAndGenerate() {
  if (imageFiles.length === 0) return;

  showProgress();
  updateProgress(15);

  let combinedText = "";

  for (let i = 0; i < imageFiles.length; i++) {
    const formData = new FormData();
    formData.append("image", imageFiles[i]);

    try {
      updateProgress(20 + i * (60 / imageFiles.length)); // dynamic progress
      const response = await fetch("https://replit.com/@abhi6019/NoteBotai-Backend", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      combinedText += data.text + "\n";
    } catch (err) {
      console.error("OCR error", err);
    }
  }

  updateProgress(85);

  try {
    const notesResponse = await fetch("https://", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: combinedText }),
    });

    const notesData = await notesResponse.json();
    document.getElementById("notesOutput").value = notesData.notes;
  } catch (err) {
    console.error("Notes generation error", err);
  }

  hideProgress();
}