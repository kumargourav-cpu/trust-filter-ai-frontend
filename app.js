// ====== CONFIG ======
const API_BASE = "https://trust-filter-ai.onrender.com"; // your backend
document.getElementById("apiUrlText").textContent = API_BASE;

// ====== SIMPLE CLIENT ID (stored in browser) ======
const CLIENT_ID_KEY = "tfa_client_id";

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (id) return id;

  // Generate a simple random id
  id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

const clientId = getClientId();

// ====== UI HELPERS ======
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

// ====== ACTIONS ======
clearBtn.addEventListener("click", () => {
  document.getElementById("content").value = "";
  resultWrap.classList.add("hidden");
  paywall.classList.add("hidden");
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

  const content = document.getElementById("content").value.trim();
  const category = document.getElementById("category").value;

  if (content.length < 10) {
    setStatus("Please paste at least 10 characters.");
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
      const data = await res.json().catch(() => ({}));
      setStatus("Free limit reached");
      resultWrap.classList.remove("hidden");
      paywall.classList.remove("hidden");
      setFreeLeft(0);
      console.log("Paywall detail:", data);
      return;
    }

    // Other errors
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Error: ${res.status}`);
      alert(err.detail ? JSON.stringify(err.detail) : "Something went wrong. Check backend logs.");
      return;
    }

    const data = await res.json();
    setStatus("Done ✅");

    // Update free uses
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

// Initialize free left as unknown
setFreeLeft(null);
setStatus("Ready");
