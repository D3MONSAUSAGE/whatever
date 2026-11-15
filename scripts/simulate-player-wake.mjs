// R14-02: wake-up after a hidden/frozen tab or a bfcache restore.
// Fake DOM, fake network and a virtual clock, like simulate-player.mjs. Each scenario boots a fresh player.
// Videos advance currentTime in real (virtual) time while playing; a "frozen" element reports playing but its
// time never moves (the black surface QA saw). A frozen tab is modelled by jumping the clock without running
// timers, so overdue timers fire all at once on resume, as browsers do.
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/player.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let now = 0, timers = [], tid = 0;
const RealDate = Date;
const T0 = RealDate.now();
function syncClock() {
  const at = T0 + now;
  global.Date = class VDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [at])); }
    static now() { return T0 + now; }
  };
}
const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; };
const clearTimeout_ = (id) => { timers = timers.filter((t) => t.id !== id); };
function run(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((x, y) => x.at - y.at || x.id - y.id);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    if (t.at > now) now = t.at;
    syncClock();
    t.fn();
  }
  now = end;
  syncClock();
}
function freezeFor(ms) { now += ms; syncClock(); } // tab frozen: no timer runs, clock moves

let pass = 0, failN = 0;
function check(name, ok, info) {
  console.log((ok ? "✓ " : "✗ ") + name + (ok || info === undefined ? "" : "  -> " + JSON.stringify(info)));
  if (ok) pass++; else failN++;
}

