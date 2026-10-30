// Milestone B: persistent media cache, smarter polling and offline start-up.
// Same fake DOM/network/virtual clock idea as simulate-player.mjs, plus a fake
// Cache API, fetch and object URLs. Promise callbacks are flushed after every timer.
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/player.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let now = 0, timers = [], tid = 0;
const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; };
const clearTimeout_ = (id) => { timers = timers.filter((t) => t.id !== id); };
const flush = () => new Promise((r) => setImmediate(r));

// ---- persistent device state (survives a "restart")
const storage = {};
const cacheStore = new Map(); // key -> { size, url }
let fetches = [], blobCount = 0, videoBlobBroken = false;

// ---- fake server
const S = { online: true, token: "tok".repeat(10), version: 0, playlist: null, url: null, mediaId: null, pollMs: null, stateCalls: 0, next: null, revoked: false, sig: 0, playing: [] };
function server(method, url, body, headers) {
  if (!S.online) return [0, ""];
  if (url.startsWith("/api/player/pair")) return [200, { sessionId: "s1", code: "123456", secret: "x".repeat(40) }];
  if (url.startsWith("/api/player/state") && method === "POST") {
    if (body && body.playing) S.playing.push(body.playing.version);
    return [200, { ok: true }];
  }
  if (url.startsWith("/api/player/state")) {
    S.stateCalls++;
    if (S.revoked || headers["X-Display-Token"] !== S.token) return [401, { error: "unauthorized" }];
    const extra = {};
    if (S.pollMs) extra.pollMs = S.pollMs;
    if (S.next) extra.nextTransitionAt = S.next;
    const v = new URL("http://x" + url).searchParams.get("v");
    const refresh = url.indexOf("refresh=1") !== -1;
    if (v !== "" && Number(v) === S.version && !refresh) return [200, { version: S.version, unchanged: true, ...extra }];
    S.sig++;
    const sign = (u) => u + "?sig=" + S.sig;
    if (S.playlist) {
      const items = S.playlist.items.map((it) => ({ ...it, url: sign(it.url) }));
      return [200, { version: S.version, mediaId: items[0].mediaId, url: items[0].url, playlist: { ...S.playlist, items }, ...extra }];
    }
    return [200, { version: S.version, mediaId: S.mediaId, url: S.url ? sign(S.url) : null, ...extra }];
  }
  return [404, {}];
}

