// Real-browser soak test for public/player.html (headless Chromium via Playwright). Not part of CI.
// A local mock of /api/player/state serves a mixed playlist of real JPEGs and H.264 MP4s with expiring
// "signed" URLs, while a schedule injects network loss, server errors, a single 401, playlist edits and a reload.
// Every minute it records JS heap (after GC), DOM nodes, listeners, renderer memory and what is on screen.
//
//   node scripts/soak-player.mjs --minutes 120 [--player public/player.html] [--ttl 3600] [--no-cache] [--out dir]
//
// Browser automation is not a TV: codecs, GPU memory and decoder limits on Smart TVs differ.
/* global window, document -- page.evaluate callbacks run in the browser */
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const MINUTES = Number(arg("minutes", "20"));
const PLAYER = arg("player", "public/player.html");
const TTL_S = Number(arg("ttl", "3600"));
const NO_CACHE = process.argv.includes("--no-cache");
// --single-video: the whole run is one looping video (the commonest restaurant set-up besides a menu image).
const SINGLE_VIDEO = process.argv.includes("--single-video");
const OUT = arg("out", path.join(process.env.TMPDIR || "/tmp", `pekko-soak-${Date.now()}`));
mkdirSync(OUT, { recursive: true });

// ---- media
const MEDIA = path.join(OUT, "media");
mkdirSync(MEDIA, { recursive: true });
const photos = readdirSync("public/menu-templates").filter((f) => f.endsWith(".jpg")).slice(0, 6);
for (const p of photos) writeFileSync(path.join(MEDIA, p), readFileSync(path.join("public/menu-templates", p)));
for (const [name, secs, color] of [["promo-a", 5, "testsrc"], ["promo-b", 8, "testsrc2"]]) {
  const file = path.join(MEDIA, `${name}.mp4`);
  if (!existsSync(file)) {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `${color}=size=1280x720:rate=30`, "-t", String(secs),
      "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
  }
}

// ---- mock server
const TOKEN = "soak-token-".padEnd(40, "x");
const state = { version: 1, playlist: null, status: null, statusCount: 0, offline: false, errors: [], playing: 0, stateCalls: 0, mediaHits: 0, expiredHits: 0 };
const img = (f, ms = 3000) => ({ id: f, kind: "image", durationMs: ms });
const vid = (f) => ({ id: f, kind: "video", durationMs: 0 });
const PLAYLISTS = [
  [img(photos[0]), vid("promo-a.mp4"), img(photos[1]), img(photos[2]), vid("promo-b.mp4"), img(photos[3])],
  [img(photos[4], 4000), img(photos[5], 4000), vid("promo-a.mp4")],
];
if (SINGLE_VIDEO) { PLAYLISTS[0] = [vid("promo-b.mp4")]; PLAYLISTS[1] = [vid("promo-a.mp4")]; }
state.playlist = PLAYLISTS[0];
function signed(id) { return `/media/${id}?exp=${Date.now() + TTL_S * 1000}`; }
function stateBody(url) {
  const v = url.searchParams.get("v");
  const refresh = url.searchParams.get("refresh") === "1";
  const extra = { pollMs: 10000, commands: [], layoutStudio: true };
  if (v !== null && v !== "" && Number(v) === state.version && !refresh) return { version: state.version, unchanged: true, ...extra };
  const items = state.playlist.map((it) => ({ mediaId: it.id, url: signed(it.id), durationMs: it.durationMs, kind: it.kind }));
  return { version: state.version, mediaId: items[0].mediaId, url: items[0].url, playlist: { id: "soak", transition: "fade", playbackMode: "auto", items }, ...extra };
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (state.offline && url.pathname.startsWith("/api/")) { req.socket.destroy(); return; }
  if (url.pathname === "/player" || url.pathname === "/player.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(readFileSync(PLAYER));
    return;
  }
  if (url.pathname === "/player-sw.js") {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache" });
    res.end(readFileSync("public/player-sw.js"));
    return;
  }
  if (url.pathname.startsWith("/media/")) {
    state.mediaHits++;
    const exp = Number(url.searchParams.get("exp"));
    if (!exp || Date.now() > exp) { state.expiredHits++; res.writeHead(400, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end('{"error":"expired"}'); return; }
    const file = path.join(MEDIA, path.basename(url.pathname));
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    const size = statSync(file).size;
    const type = file.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
    const head = { "content-type": type, "accept-ranges": "bytes", "cache-control": "max-age=3600", "access-control-allow-origin": "*" };
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    const body = readFileSync(file);
    if (range) {
      const start = Number(range[1]), end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...head, "content-length": size });
    res.end(body);
    return;
  }
  if (url.pathname === "/api/player/state") {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      if (req.headers["x-display-token"] !== TOKEN) { res.writeHead(401, { "content-type": "application/json" }); res.end('{"error":"unauthorized"}'); return; }
      if (req.method === "POST") {
        try {
          const b = JSON.parse(raw || "{}");
          if (b.error) state.errors.push({ at: new Date().toISOString(), error: b.error });
          if (b.playing) state.playing++;
        } catch { /* not available here */ }
        res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}');
        return;
      }
      state.stateCalls++;
      if (state.status && state.statusCount > 0) {
        state.statusCount--;
        res.writeHead(state.status, { "content-type": "application/json" });
        res.end(state.status === 401 ? '{"error":"unauthorized","code":"unauthorized"}' : '{"error":"unavailable"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(stateBody(url)));
    });
    return;
  }
  if (url.pathname === "/api/player/pair") { res.writeHead(200, { "content-type": "application/json" }); res.end('{"sessionId":"s","code":"123456","secret":"' + "y".repeat(40) + '"}'); return; }
  if (url.pathname === "/api/player/pair/status") { res.writeHead(200, { "content-type": "application/json" }); res.end('{"status":"pending"}'); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://localhost:${server.address().port}`;

// ---- browser
// The repo pins its own Playwright; use a preinstalled Chromium when CHROMIUM_PATH is set.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(([token, noCache]) => {
  try { localStorage.setItem("pantalla_display_token", token); } catch { /* not available here */ }
  if (noCache) { try { Object.defineProperty(window, "caches", { value: undefined }); } catch { /* not available here */ } }
}, [TOKEN, NO_CACHE]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push({ at: new Date().toISOString(), message: String(e.message) }));
page.on("crash", () => pageErrors.push({ at: new Date().toISOString(), message: "RENDERER CRASH" }));
await page.goto(`${BASE}/player`);
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");