function boot(opts) {
  timers = []; now = 0; syncClock();
  const P = { srcLog: [], srcSets: 0, imgLoads: 0, stateCalls: 0, errors: [], frozenSrc: {}, slow: opts.slow || {}, plays: 0 };
  const els = {};
  for (const id of ["a", "b", "pair", "empty", "connecting", "paused", "paused-title", "paused-msg", "pair-label", "code", "status", "manual", "manual-pos", "prev", "next", "unpair", "unpair-yes", "unpair-no", "unpair-msg"]) {
    const base = id.length === 1 ? "layer" : ["pair", "empty", "connecting", "paused"].includes(id) ? "screen" : id;
    els[id] = { id, className: base, style: {}, innerHTML: "", textContent: "", offsetWidth: 1280, setAttribute() {}, getAttribute() { return null; }, focus() {} };
  }
  const makeVideo = (id) => {
    const v = {
      id, className: "stage", style: {}, muted: true, paused: true, ended: false, loop: false, currentTime: 0, duration: 600, videoWidth: 0, videoHeight: 0,
      _src: "", _attrs: {}, _gen: 0, onplaying: null, onended: null, onerror: null, ontimeupdate: null,
      setAttribute(n, val) { this._attrs[n] = String(val); }, getAttribute(n) { return n in this._attrs ? this._attrs[n] : null; },
      removeAttribute(n) { delete this._attrs[n]; if (n === "src") { this._src = ""; this._gen++; this.paused = true; } },
      load() {}, pause() { this.paused = true; },
      play() {
        const gen = this._gen, src = this._src;
        P.plays++;
        if (this._live === gen) { this.paused = false; return { then: (ok) => setTimeout_(() => ok && ok(), 0) }; }
        return { then: (ok, bad) => setTimeout_(() => {
          if (gen !== this._gen) return;
          if (!src) { if (bad) bad(); return; }
          const first = Object.keys(P.slow).find((k) => src.indexOf(k) !== -1);
          const delay = first ? P.slow[first] : 0;
          setTimeout_(() => {
            if (gen !== this._gen) return;
            this._live = gen; this.paused = false; this.videoWidth = 320; this.videoHeight = 180;
            this.currentTime = 0.05;
            if (this.onplaying) this.onplaying();
            if (ok) ok();
            const tick = () => {
              if (gen !== this._gen) return;
              if (!this.paused && !P.frozenSrc[src] && !this.frozen) {
                this.currentTime += 0.25;
                if (this.ontimeupdate) this.ontimeupdate();
                if (this.currentTime >= this.duration) {
                  if (this.loop) this.currentTime = 0;
                  else { this.ended = true; this.paused = true; if (this.onended) this.onended(); return; }
                }
              }
              setTimeout_(tick, 250);
            };
            setTimeout_(tick, 250);
          }, delay);
        }, 300) };
      },
    };
    Object.defineProperty(v, "src", {
      get() { return v._src; },
      set(val) {
        v._src = val || ""; v._gen++; v.ended = false; v.paused = true; v.currentTime = 0; v.frozen = false; v._live = -1;
        if (val) { P.srcSets++; P.srcLog.push(val); if (process.env.WAKE_DEBUG) console.log('  src', now, id, val); const m = /dur=(\d+)/.exec(val); v.duration = m ? Number(m[1]) : 600; }
      },
    });
    return v;
  };
  els.va = makeVideo("va"); els.vb = makeVideo("vb");
  const storage = { pantalla_display_token: "tok".repeat(10) };
  const winL = {}, docL = {};
  const window_ = {
    innerWidth: 1280, innerHeight: 720,
    localStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => (storage[k] = v), removeItem: (k) => delete storage[k] },
    addEventListener: (e, f) => (winL[e] = winL[e] || []).push(f),
  };
  const document_ = {
    hidden: false, visibilityState: "visible",
    getElementById: (id) => els[id], documentElement: {}, body: { className: "" },
    addEventListener(type, fn) { (docL[type] = docL[type] || []).push(fn); },
    removeEventListener(type, fn) { docL[type] = (docL[type] || []).filter((f) => f !== fn); },
  };
  const S = { version: 5, playlist: opts.playlist || null, url: opts.url || null };
  function server(method, url, body) {
    if (method === "POST") { if (body && body.error) P.errors.push(body.error); return [200, { ok: true }]; }
    if (url.startsWith("/api/player/state")) {
      P.stateCalls++;
      const v = new URL("http://x" + url).searchParams.get("v");
      if (v !== "" && Number(v) === S.version && url.indexOf("refresh=1") === -1) return [200, { version: S.version, unchanged: true, pollMs: 10000 }];
      if (S.playlist) return [200, { version: S.version, mediaId: S.playlist.items[0].mediaId, url: S.playlist.items[0].url, playlist: S.playlist, pollMs: 10000 }];
      return [200, { version: S.version, mediaId: "img", url: S.url, pollMs: 10000 }];
    }
    return [404, {}];
  }
  class XHR {
    open(m, u) { this.m = m; this.u = u; this.h = {}; }
    setRequestHeader(k, v) { this.h[k] = v; }
    abort() {}
    send(b) { setTimeout_(() => { const [s, d] = server(this.m, this.u, b ? JSON.parse(b) : null); this.readyState = 4; this.status = s; this.responseText = JSON.stringify(d); this.onreadystatechange(); }, 200); }
  }
  class Img { set src(u) { P.imgLoads++; setTimeout_(() => (u.includes("bad") ? this.onerror() : this.onload()), 500); } }
  new Function("window", "document", "XMLHttpRequest", "Image", "setTimeout", "clearTimeout", "localStorage", js)(
    window_, document_, XHR, Img, setTimeout_, clearTimeout_, window_.localStorage);
  const api = {
    P, els, S,
    hide() { document_.hidden = true; document_.visibilityState = "hidden"; (docL.visibilitychange || []).forEach((f) => f({})); },
    show() { document_.hidden = false; document_.visibilityState = "visible"; (docL.visibilitychange || []).forEach((f) => f({})); },
    spuriousVisible() { (docL.visibilitychange || []).forEach((f) => f({})); },
    pagehide() { (winL.pagehide || []).forEach((f) => f({ persisted: true })); },
    pageshow(persisted) { (winL.pageshow || []).forEach((f) => f({ persisted })); },
    shown() { const ids = ["va", "vb"].filter((k) => els[k].className.indexOf(" on") !== -1).sort((x, y) => Number(els[y].style.zIndex || 0) - Number(els[x].style.zIndex || 0)); return ids.length ? els[ids[0]] : null; },
    zone() { return ["va", "vb"].map((k) => els[k]).find((v) => v.getAttribute("data-zone") === "1") || null; },
    loads(name) { return P.srcLog.filter((u) => u.indexOf(name) !== -1).length; },
    freezeShown() { const v = api.shown(); if (v) v.frozen = true; return v; },
  };
  return api;
}
const vid = (id, extra) => ({ mediaId: id, url: `https://cdn/${id}.mp4?dur=600`, durationMs: 0, kind: "video", ...(extra || {}) });

// 1) hidden -> visible with a frozen video: exactly one reload, state polled at once, then plays.
for (const count of [1, 2]) {
  const items = count === 1 ? [vid("solo")] : [vid("one"), vid("two")];
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items } });
  run(15000);
  const before = p.shown();
  p.hide(); run(1000); freezeFor(4 * 3600 * 1000);
  const fz = p.freezeShown(), nm = fz.getAttribute("data-id") + ".mp4";
  const sets = p.loads(nm), calls = p.P.stateCalls;
  p.show(); run(1500);
  check(`[${count} item] wake polls state immediately`, p.P.stateCalls > calls, { calls, after: p.P.stateCalls });
  run(9000);
  check(`[${count} item] frozen video -> exactly one reload after ~8 s`, p.loads(nm) - sets === 1, { reloads: p.loads(nm) - sets });
  const t1 = p.shown() ? p.shown().currentTime : -1; run(3000);
  check(`[${count} item] after the reload time advances on screen`, !!p.shown() && p.shown().currentTime > t1 && !p.shown().frozen);
  run(60000);
  check(`[${count} item] no wake reload loop and no stall/skip error (loop plays on normally)`, (count === 1 ? p.loads(nm) - sets === 1 : true) && p.P.errors.length === 0, { reloads: p.loads(nm) - sets, errors: p.P.errors });
  check(`[${count} item] the reload plays on the spare element (frozen frame stays up until it plays)`, !!p.shown() && p.shown() !== before);
}

