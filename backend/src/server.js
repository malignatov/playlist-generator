import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---- Load songs ----
const songsPath = path.join(__dirname, "data", "songs.json");
let songs = JSON.parse(await fs.readFile(songsPath, "utf8"));

// ---- In-memory poll state ----
const moodCounts = {};   // e.g. { happy: 3, focused: 7, ... }
const paceCounts = {};   // e.g. { fast: 4, medium: 2, slow: 1 }
const clients = new Set(); // SSE clients

// Extract allowed options from songs
function buildMeta() {
  const moods = new Set();
  const paces = new Set();
  songs.forEach(s => {
    (s.moods || []).forEach(m => moods.add(m));
    (s.paces || []).forEach(p => paces.add(p));
  });
  return { moods: Array.from(moods).sort(), paces: Array.from(paces).sort() };
}

function computePlaylist() {
  return songs
    .map(s => {
      const moodScore = (s.moods || []).reduce((sum, m) => sum + (moodCounts[m] || 0), 0);
      const paceScore = (s.paces || []).reduce((sum, p) => sum + (paceCounts[p] || 0), 0);
      const score = moodScore + paceScore;
      return { ...s, score };
    })
    .sort((a, b) => {
      // Unplayed first (descending score), then played
      if (a.played !== b.played) return a.played ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}

function snapshot() {
  return {
    moodCounts,
    paceCounts,
    playlist: computePlaylist()
  };
}

// ---- SSE broadcasting ----
function sendTo(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast() {
  const data = snapshot();
  for (const res of clients) sendTo(res, { type: "update", ...data });
}

// Heartbeat to keep connections alive (comments)
setInterval(() => {
  for (const res of clients) res.write(`:keep-alive\n\n`);
}, 15000);

// Recompute + broadcast every second
setInterval(() => {
  if (clients.size > 0) broadcast();
}, 1000);

// ---- Routes ----
app.get("/meta", (req, res) => {
  res.json(buildMeta());
});

app.get("/playlist", (req, res) => {
  res.json(computePlaylist());
});

app.get("/poll-stats", (req, res) => {
  res.json({ moodCounts, paceCounts });
});

app.post("/vote", (req, res) => {
  const { moods = [], paces = [] } = req.body || {};
  if (!Array.isArray(moods) || !Array.isArray(paces)) {
    return res.status(400).json({ error: "moods and paces must be arrays" });
  }
  moods.forEach(m => (moodCounts[m] = (moodCounts[m] || 0) + 1));
  paces.forEach(p => (paceCounts[p] = (paceCounts[p] || 0) + 1));
  // Immediate push after a vote
  broadcast();
  res.json({ ok: true });
});

app.post("/songs/:id/toggle", (req, res) => {
  const song = songs.find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: "Song not found" });
  song.played = !song.played;
  broadcast();
  res.json({ ok: true, played: song.played });
});

app.post("/reset", (req, res) => {
  Object.keys(moodCounts).forEach(k => delete moodCounts[k]);
  Object.keys(paceCounts).forEach(k => delete paceCounts[k]);
  songs = songs.map(s => ({ ...s, played: false }));
  broadcast();
  res.json({ ok: true });
});

app.get("/events", (req, res) => {
  // SSE setup
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.flushHeaders?.();

  // Initial event
  sendTo(res, { type: "hello", ...snapshot() });

  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
  });
});

// ---- Serve frontend statically from /frontend ----
const frontendPath = path.join(__dirname, "..", "..", "frontend");
app.use(express.static(frontendPath));

// Fallback to index.html for convenience
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});