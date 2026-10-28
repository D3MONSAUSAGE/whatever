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
function makeVideo(id) {
  const el = {
    id,
    className: "stage",
    style: {},
    innerHTML: "",
    muted: true,
    paused: true,
    currentTime: 0,
    duration: 0,
    videoWidth: 320,
    videoHeight: 180,
    preload: "auto",
    _src: "",
    _attrs: {},
    onplaying: null,
    onended: null,
    onerror: null,
    ontimeupdate: null,
    setAttribute(name, value) { this._attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; },
    removeAttribute(name) {
      delete this._attrs[name];
      if (name === "src") this._src = "";
    },
    load() {},
    pause() { this.paused = true; },
    play() {
      const src = this._src;
      this.paused = false;
      return {
        then: (ok, bad) => {
          setTimeout_(() => {
            if (!src || src.indexOf("bad") !== -1 || src.indexOf("unsupported") !== -1) {
              if (this.onerror) this.onerror();
              if (bad) bad();
              return;
            }
            if (src.indexOf("blocked") !== -1) {
              if (bad) bad();
              return;
            }
            if (src.indexOf("stall") !== -1) return;
            if (this.onplaying) this.onplaying();
            if (ok) ok();
            if (src.indexOf("freeze") !== -1) {
              this.currentTime = 0.1;
              if (this.ontimeupdate) this.ontimeupdate();
              return;
            }
            setTimeout_(() => { if (this.onended) this.onended(); }, this.duration || 3000);
          }, 300);
        },
      };
    },
  };
  Object.defineProperty(el, "src", {
    get() { return el._src; },
    set(value) {
      el._src = value || "";
      if (!value) return;
      const match = /dur=(\d+)/.exec(value);
      el.duration = match ? Number(match[1]) : 3000;
      el.videoWidth = 320;
      el.videoHeight = 180;
    },
  });
  return el;
}
els.va = makeVideo("va");
els.vb = makeVideo("vb");
const storage = {};
const listeners = {};
const window_ = {
  innerWidth: 1280,
  innerHeight: 720,
  localStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => (storage[k] = v), removeItem: (k) => delete storage[k] },
  addEventListener: (e, f) => (listeners[e] = f),
};
const document_ = { getElementById: (id) => els[id], documentElement: {}, addEventListener() {}, removeEventListener() {} };

// fake server
const S = { online: true, sessions: {}, token: null, version: 0, url: null, playlist: null, revoked: false, stateCalls: 0, playerError: "", playerErrorPosts: 0 };
function server(method, url, body, headers) {
  if (!S.online) return [0, ""];
  if (url === "/api/player/pair") { S.sessions.s1 = { status: "pending" }; return [200, { sessionId: "s1", code: "123456", secret: "x".repeat(40) }]; }
  if (url === "/api/player/pair/status") {
    const s = S.sessions[body.sessionId];
    if (s?.status === "claimed") { s.status = "done"; S.token = "tok".repeat(10); return [200, { status: "paired", token: S.token }]; }
    return [200, { status: s ? "pending" : "expired" }];
  }
  if (url.startsWith("/api/player/state") && method === "POST") {
    S.playerErrorPosts++;
    S.playerError = body && body.error ? String(body.error) : "";
    return [200, { ok: true }];
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

const visible = () => ["a", "b", "va", "vb"].filter((k) => els[k] && els[k].className.includes("on"));
const screen = () => ["pair", "empty", "connecting"].find((k) => els[k].className.includes("on")) || "image";
const shownUrl = () => { const l = ["a", "b"].filter((k) => els[k].className.includes("on")).sort((x, y) => (els[y].style.zIndex || 0) - (els[x].style.zIndex || 0))[0]; return l ? els[l].style.backgroundImage : null; };
const shownVideo = () => {
  const ids = ["va", "vb"].filter((k) => els[k].className.includes("on"));
  ids.sort((x, y) => (Number(els[y].style.zIndex) || 0) - (Number(els[x].style.zIndex) || 0));
  return ids.length ? els[ids[0]].src : "";
};
let mustShowImage = false, blankFrames = 0, slideLog = null, mediaLog = null, timedLog = null;
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
    if (mediaLog) {
      const current = shownVideo() || shownUrl() || "";
      if (current && current !== mediaLog[mediaLog.length - 1]) mediaLog.push(current);
    }
    if (timedLog) {
      const name = clipName(shownVideo() || shownUrl() || "");
      if (name && (!timedLog.length || timedLog[timedLog.length - 1].name !== name)) timedLog.push({ name, at: now });
    }
  }
  now = end;
}
const clipName = (url) => {
  const match = /\/([A-Za-z0-9_-]+)\.(?:jpg|mp4)/.exec(url || "");
  return match ? match[1] : "";
};
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
check("image-only playlist does not open a video", els.va.className.indexOf("on") === -1 && els.vb.className.indexOf("on") === -1);
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

S.version = 10;
S.url = null;
S.playlist = {
  id: "videos",
  transition: "none",
  items: [
    { mediaId: "v1", url: "https://cdn/v1.mp4?dur=3000", durationMs: 10000, kind: "video" },
    { mediaId: "v2", url: "https://cdn/v2.mp4?dur=3000", durationMs: 10000, kind: "video" },
  ],
};
mediaLog = [];
run(20000);
check("video-only playlist plays each clip then loops", mediaLog.map(clipName).join(",").indexOf("v1,v2,v1,v2") !== -1);
mustShowImage = true;
blankFrames = 0;
run(8000);
check("video loop does not go blank between clips", blankFrames === 0 && shownVideo().indexOf(".mp4") !== -1);
mustShowImage = false;

