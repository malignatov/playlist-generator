// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const byId = id => document.getElementById(id);

const moodList = $("#mood-counts");
const paceList = $("#pace-counts");
const playlistBody = $("#playlist tbody");
const resetBtn = $("#reset");

const moodTiles = byId("mood-tiles");
const paceTiles = byId("pace-tiles");

const selectedMoods = new Set();
const selectedPaces = new Set();

// Simple stable hash → 0..9 to color classes c0..c9
function colorClassFor(label){
  let h = 0;
  for (let i=0;i<label.length;i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return `c${h % 10}`;
}

function tileEl(text, group){
  const div = document.createElement("button");
  div.type = "button";
  div.className = `tile ${colorClassFor(text)}`;
  div.setAttribute("aria-pressed", "false");
  div.dataset.value = text;
  div.dataset.group = group;

  const dot = document.createElement("span");
  dot.className = "dot";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = text;

  div.append(dot, label);
  return div;
}

function renderTiles(container, options, group){
  container.innerHTML = "";
  options.forEach(opt => container.appendChild(tileEl(opt, group)));
}

function toggleTile(btn){
  const group = btn.dataset.group;
  const val = btn.dataset.value;
  const set = group === "mood" ? selectedMoods : selectedPaces;

  const isSelected = set.has(val);
  if (isSelected) {
    set.delete(val);
    btn.classList.remove("selected");
    btn.setAttribute("aria-pressed", "false");
  } else {
    set.add(val);
    btn.classList.add("selected");
    btn.setAttribute("aria-pressed", "true");
  }
}

function bulkSelect(container, group, all=true){
  const set = group === "mood" ? selectedMoods : selectedPaces;
  if (!all) set.clear();
  container.querySelectorAll(".tile").forEach(btn => {
    const val = btn.dataset.value;
    if (all) set.add(val); else set.delete(val);
    btn.classList.toggle("selected", all);
    btn.setAttribute("aria-pressed", all ? "true" : "false");
  });
}

// ---------- Data / rendering ----------
async function loadMeta() {
  const res = await fetch("/meta");
  const meta = await res.json();

  renderTiles(moodTiles, meta.moods, "mood");
  renderTiles(paceTiles, meta.paces, "pace");
}

function renderCounts(el, counts) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  el.innerHTML = entries.length
    ? entries.map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`).join("")
    : `<li class="muted">No votes yet</li>`;
}

function renderPlaylist(rows) {
  playlistBody.innerHTML = (rows || [])
    .map(r => {
      return `
        <tr class="${r.played ? "played" : ""}">
          <td>${r.score}</td>
          <td>${r.name}</td>
          <td>${(r.moods || []).join(", ")}</td>
          <td>${(r.paces || []).join(", ")}</td>
          <td><button class="toggle" data-id="${r.id}">${r.played ? "Unplay" : "Played"}</button></td>
        </tr>
      `;
    })
    .join("");
}

// ---------- Events ----------
function wireEvents() {
  // Tile clicks (event delegation)
  moodTiles.addEventListener("click", (e) => {
    const btn = e.target.closest(".tile");
    if (!btn) return;
    toggleTile(btn);
  });
  paceTiles.addEventListener("click", (e) => {
    const btn = e.target.closest(".tile");
    if (!btn) return;
    toggleTile(btn);
  });

  // Bulk actions
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;

    switch (a.dataset.action) {
      case "select-all-moods": bulkSelect(moodTiles, "mood", true); break;
      case "clear-moods":      bulkSelect(moodTiles, "mood", false); break;
      case "select-all-paces": bulkSelect(paceTiles, "pace", true); break;
      case "clear-paces":      bulkSelect(paceTiles, "pace", false); break;
    }
  });

  // Submit
  $("#poll-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const moods = Array.from(selectedMoods);
    const paces = Array.from(selectedPaces);
    if (!moods.length && !paces.length) {
      alert("Pick at least one mood or pace 🙏");
      return;
    }
    await fetch("/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moods, paces })
    });
    // keep tiles selected so users can vote repeatedly if they want
  });

  // Toggle played
  playlistBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button.toggle");
    if (!btn) return;
    fetch(`/songs/${btn.dataset.id}/toggle`, { method: "POST" });
  });

  // Reset
  resetBtn.addEventListener("click", async () => {
    const ok = confirm("Reset all poll counts and clear 'played' flags?");
    if (!ok) return;
    await fetch("/reset", { method: "POST" });
  });
}

function startSSE() {
  const es = new EventSource("/events");
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.moodCounts) renderCounts(moodList, data.moodCounts);
      if (data.paceCounts) renderCounts(paceList, data.paceCounts);
      if (data.playlist) renderPlaylist(data.playlist);
    } catch (e) {
      console.warn("SSE parse issue", e);
    }
  };
  es.onerror = () => {
    console.warn("SSE connection lost, retrying automatically…");
  };
}

// ---------- Init ----------
(async function init() {
  wireEvents();
  await loadMeta();
  startSSE();
})();