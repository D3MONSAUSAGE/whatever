// Fresh copy of public/player.html's script per scenario, with a fake DOM, fake network and a virtual clock.
// Used by scripts/simulate-player-reliability.mjs. Media behaviour is chosen by words in the URL:
//   images: "bad" → error, "hang" → never answers, otherwise loads after 300 ms
//   videos: "bad" → error, "mute" → plays (onplaying) but the clock never moves, "freeze" → one tick then stops,
//           otherwise plays for dur=<ms> (default 3000) and ends
import { readFileSync } from "node:fs";

// PLAYER_HTML lets the same scenarios run against another copy (e.g. the previous release, to prove a check catches a bug).
const html = readFileSync(process.env.PLAYER_HTML || new URL("../public/player.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

export function createPlayer(options = {}) {
  let now = 0, tid = 0, timers = [];
  const RealDate = Date;
  const origin = RealDate.parse("2026-11-20T15:00:00Z");
  class VDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [origin + now])); }
    static now() { return origin + now; }
  }
  const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (Number(ms) || 0), fn }); return id; };
  const clearTimeout_ = (id) => { timers = timers.filter((t) => t.id !== id); };
  const errors = [];
  const stats = { imageLoads: 0, videoStarts: 0, reloads: 0 };

  const els = {};
  const ids = ["a", "b", "pair", "empty", "connecting", "paused", "paused-title", "paused-msg", "pair-label", "code", "status",
    "manual", "manual-pos", "prev", "next", "unpair", "unpair-yes", "unpair-no", "unpair-msg"];
  for (const id of ids) {
    const base = id === "status" ? "status" : id === "manual" ? "manual" : id === "unpair" ? "unpair" : id.length === 1 ? "layer"
      : ["pair", "empty", "connecting", "paused"].includes(id) ? "screen" : "";
    els[id] = { id, className: base, style: {}, innerHTML: "", textContent: "", setAttribute() {}, getAttribute() { return null; }, focus() {} };
  }
  function makeVideo(id) {
    const v = {
      id, className: "stage", style: {}, muted: true, paused: true, currentTime: 0, duration: 3000, videoWidth: 320, videoHeight: 180,
      _src: "", _attrs: {}, onplaying: null, onended: null, onerror: null, ontimeupdate: null, loop: false,
      setAttribute(n, val) { this._attrs[n] = String(val); },
      getAttribute(n) { return Object.prototype.hasOwnProperty.call(this._attrs, n) ? this._attrs[n] : null; },
      removeAttribute(n) { delete this._attrs[n]; if (n === "src") { this._src = ""; this._playing = ""; } },
      load() {},
      pause() { this.paused = true; this._playing = ""; },
      play() {
        const src = this._src;
        // Like browsers: play() on an element that is already playing resolves without a new "playing" event.
        const already = !this.paused && this._playing === src;
        this.paused = false;
        return {
          then: (ok, bad) => {
            setTimeout_(() => {
              if (this._src !== src) return;
              if (already) { if (ok) ok(); return; }
              this._playing = src;
              if (expired(src)) stats.expired++;
              if (!src || src.includes("bad") || expired(src)) { if (this.onerror) this.onerror(); if (bad) bad({ name: "NotSupportedError" }); return; }
              stats.videoStarts++;
              this.currentTime = 0.1;
              if (this.onplaying) this.onplaying();
              if (ok) ok();
              if (src.includes("mute")) return; // playing, but no frame ever advances
              if (src.includes("freeze")) { if (this.ontimeupdate) this.ontimeupdate(); return; }
              const step = () => {
                if (this._src !== src || this.paused) return;
                this.currentTime += 0.25;
                if (this.ontimeupdate) this.ontimeupdate();
                if (this.currentTime * 1000 >= this.duration) { this.paused = true; this._playing = ""; if (this.onended) this.onended(); return; }
                setTimeout_(step, 250);
              };
              setTimeout_(step, 250);
            }, 300);
          },
        };
      },
    };
    Object.defineProperty(v, "src", {
      get() { return v._src; },
      set(value) { v._src = value || ""; v._playing = ""; v.paused = true; const m = /dur=(\d+)/.exec(value || ""); v.duration = m ? Number(m[1]) : 3000; v.currentTime = 0; },
    });
    return v;
  }
  els.va = makeVideo("va");
  els.vb = makeVideo("vb");

  const storage = options.storage ? { ...options.storage } : { pantalla_display_token: "tok".repeat(10) };
  const winListeners = {};
  const docListeners = {};
  const window_ = {
    innerWidth: 1280, innerHeight: 720,
    localStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v); }, removeItem: (k) => { delete storage[k]; } },
    addEventListener: (e, f) => { (winListeners[e] = winListeners[e] || []).push(f); },
    location: { hostname: "pekkotv.com", pathname: "/player", reload() { stats.reloads++; } },
    navigator: {},
    setTimeout: setTimeout_, clearTimeout: clearTimeout_,
  };
  const document_ = {
    getElementById: (id) => els[id],
    documentElement: {},
    body: { className: "" },
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); },
  };

  // Fake server. `S` is mutated by scenarios.
  const S = {
    online: true, token: "tok".repeat(10), version: 1, url: null, playlist: null, stateCalls: 0, errorLog: [], playing: [],
    status: null, // force a status for GET /api/player/state (e.g. 401, 503)
    latency: 300, playerBuild: undefined,
    linkTtlMs: 0, // when set, a media URL whose sig= is older than this fails like an expired signed link
  };
  function server(method, url, body, headers) {
    if (!S.online) return [0, ""];
    if (url === "/api/player/pair") return [200, { sessionId: "s1", code: "123456", secret: "x".repeat(40) }];
    if (url === "/api/player/pair/status") return [200, { status: "pending" }];
    if (url.startsWith("/api/player/state") && method === "POST") {
      if (body && body.playing) S.playing.push(body.playing.version);
      if (body && body.error) S.errorLog.push(body.error);
      return [200, { ok: true }];
    }
    if (url.startsWith("/api/player/state")) {
      S.stateCalls++;
      if (S.status) return [S.status, S.status === 401 ? { error: "unauthorized", code: "unauthorized" } : { error: "unavailable" }];
      if (headers["X-Display-Token"] !== S.token) return [401, { error: "unauthorized", code: "unauthorized" }];
      const v = new URL("http://x" + url).searchParams.get("v");
      const refresh = url.includes("refresh=1");
      const extra = { pollMs: 10000, commands: [] };
      if (S.playerBuild !== undefined) extra.playerBuild = S.playerBuild;
      if (v !== "" && Number(v) === S.version && !refresh) return [200, { version: S.version, unchanged: true, ...extra }];
      if (S.playlist) {
        const items = S.playlist.items.map((it) => ({ ...it, url: it.url + (it.url.includes("?") ? "&" : "?") + "sig=" + now }));
        return [200, { version: S.version, mediaId: items[0].mediaId, url: items[0].url, playlist: { ...S.playlist, items }, ...extra }];
      }
      return [200, { version: S.version, mediaId: S.url ? "m1" : null, url: S.url ? S.url + "?sig=" + now : null, ...extra }];
    }
    return [404, {}];
  }
  class XHR {
    open(m, u) { this.m = m; this.u = u; this.h = {}; }
    setRequestHeader(k, v) { this.h[k] = v; }
    abort() { this.aborted = true; }
    send(b) {
      const hang = !S.online && S.hangWhenOffline;
      if (hang) return; // the request watchdog has to rescue this one
      setTimeout_(() => {
        if (this.aborted) return;
        const [status, data] = server(this.m, this.u, b ? JSON.parse(b) : null, this.h);
        this.readyState = 4; this.status = status; this.responseText = typeof data === "string" ? data : JSON.stringify(data);
        try { this.onreadystatechange(); } catch (e) { errors.push(String(e && e.message)); }
      }, S.latency);
    }
  }
  const expired = (u) => { const m = /sig=(\d+)/.exec(u || ""); return !!(S.linkTtlMs && m && now - Number(m[1]) > S.linkTtlMs); };
  stats.expired = 0;
  class Img {
    set src(u) {
      this._u = u;
      if (u.includes("hang")) return;
      setTimeout_(() => {
        if (expired(u)) { stats.expired++; if (this.onerror) this.onerror(); return; }
        if (u.includes("bad")) { if (this.onerror) this.onerror(); return; }
        stats.imageLoads++;
        if (this.onload) this.onload();
      }, 300);
    }
    get src() { return this._u; }
  }
  // Uncaught exceptions inside timer callbacks are recorded, like a browser's error console.
  function runTimer(t) { try { t.fn(); } catch (e) { errors.push(String(e && e.stack || e)); } }

  const visible = () => ["a", "b", "va", "vb"].filter((k) => els[k].className.includes("on"));
  const screen = () => ["pair", "empty", "connecting", "paused"].find((k) => els[k].className.includes("on")) || "content";
  const topLayer = () => {
    const on = visible();
    on.sort((x, y) => (Number(els[y].style.zIndex) || 0) - (Number(els[x].style.zIndex) || 0));
    return on[0] || null;
  };
  const shown = () => {
    const t = topLayer();
    if (!t) return "";
    return t.length === 1 ? String(els[t].style.backgroundImage || "") : els[t]._src;
  };
  const name = (u) => { const m = /\/([A-Za-z0-9_-]+)\.(?:jpg|mp4)/.exec(u || ""); return m ? m[1] : ""; };

  let log = [];
  let blank = 0;
  let watchBlank = false;
  function run(ms, step) {
    const end = now + ms;
    for (;;) {
      timers.sort((x, y) => x.at - y.at || x.id - y.id);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      runTimer(t);
      const cur = name(shown());
      if (cur && cur !== (log.length ? log[log.length - 1].name : "")) log.push({ name: cur, at: now });
      if (watchBlank && visible().length === 0 && screen() === "content") blank++;
      if (step) step(now);
    }
    now = end;
  }
  function boot() {
    new Function("window", "document", "XMLHttpRequest", "Image", "setTimeout", "clearTimeout", "localStorage", "Date", js)(
      window_, document_, XHR, Img, setTimeout_, clearTimeout_, window_.localStorage, VDate);
  }
  function fire(target, type) {
    const list = target === "window" ? winListeners[type] : docListeners[type];
    for (const fn of list || []) { try { fn({ key: "" }); } catch (e) { errors.push(String(e)); } }
  }
  return {
    S, els, storage, stats, errors,
    boot, run, fire, screen, shown, visible, name,
    get now() { return now; },
    get timers() { return timers.length; },
    get log() { return log; },
    resetLog() { log = []; },
    get blank() { return blank; },
    watchBlank(on) { watchBlank = on; blank = 0; },
    // Any unexpected exception while a poll answer is handled: the next write to the status bar throws once.
    throwOnNextStatus() {
      const st = els.status;
      let armed = true, value = st.innerHTML;
      Object.defineProperty(st, "innerHTML", {
        configurable: true,
        get() { return value; },
        set(v) { if (armed) { armed = false; throw new Error("simulated handler exception"); } value = v; },
      });
    },
    listenerCounts() {
      const count = (m) => Object.values(m).reduce((n, l) => n + l.length, 0);
      return { window: count(winListeners), document: count(docListeners) };
    },
  };
}

export function report() {
  let pass = 0, fail = 0;
  return {
    check(label, ok, detail) {
      console.log((ok ? "✓ " : "✗ ") + label + (ok || detail === undefined ? "" : `  [${detail}]`));
      if (ok) pass++; else fail++;
    },
    done() {
      console.log(`\n${pass} passed, ${fail} failed`);
      if (fail) process.exitCode = 1;
    },
  };
}