// 2) normal resume (video keeps moving): no reload.
{
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [vid("ok")] } });
  run(15000);
  p.hide(); run(1000); freezeFor(30 * 60 * 1000);
  const sets = p.P.srcSets, calls = p.P.stateCalls, t0 = p.shown().currentTime;
  p.show(); run(12000);
  check("normal resume: state polled, no reload, time advances", p.P.stateCalls > calls && p.P.srcSets === sets && p.shown().currentTime > t0, { reloads: p.P.srcSets - sets });
}

// 3) spurious visibility events.
{
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [vid("noise")] } });
  run(15000);
  const sets = p.P.srcSets, calls = p.P.stateCalls;
  for (let i = 0; i < 20; i++) { p.spuriousVisible(); run(3000); }
  check("visible->visible noise (CEC/screensaver) never wakes: no reload, no extra poll burst", p.P.srcSets === sets && p.P.stateCalls - calls <= 8, { reloads: p.P.srcSets - sets, polls: p.P.stateCalls - calls });
  // flapping hidden/visible every 2 s for 30 s with a frozen video (hidden half the time, so the visible stall
  // path never reaches its 4 s either)
  p.freezeShown();
  for (let i = 0; i < 15; i++) { p.hide(); run(1000); p.show(); run(1000); }
  check("hidden/visible flapping faster than 8 s: no reload", p.P.srcSets === sets, { reloads: p.P.srcSets - sets });
  run(10000);
  check("after the flapping settles: exactly one reload", p.P.srcSets - sets === 1, { reloads: p.P.srcSets - sets });
  run(120000);
  check("no reload loop over the next 2 minutes", p.P.srcSets - sets === 1, { reloads: p.P.srcSets - sets });
  // a newer wake supersedes a pending check: hidden again 3 s after a wake, frozen for a minute, then woken again.
  // The first (overdue) check must not fire; only the second wake's check may reload.
  const fz2 = p.freezeShown(), nm2 = fz2.getAttribute("data-id") + ".mp4";
  const s2 = p.loads(nm2);
  p.hide(); run(500); freezeFor(60000); p.show(); run(3000); p.hide(); freezeFor(60000); p.freezeShown(); p.show();
  run(3000);
  check("hidden again before 8 s: the pending check is dropped", p.loads(nm2) === s2, { reloads: p.loads(nm2) - s2 });
  run(7000);
  check("the newer wake's own check reloads once (one per resume)", p.loads(nm2) - s2 === 1, { reloads: p.loads(nm2) - s2 });
}

// 4) pageshow from bfcache.
{
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [vid("bf")] } });
  run(15000);
  const calls = p.P.stateCalls, sets = p.P.srcSets;
  p.pageshow(false); run(10000);
  check("pageshow without persisted (first load) is not a wake", p.P.srcSets === sets);
  p.pagehide(); freezeFor(10 * 60 * 1000); p.freezeShown();
  const calls2 = p.P.stateCalls;
  p.pageshow(true); run(1500);
  check("pageshow persisted=true polls state at once", p.P.stateCalls > calls2 && calls2 >= calls);
  run(9000);
  check("bfcache restore with a frozen video: exactly one reload", p.P.srcSets - sets === 1, { reloads: p.P.srcSets - sets });
}

// 5) large uncached video with a slow first frame after the reload: bounded, one wake reload max.
{
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [vid("big"), vid("next")] } });
  run(15000);
  p.hide(); run(500); freezeFor(3600 * 1000);
  const frozen = p.freezeShown();
  const name = frozen.getAttribute("data-id");
  p.P.slow[name + ".mp4"] = 3500; // re-decode of the big file takes 3.5 s to show a frame
  const sets = p.P.srcSets;
  p.show(); run(9000);
  check("slow first frame: one reload issued", p.P.srcSets - sets === 1, { reloads: p.P.srcSets - sets });
  run(5000);
  check("slow first frame: the reloaded item comes up and plays", !!p.shown() && p.shown().getAttribute("data-id") === name && p.shown().currentTime > 0.3);
  const s1 = p.P.srcSets;
  run(60000);
  // Later loop advances may arm the next clip; none come from the wake path (srcSets only from normal playback).
  check("slow first frame: no second wake reload", p.P.errors.length === 0 && p.P.srcSets - s1 <= 2, { more: p.P.srcSets - s1, errors: p.P.errors });
  // pathological: 20 s first frame -> the existing start timer handles it, still one wake reload
  const q = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [vid("huge"), vid("other")] } });
  run(15000);
  q.hide(); run(500); freezeFor(3600 * 1000);
  const fz = q.freezeShown(); q.P.slow[fz.getAttribute("data-id") + ".mp4"] = 20000;
  const qs = q.P.srcSets;
  q.show(); run(120000);
  check("very slow first frame: bounded (existing start timer moves on, no wake loop)", q.P.srcSets - qs <= 3 && !!q.shown(), { sets: q.P.srcSets - qs, errors: q.P.errors });
}