function boot() {
  timers = [];
  const els = {};
  for (const id of ["a", "b", "pair", "empty", "connecting", "code", "status"])
    els[id] = { id, className: id === "status" ? "status" : id.length === 1 ? "layer" : "screen", style: {}, innerHTML: "" };
  const makeVideo = (id) => {
    const el = {
      id, className: "stage", style: {}, muted: true, currentTime: 0, videoWidth: 320, videoHeight: 180, _src: "", _attrs: {},
      setAttribute(n, v) { this._attrs[n] = String(v); }, getAttribute(n) { return n in this._attrs ? this._attrs[n] : null; },
      removeAttribute(n) { delete this._attrs[n]; if (n === "src") this._src = ""; }, load() {}, pause() {},
      play() {
        const src = this._src;
        return { then: (ok, bad) => setTimeout_(() => {
          if (!src || (videoBlobBroken && src.startsWith("blob:"))) { if (this.onerror) this.onerror(); if (bad) bad(); return; }
          this.currentTime = 0.2; if (this.onplaying) this.onplaying(); if (ok) ok();
          setTimeout_(() => { if (this.onended) this.onended(); }, 3000);
        }, 300) };
      },
    };
    Object.defineProperty(el, "src", { get() { return el._src; }, set(v) { el._src = v || ""; } });
    return el;
  };
  els.va = makeVideo("va"); els.vb = makeVideo("vb");
  const net = { images: 0 };
  class XHR {
    open(m, u) { this.m = m; this.u = u; this.h = {}; }
    setRequestHeader(k, v) { this.h[k] = v; }
    abort() {}
    send(b) {
      setTimeout_(() => {
        const [status, data] = server(this.m, this.u, b ? JSON.parse(b) : null, this.h);
        this.readyState = 4; this.status = status; this.responseText = typeof data === "string" ? data : JSON.stringify(data);
        this.onreadystatechange();
      }, 300);
    }
  }
  class Img {
    set src(u) {
      this._u = u;
      setTimeout_(() => {
        if (u.startsWith("blob:")) { this.onload(); return; }
        if (!S.online) { this.onerror(); return; }
        net.images++;
        this.onload();
      }, u.startsWith("blob:") ? 50 : 2000);
    }
  }
  const caches = {
    open: async () => ({
      match: async (key) => (cacheStore.has(key) ? { blob: async () => ({ size: cacheStore.get(key).size, key }) } : undefined),
      put: async (key, res) => { cacheStore.set(key, { size: res._size }); },
      delete: async (key) => cacheStore.delete(key),
    }),
    delete: async () => { cacheStore.clear(); return true; },
  };
  const fetch_ = (url) => new Promise((resolve, reject) => {
    setTimeout_(() => {
      if (!S.online) { reject(new TypeError("offline")); return; }
      fetches.push(url);
      resolve({ ok: true, _size: 1000, headers: { get: (h) => (h === "content-length" ? "1000" : null) } });
    }, 500);
  });
  const URL_ = { createObjectURL: (b) => `blob:${b.key}#${++blobCount}`, revokeObjectURL: () => {} };
  const window_ = {
    innerWidth: 1280, innerHeight: 720,
    localStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => (storage[k] = String(v)), removeItem: (k) => delete storage[k] },
    addEventListener() {}, caches, fetch: fetch_, Promise, URL: URL_, navigator: { storage: { persist: async () => true } },
  };
  const document_ = { getElementById: (id) => els[id], documentElement: {}, addEventListener() {}, removeEventListener() {} };
  new Function("window", "document", "XMLHttpRequest", "Image", "setTimeout", "clearTimeout", "localStorage", js)(
    window_, document_, XHR, Img, setTimeout_, clearTimeout_, window_.localStorage);
  return { els, net };
}