S.version = 11;
S.playlist = {
  id: "mixed",
  transition: "none",
  items: [
    { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 2000, kind: "image" },
    { mediaId: "v1", url: "https://cdn/v1.mp4?dur=2000", durationMs: 9000, kind: "video" },
    { mediaId: "c", url: "https://cdn/c.jpg", durationMs: 2000, kind: "image" },
  ],
};
mediaLog = [];
run(15000);
check("mixed playlist plays image, video, image, then loops", mediaLog.map(clipName).join(",").indexOf("a,v1,c,a") !== -1);

S.version = 11.5;
S.playlist = {
  id: "mixed-bad",
  transition: "none",
  items: [
    { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 2000, kind: "image" },
    { mediaId: "bad", url: "https://cdn/bad.mp4", durationMs: 2000, kind: "video" },
    { mediaId: "c", url: "https://cdn/c.jpg", durationMs: 2000, kind: "image" },
  ],
};
run(8000);
timedLog = [];
mustShowImage = true;
blankFrames = 0;
run(12000);
{
  const names = timedLog.map((entry) => entry.name).join(",");
  const gaps = timedLog.slice(1).map((entry, i) => entry.at - timedLog[i].at);
  const held = gaps.slice(1);
  check("broken video is skipped and the images keep alternating", names.indexOf("a,c,a,c") !== -1 && names.indexOf("bad") === -1);
  check("broken video does not hold the previous image past its duration", held.length >= 2 && held.every((gap) => gap >= 1500 && gap <= 3500));
  check("broken video never leaves the screen blank", blankFrames === 0 && shownUrl() && shownUrl().indexOf(".jpg") !== -1);
}
mustShowImage = false;
timedLog = null;

S.version = 12;
S.playerError = "";
S.playlist = {
  id: "bad-video",
  transition: "none",
  items: [
    { mediaId: "vbad", url: "https://cdn/bad.mp4?dur=4000", durationMs: 5000, kind: "video" },
    { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 4000, kind: "image" },
  ],
};
run(15000);
check("unsupported video is reported and the next image stays up", S.playerError.indexOf("can't play") !== -1 && (shownUrl() || "").indexOf("a.jpg") !== -1 && S.playerErrorPosts > 0);

S.version = 13;
S.playerError = "";
S.playlist = {
  id: "blocked",
  transition: "none",
  items: [
    { mediaId: "bk", url: "https://cdn/blocked.mp4", durationMs: 5000, kind: "video" },
    { mediaId: "c", url: "https://cdn/c.jpg", durationMs: 3000, kind: "image" },
  ],
};
run(15000);
check("blocked autoplay skips to the next item", S.playerError.indexOf("autoplay") !== -1 && (shownUrl() || "").indexOf("c.jpg") !== -1);

S.version = 14;
S.playerError = "";
S.playlist = {
  id: "stall",
  transition: "none",
  items: [
    { mediaId: "st", url: "https://cdn/stall.mp4", durationMs: 5000, kind: "video" },
    { mediaId: "c", url: "https://cdn/c.jpg", durationMs: 3000, kind: "image" },
  ],
};
run(40000);
check("a video that never starts skips after the timeout", S.playerError.indexOf("did not start") !== -1 && (shownUrl() || "").indexOf("c.jpg") !== -1);

S.version = 15;
S.playerError = "";
S.playlist = {
  id: "freeze",
  transition: "none",
  items: [
    { mediaId: "fr", url: "https://cdn/freeze.mp4?dur=30000", durationMs: 5000, kind: "video" },
    { mediaId: "a", url: "https://cdn/a.jpg", durationMs: 4000, kind: "image" },
  ],
};
mediaLog = [];
run(35000);
check("a stalled video skips to the next item", S.playerError.indexOf("stalled") !== -1 && mediaLog.map(clipName).join(",").indexOf("freeze,a") !== -1);

S.version = 16;
S.playlist = {
  id: "drop",
  transition: "none",
  items: [
    { mediaId: "v1", url: "https://cdn/v1.mp4?dur=8000", durationMs: 10000, kind: "video" },
    { mediaId: "v2", url: "https://cdn/v2.mp4?dur=8000", durationMs: 10000, kind: "video" },
  ],
};
run(15000);
S.online = false;
mustShowImage = true;
blankFrames = 0;
run(15000);
check("connection loss keeps the video on screen", blankFrames === 0 && shownVideo().indexOf(".mp4") !== -1 && screen() === "image" && els.status.className.indexOf("on") !== -1);
S.online = true;
run(8000);
check("playback continues after the connection returns", shownVideo().indexOf(".mp4") !== -1 && els.status.className.indexOf("on") === -1);
mustShowImage = false;

S.version = 17;
S.playlist = null;
S.url = "https://cdn/still.jpg";
run(15000);
const still = shownUrl() || "";
run(6000);
check("a single image replaces the video playlist and holds", still.indexOf("still.jpg") !== -1 && shownUrl() === still && shownVideo() === "");

S.revoked = true;
run(12000);
check("disconnect sends TV back to pairing and clears token", screen() === "pair" && !storage.pantalla_display_token && els.status.className.indexOf("on") === -1);

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