// 6) images: wake repaints without any reload.
{
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [{ mediaId: "i1", url: "https://cdn/i1.jpg", durationMs: 600000, kind: "image" }] } });
  run(15000);
  const layer = ["a", "b"].map((k) => p.els[k]).find((l) => l.className.indexOf(" on") !== -1);
  const bg = layer && layer.style.backgroundImage, loads = p.P.imgLoads;
  p.hide(); run(500); freezeFor(3600 * 1000); p.show(); run(15000);
  check("image slide: still on screen with the same picture after wake", !!bg && ["a", "b"].some((k) => p.els[k].className.indexOf(" on") !== -1 && p.els[k].style.backgroundImage === bg));
  check("image slide: no image re-download and no video started", p.P.imgLoads === loads && p.P.srcSets === 0, { loads: p.P.imgLoads - loads });
  const q = boot({ url: "https://cdn/single.jpg" });
  run(15000);
  const ql = q.P.imgLoads;
  for (let i = 0; i < 5; i++) { q.hide(); run(500); q.show(); run(9000); }
  check("single image: repeated wakes never reload the picture", q.P.imgLoads === ql && ["a", "b"].some((k) => q.els[k].className.indexOf(" on") !== -1));
}

// 7) board with a video zone frozen on wake: one re-present, still stays up.
{
  const box = { x: 1286, y: 0, w: 634, h: 1080 };
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [{
    mediaId: "board", url: "https://cdn/board.jpg", durationMs: 600000, kind: "image",
    composition: { layoutVersion: 1, fallbackUrl: "https://cdn/board.jpg", video: { mediaId: "promo", url: "https://cdn/promo.mp4?dur=600", box } },
  }] } });
  run(20000);
  const z = p.zone();
  check("zone video is up before the wake", !!z && z.className.indexOf(" on") !== -1);
  p.hide(); run(500); freezeFor(3600 * 1000); if (z) z.frozen = true;
  const sets = p.loads("promo.mp4");
  p.show(); run(12000);
  check("frozen zone video: exactly one reload, board still visible", p.loads("promo.mp4") - sets === 1 && ["a", "b"].some((k) => p.els[k].className.indexOf(" on") !== -1), { reloads: p.loads("promo.mp4") - sets });
  run(60000);
  check("zone: no reload loop, zone video moving again", p.loads("promo.mp4") - sets === 1 && !!p.zone() && p.zone().currentTime > 1);
}

// 7b) zone frozen for a short time (slide timer not yet due): the wake check itself reloads the zone once.
{
  const box = { x: 1286, y: 0, w: 634, h: 1080 };
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "auto", items: [{
    mediaId: "board", url: "https://cdn/board.jpg", durationMs: 600000, kind: "image",
    composition: { layoutVersion: 1, fallbackUrl: "https://cdn/board.jpg", video: { mediaId: "promo", url: "https://cdn/promo.mp4?dur=600", box } },
  }] } });
  run(20000);
  const z = p.zone();
  p.hide(); run(500); freezeFor(60000); z.frozen = true;
  const sets = p.loads("promo.mp4");
  p.show(); run(7000);
  check("short freeze, zone: nothing reloaded before 8 s", p.loads("promo.mp4") === sets);
  run(5000);
  check("short freeze, zone: exactly one reload by the wake check", p.loads("promo.mp4") - sets === 1, { reloads: p.loads("promo.mp4") - sets });
  run(60000);
  check("short freeze, zone: moving again, no loop", p.loads("promo.mp4") - sets === 1 && !!p.zone() && p.zone().currentTime > 1);
}

// 8) manual mode holding the last frame (ended) is left alone.
{
  const p = boot({ playlist: { id: "pl", transition: "none", playbackMode: "manual", items: [{ mediaId: "m1", url: "https://cdn/m1.mp4?dur=5", durationMs: 0, kind: "video" }, vid("m2")] } });
  run(20000);
  const v = p.shown();
  check("manual clip ended and holds its last frame", !!v && v.ended === true);
  const sets = p.P.srcSets;
  p.hide(); run(500); freezeFor(600000); p.show(); run(12000);
  check("manual hold: wake does not reload or advance", p.P.srcSets === sets && p.shown() === v);
}

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
