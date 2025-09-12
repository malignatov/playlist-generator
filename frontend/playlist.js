const $ = sel => document.querySelector(sel);
const playlistBody = $("#playlist tbody");
const resetBtn = $("#reset");

function renderPlaylist(rows) {
  playlistBody.innerHTML = (rows || [])
    .map(r => `
      <tr class="${r.played ? "played" : ""}">
        <td>${r.score}</td>
        <td>${r.name}</td>
        <td>${(r.moods || []).join(", ")}</td>
        <td>${(r.paces || []).join(", ")}</td>
        <td><button class="toggle" data-id="${r.id}">${r.played ? "Unplay" : "Played"}</button></td>
      </tr>
    `)
    .join("");
}

function startSSE() {
  const es = new EventSource("/events");
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.playlist) renderPlaylist(data.playlist);
    } catch (e) {
      console.warn("SSE parse issue", e);
    }
  };
  es.onerror = () => console.warn("SSE connection lost, retrying automatically…");
}

function wireEvents() {
  playlistBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button.toggle");
    if (!btn) return;
    fetch(`/songs/${btn.dataset.id}/toggle`, { method: "POST" });
  });

  resetBtn.addEventListener("click", async () => {
    const ok = confirm("Reset all poll counts and clear 'played' flags?");
    if (!ok) return;
    await fetch("/reset", { method: "POST" });
  });
}

(function init(){
  wireEvents();
  startSSE();
})();