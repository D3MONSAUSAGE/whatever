// Runs player.html's script against a fake DOM, fake network and virtual clock.
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/player.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let now = 0, timers = [], tid = 0;
const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; };
const clearTimeout_ = (id) => { timers = timers.filter((t) => t.id !== id); };

const els = {};
for (const id of ["a", "b", "pair", "empty", "connecting", "code", "status"])
  els[id] = { id, className: id === "status" ? "status" : id.length === 1 ? "layer" : "screen", style: {}, innerHTML: "" };
const storage = {};
const listeners = {};
const window_ = {
  localStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => (storage[k] = v), removeItem: (k) => delete storage[k] },
  addEventListener: (e, f) => (listeners[e] = f),
};
const document_ = { getElementById: (id) => els[id], documentElement: {}, addEventListener() {}, removeEventListener() {} };

// fake server
const S = { online: true, sessions: {}, token: null, version: 0, url: null, playlist: null, revoked: false, stateCalls: 0 };
function server(method, url, body, headers) {
  if (!S.online) return [0, ""];
  if (url === "/api/player/pair") { S.sessions.s1 = { status: "pending" }; return [200, { sessionId: "s1", code: "123456", secret: "x".repeat(40) }]; }
  if (url === "/api/player/pair/status") {
    const s = S.sessions[body.sessionId];
    if (s?.status === "claimed") { s.status = "done"; S.token = "tok".repeat(10); return [200, { status: "paired", token: S.token }]; }
    return [200, { status: s ? "pending" : "expired" }];
  }
  if (url.startsWith("/api/player/state")) {
    S.stateCalls++;
    if (S.revoked || headers["X-Display-Token"] !== S.token) return [401, { error: "unauthorized" }];
    const v = new URL("http://x" + url).searchParams.get("v");
    const refresh = url.indexOf("refresh=1") !== -1;
    if (v !== "" && Number(v) === S.version && !refresh) return [200, { version: S.version, unchanged: true }];
    if (S.playlist && !S.url) {
      return [200, {
        version: S.version,
        mediaId: S.playlist.items[0].mediaId,
        url: S.playlist.items[0].url,
        playlist: S.playlist,
      }];
    }
    return [200, { version: S.version, mediaId: S.url ? "m" : null, url: S.url ? S.url + "?sig=" + now : null }];
  }
  return [404, {}];
}
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
class Img { set src(u) { setTimeout_(() => (u.includes("bad") ? this.onerror() : this.onload()), 2000); } }

new Function("window", "document", "XMLHttpRequest", "Image", "setTimeout", "clearTimeout", "localStorage", js)(
  window_, document_, XHR, Img, setTimeout_, clearTimeout_, window_.localStorage);

const visible = () => ["a", "b"].filter((k) => els[k].className.includes("on"));
const screen = () => ["pair", "empty", "connecting"].find((k) => els[k].className.includes("on")) || "image";
const shownUrl = () => { const l = visible().sort((x, y) => (els[y].style.zIndex || 0) - (els[x].style.zIndex || 0))[0]; return l ? els[l].style.backgroundImage : null; };
let mustShowImage = false, blankFrames = 0, slideLog = null;
function run(ms) {
  const end = now + ms;
  while (true) {
    timers.sort((x, y) => x.at - y.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift(); now = t.at; t.fn();
    if (mustShowImage && visible().length === 0) blankFrames++;
    if (slideLog) {
      const url = shownUrl() || "";
      if (url && url !== slideLog[slideLog.length - 1]) slideLog.push(url);
    }
  }
  now = end;
}
let pass = 0, failN = 0;
function check(name, ok) {
  console.log((ok ? "✓ " : "✗ ") + name);
  if (ok) pass++;
  else failN++;
}

run(1000);
check("unpaired TV shows pairing code", screen() === "pair" && els.code.innerHTML === "123 456");
S.sessions.s1.status = "claimed";
run(4000);
check("TV collects token and stores it", storage.pantalla_display_token === S.token);
run(1000);
check("paired with nothing assigned shows 'No content assigned'", screen() === "empty");

S.version = 1; S.url = "https://cdn/img1.jpg";
run(15000);
check("assigned image appears within 15s", screen() === "image" && shownUrl().includes("img1"));
mustShowImage = true;

S.version = 2; S.url = "https://cdn/img2.jpg";
run(15000);
check("new image appears within 15s", shownUrl().includes("img2"));
check("no blank frame during swap", blankFrames === 0);

const callsBefore = S.stateCalls;
run(30000);
check("unchanged polls don't reload the image", shownUrl().includes("img2") && S.stateCalls - callsBefore >= 2);

S.online = false; run(60000);
check("network drop keeps last image and shows reconnecting", shownUrl().includes("img2") && screen() === "image" && els.status.className.indexOf("on") !== -1);
S.version = 3; S.url = "https://cdn/img3.jpg"; S.online = true;
run(25000);
check("recovers after network drop and picks up change", shownUrl().includes("img3") && els.status.className.indexOf("on") === -1);

S.version = 4; S.url = "https://cdn/bad.jpg";
run(15000);
check("broken image keeps last image on screen", shownUrl().includes("img3"));
S.url = "https://cdn/img4.jpg";
run(15000);
check("retries and loads once image is available", shownUrl().includes("img4"));
check("still no blank frames", blankFrames === 0);
mustShowImage = false;

S.version = 5; S.url = null;
run(12000);
check("deleted/cleared image shows 'No content assigned'", screen() === "empty" && visible().length === 0);

S.version = 6;
S.url = null;
S.playlist = {
  id: "pl",
  transition: "none",
  items: [
    { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 4000 },
    { mediaId: "b", url: "https://cdn/b.jpg", durationMs: 4000 },
    { mediaId: "c", url: "https://cdn/c.jpg", durationMs: 4000 },
  ],
};
slideLog = [];
run(60000);
check("playlist plays in order and loops", slideLog.map((url) => url.replace(/.*\/(\w+)\.jpg.*/, "$1")).slice(0, 4).join(",") === "a,b,c,a");
mustShowImage = true;
blankFrames = 0;
run(20000);
check("playlist does not go blank between slides", blankFrames === 0 && shownUrl().indexOf(".jpg") !== -1);

S.version = 7;
S.playlist = {
  id: "pl-bad",
  transition: "none",
  items: [
    { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 3000 },
    { mediaId: "x", url: "https://cdn/bad.jpg", durationMs: 3000 },
  ],
};
run(20000);
check("failed next slide keeps the current image", shownUrl().indexOf("a.jpg") !== -1 && shownUrl().indexOf("bad") === -1);
check("failed slide still leaves no blank frames", blankFrames === 0);

S.version = 8;
S.playlist = {
  id: "pl-next",
  transition: "fade",
  items: [{ mediaId: "c", url: "https://cdn/c.jpg", durationMs: 8000 }],
};
run(15000);
check("playlist update is applied without a reload", shownUrl().indexOf("c.jpg") !== -1 && visible().some((id) => els[id].className.indexOf("fade") !== -1));

S.version = 9;
S.playlist = null;
S.url = "https://cdn/img9.jpg";
run(15000);
const single = shownUrl();
run(12000);
check("single image replaces the playlist and holds", single.indexOf("img9") !== -1 && shownUrl() === single);
mustShowImage = false;
slideLog = null;

S.revoked = true;
run(12000);
check("disconnect sends TV back to pairing and clears token", screen() === "pair" && !storage.pantalla_display_token && els.status.className.indexOf("on") === -1);

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
