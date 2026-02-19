// ====== CONFIG ======
const API_BASE = "https://trust-filter-ai.onrender.com"; // your backend URL
document.getElementById("apiUrlText").textContent = API_BASE;

// ====== SIMPLE CLIENT ID (stored in browser) ======
const CLIENT_ID_KEY = "tfa_client_id";

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (id) return id;

  id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

const clientId = getClientId();

// ====== UI ELEMENTS ======
const statusText = document.getElementById("statusText");
const freeLeftEl = document.getElementById("freeLeft");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");

const resultWrap = document.getElementById("resultWrap");
const riskBadge = document.getElementById("riskBadge");
const scoreText = document.getElementById("scoreText");
const tacticsList = document.getElementById("tacticsList");
const missingList = document.getElementById("missingList");
const checkList = document.getElementById("checkList");
const safeReply = document.getElementById("safeReply");
const copyReplyBtn = document.getElementById("copyReplyBtn");
const disclaimerText = document.getElementById("disclaimerText");
const paywall = document.getElementById("paywall");

const fileInput = document.getElementById("fileInput");
const fileStatus = document.getElementById("fileStatus");
const contentEl = document.getElementById("content");

// ====== UI HELPERS ======
function setStatus(msg) {
  statusText.textContent = msg;
}

function setFreeLeft(val) {
  freeLeftEl.textContent = (val === null || val === undefined) ? "—" : String(val);
}

function badgeForRisk(level) {
  const s = String(level || "").toLowerCase();
  if (s.includes("high")) return { text: "HIGH RISK", cls: "bg-red-100 text-red-800" };
  if (s.includes("medium")) return { text: "MEDIUM RISK", cls: "bg-amber-100 text-amber-800" };
  return { text: "LOW RISK", cls: "bg-emerald-100 text-emerald-800" };
}

function fillList(ul, items) {
  ul.innerHTML = "";
  (items || []).forEach((it) => {
    const li = document.createElement("li");
    li.textContent = it;
    ul.appendChild(li);
  });
}

function setFileStatus(msg) {
  if (!fileStatus) return;
  fileStatus.textContent = msg || "";
}

// ====== FILE UPLOAD (PDF/DOCX/TXT -> text) ======
async function readTxt(file) {
  return await file.text();
}

async function readDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return (result && result.value) ? result.value : "";
}

async function readPdf(file) {
  const arrayBuffer = await file.arrayBuffer();

  if (!window.pdfjsLib) {
    throw new Error("pdfjsLib is not loaded");
  }

  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str).filter(Boolean);
    fullText += strings.join(" ") + "\n\n";
  }
  return fullText.trim();
}

fileInput?.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  setFileStatus(`Reading: ${file.name} ...`);
  analyzeBtn.disabled = true;

  try {
    const name = (file.name || "").toLowerCase();
    let text = "";

    if (name.endsWith(".txt")) {
      text = await readTxt(file);
    } else if (name.endsWith(".docx")) {
      text = await readDocx(file);
    } else if (name.endsWith(".pdf")) {
      text = await readPdf(file);
    } else {
      setFileStatus("Unsupported file type. Upload PDF, DOCX, or TXT.");
      return;
    }

    if (!text || text.trim().length < 10) {
      setFileStatus("Could not extract readable text. If this is a scanned PDF, OCR is needed.");
      return;
    }

    contentEl.value = text;
    setFileStatus(`Loaded text from: ${file.name}`);
    setStatus("Document loaded ✅");
    setTimeout(() => setStatus("Ready"), 1200);
  } catch (err) {
    console.error(err);
    setFileStatus("Failed to read document. Try a TXT/DOCX or a text-based PDF.");
    setStatus("Upload failed");
  } finally {
    analyzeBtn.disabled = false;
    fileInput.value = ""; // allow re-upload of same file
  }
});

// ====== BUTTON ACTIONS ======
clearBtn.addEventListener("click", () => {
  contentEl.value = "";
  resultWrap.classList.add("hidden");
  paywall.classList.add("hidden");
  setFileStatus("");
  setStatus("Ready");
});

copyReplyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(safeReply.value || "");
    setStatus("Copied reply ✅");
    setTimeout(() => setStatus("Ready"), 1200);
  } catch {
    setStatus("Copy failed (browser blocked). Select text and copy manually.");
  }
});

analyzeBtn.addEventListener("click", async () => {
  paywall.classList.add("hidden");
  resultWrap.classList.add("hidden");

  const content = contentEl.value.trim();
  const category = document.getElementById("category").value;

  if (content.length < 10) {
    setStatus("Please paste or upload at least 10 characters.");
    return;
  }

  setStatus("Analyzing...");
  analyzeBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({ content, category }),
    });

    // Paywall
    if (res.status === 402) {
      setStatus("Free limit reached");
      resultWrap.classList.remove("hidden");
      paywall.classList.remove("hidden");
      setFreeLeft(0);
      return;
    }

    // Handle error responses
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));

      // Show most useful message if available
      const detail = err?.detail;
      setStatus(`Error: ${res.status}`);

      if (typeof detail === "string") {
        alert(detail);
      } else if (detail && typeof detail === "object") {
        alert(JSON.stringify(detail));
      } else {
        alert("Something went wrong. Check Render backend logs.");
      }
      return;
    }

    const data = await res.json();
    setStatus("Done ✅");

    // Update free uses left (from backend response)
    setFreeLeft(data.free_uses_left);

    // Render results
    const badge = badgeForRisk(data.risk_level);
    riskBadge.textContent = badge.text;
    riskBadge.className = `text-xs px-3 py-1 rounded-full ${badge.cls}`;

    scoreText.textContent = data.red_flag_score ?? "—";
    fillList(tacticsList, data.manipulation_tactics || ["None obvious detected"]);
    fillList(missingList, data.missing_proof || []);
    fillList(checkList, data.verification_checklist || []);
    safeReply.value = data.safe_reply || "";
    disclaimerText.textContent = data.disclaimer || "";

    resultWrap.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    setStatus("Network error. Check backend is live.");
    alert("Network error. Try again. If it keeps failing, check Render logs.");
  } finally {
    analyzeBtn.disabled = false;
  }
});

// ====== INIT ======
setFreeLeft(null);
setStatus("Ready");