async function rendererRssMb() {
  try {
    const out = execFileSync("ps", ["-eo", "rss,args"], { encoding: "utf8" });
    return Math.round(out.split("\n").filter((l) => l.includes("--type=renderer")).reduce((n, l) => n + Number(l.trim().split(/\s+/)[0] || 0), 0) / 1024);
  } catch { return null; }
}
async function sample(label) {
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const screen = await page.evaluate(() => {
    const on = [...document.querySelectorAll(".layer.on, video.stage.on")];
    const vids = [...document.querySelectorAll("video")].map((v) => ({ on: v.className.includes("on"), src: v.getAttribute("src") ? 1 : 0, paused: v.paused }));
    const screens = [...document.querySelectorAll(".screen.on")].map((s) => s.id);
    return { visible: on.length, screens, status: document.getElementById("status").className.includes("on") ? document.getElementById("status").textContent : "", vids, blobs: Object.keys(window.seempleSavedMedia || {}).length };
  }).catch((e) => ({ error: String(e) }));
  return {
    at: new Date().toISOString(), label, minute: Math.round((Date.now() - t0) / 60000),
    heapMb: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents,
    rendererRssMb: await rendererRssMb(), screen,
  };
}

// Blank / frozen watch: once per second, is something on screen, and does a shown video advance?
const watch = { checks: 0, blankSeconds: 0, frozenVideoSeconds: 0, longestBlank: 0, transitions: 0, lastKey: "" };
let blankRun = 0, lastVideoTime = -1, frozenRun = 0;
async function tick() {
  const s = await page.evaluate(() => {
    const layers = [...document.querySelectorAll(".layer.on")];
    const vid = [...document.querySelectorAll("video.stage.on")][0];
    const screen = [...document.querySelectorAll(".screen.on")].map((x) => x.id).join(",");
    const top = layers.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
    return { n: layers.length + (vid ? 1 : 0), screen, key: vid ? "v:" + (vid.getAttribute("data-id") || "") : top ? top.style.backgroundImage.slice(0, 60) : "", vt: vid ? vid.currentTime : -1 };
  }).catch(() => null);
  if (!s) return;
  watch.checks++;
  if (s.key && s.key !== watch.lastKey) { watch.transitions++; watch.lastKey = s.key; }
  if (s.n === 0 && !s.screen) { blankRun++; watch.blankSeconds++; watch.longestBlank = Math.max(watch.longestBlank, blankRun); } else blankRun = 0;
  if (s.vt >= 0) { if (s.vt === lastVideoTime) { frozenRun++; if (frozenRun >= 3) watch.frozenVideoSeconds++; } else frozenRun = 0; lastVideoTime = s.vt; }
  else { lastVideoTime = -1; frozenRun = 0; }
}