async function run(ms) {
  const end = now + ms;
  for (;;) {
    await flush(); await flush();
    timers.sort((x, y) => x.at - y.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift(); now = t.at; t.fn();
  }
  now = end;
  await flush();
}
let pass = 0, fail = 0;
const check = (name, ok, info) => { console.log((ok ? "✓ " : "✗ ") + name + (ok || info === undefined ? "" : `  [${JSON.stringify(info)}]`)); ok ? pass++ : fail++; };
const shown = (els) => {
  const l = ["a", "b"].filter((k) => els[k].className.includes("on")).sort((x, y) => (els[y].style.zIndex || 0) - (els[x].style.zIndex || 0))[0];
  const v = ["va", "vb"].filter((k) => els[k].className.includes("on"))[0];
  return v ? els[v].src : l ? els[l].style.backgroundImage : "";
};
const screenOf = (els) => ["pair", "empty", "connecting"].find((k) => els[k].className.includes("on")) || "media";

// ---------------------------------------------------------------------------
storage.pantalla_display_token = S.token;
S.version = 1; S.pollMs = 30000;
S.playlist = { id: "pl", transition: "none", items: [
  { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 4000, kind: "image" },
  { mediaId: "b", url: "https://cdn/b.jpg", durationMs: 4000, kind: "image" },
  { mediaId: "v", url: "https://cdn/v.mp4", durationMs: 3000, kind: "video" },
] };
let tv = boot();
await run(60000);
check("playlist starts and every file is downloaded into the cache once", screenOf(tv.els) === "media" && fetches.length === 3 && cacheStore.size === 3, { fetches, size: cacheStore.size });
const callsAt60 = S.stateCalls;
await run(120000);
const polls = S.stateCalls - callsAt60;
check("server pollMs=30000 is honoured (about 4 polls in 2 minutes, not 12)", polls >= 3 && polls <= 5, polls);
check("after the first loop, slides play from local files", /^blob:/.test(shown(tv.els).replace(/^url\("/, "")), shown(tv.els));
const imagesBefore = tv.net.images;
await run(120000);
check("looping does not re-download images from the network", tv.net.images === imagesBefore && fetches.length === 3, { images: tv.net.images - imagesBefore, fetches: fetches.length });

check("TV confirms playback once for the first playlist, not on every loop or poll", S.playing.length === 1 && S.playing[0] === 1, S.playing);

// 30-minute URL refresh brings new signed URLs: still no new downloads.
await run(30 * 60000);
check("signed-URL refresh does not re-download cached files", fetches.length === 3, fetches.length);

// Incremental update: one new file in the playlist -> exactly one download.
S.version = 2;
S.playlist = { id: "pl", transition: "none", items: [
  { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 4000, kind: "image" },
  { mediaId: "c", url: "https://cdn/c.jpg", durationMs: 4000, kind: "image" },
] };
await run(60000);
check("a changed playlist downloads only the new file", fetches.length === 4 && fetches[3].indexOf("/c.jpg") !== -1, fetches.slice(3));

check("TV confirms the new playlist once it is on screen", S.playing.filter((v) => v === 2).length === 1, S.playing);

// Restart the TV while the internet is down: it plays the saved playlist.
S.online = false;
tv = boot();
await run(20000);
check("restart with no internet plays the last playlist from saved files", screenOf(tv.els) === "media" && /blob:/.test(shown(tv.els)), { screen: screenOf(tv.els), shown: shown(tv.els) });
await run(20000);
const seen = new Set();
for (let i = 0; i < 6; i++) { await run(2000); seen.add(shown(tv.els).replace(/#\d+.*/, "")); }
check("offline playlist keeps rotating", seen.size >= 2, [...seen]);

// Internet returns with the same version: keeps playing, no downloads.
S.online = true;
await run(40000);
check("when the internet returns, unchanged content keeps playing without downloads", fetches.length === 4 && screenOf(tv.els) === "media" && tv.els.status.className.indexOf("on") === -1, { fetches: fetches.length });

check("content shown while offline is confirmed after the internet returns", S.playing.filter((v) => v === 2).length === 2, S.playing);

// Schedule switch: the player wakes right after nextTransitionAt, not 30 s later.
S.next = new Date(Date.now() + 5000).toISOString();
await run(31000); // let it pick up nextTransitionAt
S.version = 3;
S.next = null;
S.playlist = { id: "lunch", transition: "none", items: [{ mediaId: "a", url: "https://cdn/a.jpg", durationMs: 4000, kind: "image" }] };
const before = S.stateCalls;
await run(8000);
check("player polls right after a scheduled switch (within 8 s)", S.stateCalls > before, S.stateCalls - before);

// A TV that cannot play saved video files falls back to streaming, without flagging the clip as bad.
videoBlobBroken = true;
S.version = 4;
S.playlist = { id: "vid", transition: "none", items: [
  { mediaId: "v", url: "https://cdn/v.mp4", durationMs: 3000, kind: "video" },
  { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 3000, kind: "image" },
] };
let sawNetworkVideo = false;
for (let i = 0; i < 30; i++) { await run(1000); if (/^https:\/\/cdn\/v\.mp4/.test(shown(tv.els))) sawNetworkVideo = true; }
check("saved video that will not play falls back to the network copy", sawNetworkVideo);
videoBlobBroken = false;

// Unpairing wipes the saved files and last state.
S.revoked = true;
await run(40000);
await run(1000);
check("disconnecting the TV clears its saved media and last state", cacheStore.size === 0 && !storage.seemple_last_state && !storage.seemple_media_index && screenOf(tv.els) === "pair", { size: cacheStore.size });

// Old server (no pollMs) keeps the 10 s poll.
S.revoked = false; S.pollMs = null; storage.pantalla_display_token = S.token;
tv = boot();
await run(5000);
const c0 = S.stateCalls;
await run(60000);
check("without pollMs the player keeps polling every 10 s", S.stateCalls - c0 >= 5, S.stateCalls - c0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