// ---- schedule (fractions of the run)
const events = [
  [0.15, "network offline 3 min", async () => { await context.setOffline(true); state.offline = true; }],
  [0.15 + 3 / MINUTES, "network back", async () => { await context.setOffline(false); state.offline = false; }],
  [0.3, "playlist edit", async () => { state.version++; state.playlist = PLAYLISTS[1]; }],
  [0.4, "server 503 for ~2 min", async () => { state.status = 503; state.statusCount = 12; }],
  [0.5, "playlist edit back", async () => { state.version++; if (SINGLE_VIDEO) { PLAYLISTS[0] = [vid("promo-b.mp4")]; PLAYLISTS[1] = [vid("promo-a.mp4")]; }
state.playlist = PLAYLISTS[0]; }],
  [0.6, "browser refresh", async () => { await page.reload(); }],
  [0.75, "one transient 401", async () => { state.status = 401; state.statusCount = 1; }],
  [0.85, "playlist edit", async () => { state.version++; state.playlist = PLAYLISTS[1]; }],
];
const samples = [];
const t0 = Date.now();
const end = t0 + MINUTES * 60000;
let nextSample = t0;
const log = (s) => { process.stdout.write(s + "\n"); };
log(`soak: ${MINUTES} min, player=${PLAYER}, ttl=${TTL_S}s, cache=${NO_CACHE ? "disabled" : "enabled"}, single-video=${SINGLE_VIDEO}, out=${OUT}`);
while (Date.now() < end) {
  const frac = (Date.now() - t0) / (end - t0);
  while (events.length && events[0][0] <= frac) {
    const [, name, fn] = events.shift();
    await fn().catch((e) => log(`event ${name} failed: ${e}`));
    log(`[${Math.round((Date.now() - t0) / 60000)} min] ${name}`);
    samples.push({ at: new Date().toISOString(), event: name });
  }
  if (Date.now() >= nextSample) {
    const s = await sample("periodic");
    samples.push(s);
    nextSample += 60000;
    log(`[${s.minute} min] heap=${s.heapMb}MB nodes=${s.nodes} listeners=${s.listeners} rss=${s.rendererRssMb}MB visible=${s.screen.visible} screens=${(s.screen.screens || []).join(",")} status=${JSON.stringify(s.screen.status || "")} blobs=${s.screen.blobs}`);
  }
  await tick();
  await new Promise((r) => setTimeout(r, 1000));
}
const final = await sample("final");
samples.push(final);
const periodic = samples.filter((s) => s.heapMb !== undefined);
const firstHalf = periodic.slice(2, Math.max(3, Math.floor(periodic.length / 2)));
const secondHalf = periodic.slice(Math.floor(periodic.length / 2));
const avg = (l, k) => l.reduce((n, s) => n + s[k], 0) / Math.max(1, l.length);
const summary = {
  minutes: MINUTES, player: PLAYER, ttlSeconds: TTL_S, cacheStorage: !NO_CACHE, singleVideo: SINGLE_VIDEO,
  watch, pageErrors, reportedErrors: state.errors.slice(-20), reportedErrorCount: state.errors.length,
  confirmations: state.playing, stateCalls: state.stateCalls, mediaRequests: state.mediaHits, expiredMediaRequests: state.expiredHits,
  pairedAtEnd: !(final.screen.screens || []).includes("pair"),
  heapMb: { min: Math.min(...periodic.map((s) => s.heapMb)), max: Math.max(...periodic.map((s) => s.heapMb)), firstHalfAvg: +avg(firstHalf, "heapMb").toFixed(2), secondHalfAvg: +avg(secondHalf, "heapMb").toFixed(2) },
  nodes: { min: Math.min(...periodic.map((s) => s.nodes)), max: Math.max(...periodic.map((s) => s.nodes)) },
  listeners: { min: Math.min(...periodic.map((s) => s.listeners)), max: Math.max(...periodic.map((s) => s.listeners)) },
  rendererRssMb: { firstHalfAvg: Math.round(avg(firstHalf, "rendererRssMb")), secondHalfAvg: Math.round(avg(secondHalf, "rendererRssMb")), max: Math.max(...periodic.map((s) => s.rendererRssMb || 0)) },
};
writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(samples, null, 1));
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
await page.screenshot({ path: path.join(OUT, "final.png") }).catch(() => {});
log("SUMMARY " + JSON.stringify(summary));
await browser.close();
server.close();
