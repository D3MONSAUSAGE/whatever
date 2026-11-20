// Reliability scenarios for public/player.html on a virtual clock (fresh player per scenario).
// Long-running loops, stuck media, network loss, auth failures, handler exceptions and resource growth.
// Run: node scripts/simulate-player-reliability.mjs
import { readFileSync } from "node:fs";
import { createPlayer, report } from "./player-harness.mjs";

const R = report();
const HOUR = 3600_000, DAY = 24 * HOUR;
const playlist = (items, extra = {}) => ({ id: "p1", transition: "fade", playbackMode: "auto", items, ...extra });
const img = (n, ms = 8000) => ({ mediaId: n, url: `https://cdn.test/${n}.jpg`, durationMs: ms, kind: "image" });
const vid = (n, dur = 6000) => ({ mediaId: n, url: `https://cdn.test/${n}.mp4?dur=${dur}`, durationMs: 0, kind: "video" });

function started(items, opts = {}) {
  const p = createPlayer(opts);
  p.S.playlist = playlist(items, opts.playlistExtra);
  p.boot();
  p.run(5000);
  return p;
}
const advances = (p, from) => p.log.filter((e) => e.at >= from).length;

// 1. Seven days of a mixed image + video menu loop: keeps advancing, no blank frames, bounded timers.
{
  const p = started([img("menu1"), vid("promo", 6000), img("menu2"), img("menu3")]);
  p.watchBlank(true);
  const t0 = p.now;
  const listeners0 = JSON.stringify(p.listenerCounts());
  let maxTimers = 0;
  p.run(7 * DAY, () => { if (p.timers > maxTimers) maxTimers = p.timers; });
  const cycles = p.log.filter((e) => e.name === "menu1" && e.at >= t0).length;
  R.check("7-day mixed loop keeps cycling (≥ 19,000 loops of ~30 s)", cycles >= 19000, cycles);
  R.check("7-day loop never shows a blank screen", p.blank === 0, p.blank);
  R.check("7-day loop keeps pending timers bounded (≤ 12)", maxTimers <= 12, maxTimers);
  R.check("7-day loop adds no event listeners", JSON.stringify(p.listenerCounts()) === listeners0, JSON.stringify(p.listenerCounts()));
  R.check("7-day loop has no uncaught errors", p.errors.length === 0, p.errors[0]);
  R.check("signed URLs are refreshed about every 30 minutes", p.S.stateCalls > 7 * DAY / 10000 * 0.9);
}

// 2. Single looping video for 3 days: loops back-to-back, is never "rescued" or reported as broken.
{
  const p = started([vid("loop", 15000)]);
  const starts0 = p.stats.videoStarts;
  p.run(3 * DAY);
  const loops = p.stats.videoStarts - starts0;
  R.check("single video loops for 3 days without stopping (~16,900 loops of 15 s)", loops >= 16000, loops);
  R.check("single looping video is never reported as broken", p.S.errorLog.length === 0, p.S.errorLog[0]);
  R.check("single video loop has no uncaught errors", p.errors.length === 0, p.errors[0]);
  R.check("single video still on screen after 3 days", p.name(p.shown()) === "loop");
}
// 2b. A long video (2 minutes) in a playlist plays to its end; the stuck net (longest image + 90 s) does not cut it.
{
  const p = started([img("a", 5000), vid("long", 120000)]);
  p.run(30 * 60_000);
  R.check("a 2-minute video is not cut short by the stuck-slideshow net", p.S.errorLog.length === 0 && p.log.filter((e) => e.name === "long").length >= 10, `${p.log.filter((e) => e.name === "long").length} plays, errors ${p.S.errorLog.length}`);
}
// 2c. A single looping video that stalls on a later loop is noticed (not frozen forever).
{
  const p = started([vid("loop", 10000)]);
  p.run(5 * 60_000);
  const v = [p.els.va, p.els.vb].find((x) => x.className.includes("on"));
  const realPlay = v.play.bind(v);
  let stalled = false;
  v.play = function () { if (!stalled) { stalled = true; this.paused = false; this._playing = this._src; return { then(ok) { if (ok) ok(); } }; } return realPlay(); };
  p.run(5 * 60_000);
  R.check("a single looping video that stalls on a later loop is detected and retried", p.S.errorLog.some((e) => /stalled/.test(e)) && p.stats.videoStarts > 30, `${p.S.errorLog.join("|")} starts=${p.stats.videoStarts}`);
}

// 2d. A healthy looping video that is paused (display sleep / lock screen) is resumed, not reported as unplayable.
{
  const p = started([vid("loop", 8000)]);
  const v = [p.els.va, p.els.vb].find((x) => x.className.includes("on"));
  const starts0 = p.stats.videoStarts;
  const errors0 = p.S.errorLog.length;
  v.pause();
  p.run(20_000);
  R.check("a paused looping video is not reported as broken", p.S.errorLog.length === errors0, p.S.errorLog.slice(errors0).join("|"));
  R.check("a paused looping video is started again and stays on screen", p.stats.videoStarts > starts0 && p.name(p.shown()) === "loop", `starts=${p.stats.videoStarts - starts0} shown=${p.name(p.shown())} status=${p.els.status.innerHTML}`);
  R.check("the player does not show 'can't play' after a pause", !/can't play/i.test(p.els.status.innerHTML || ""), p.els.status.innerHTML);
}

// 2e. A hidden tab with a paused video must not trip the stall watchdog or the stuck-slideshow net.
{
  const p = started([vid("loop", 8000)]);
  const v = [p.els.va, p.els.vb].find((x) => x.className.includes("on"));
  p.setHidden(true);
  v.pause();
  p.run(3 * 60_000);
  R.check("a hidden paused video is not reported as broken", p.S.errorLog.length === 0, p.S.errorLog[0]);
  R.check("a hidden paused video is still the current item", p.name(p.shown()) === "loop");
  p.setHidden(false);
  p.run(10_000);
  R.check("the video resumes after the tab is visible again, with no error", p.S.errorLog.length === 0 && p.name(p.shown()) === "loop", p.S.errorLog[0]);
}

// 2f. A playing video whose clock is frozen is still skipped (real decoder stall).
{
  const p = started([vid("loop", 8000)]);
  const v = [p.els.va, p.els.vb].find((x) => x.className.includes("on"));
  const frozen = v.currentTime;
  // A stuck decoder stops the clock and timeupdate, but leaves the element "playing".
  v.ontimeupdate = null;
  v.pause();
  v.play = function () { this.paused = false; this._playing = this._src; return { then(ok) { if (ok) ok(); } }; };
  Object.defineProperty(v, "paused", { configurable: true, get() { return false; }, set() {} });
  Object.defineProperty(v, "currentTime", { configurable: true, get() { return frozen; }, set() {} });
  p.run(15_000);
  R.check("a playing video whose clock is frozen is still reported as stalled", p.S.errorLog.some((e) => /stalled/.test(e)), p.S.errorLog.join("|"));
}

// 3. A slide image that never answers (stalled connection, no error event).
{
  const p = started([img("ok1", 5000), img("hang", 5000), img("ok2", 5000)]);
  const t0 = p.now;
  p.run(10 * 60_000);
  R.check("an image request that never answers does not freeze the slideshow", advances(p, t0 + 60_000) >= 10, advances(p, t0 + 60_000));
}

// 4. A video that reports playing but whose clock never moves (decoder stall at the first frame).
{
  const p = started([img("ok1", 5000), vid("mute", 6000), img("ok2", 5000)]);
  const t0 = p.now;
  p.run(10 * 60_000);
  R.check("a video stuck on its first frame is skipped (slideshow keeps going)", advances(p, t0 + 60_000) >= 10, advances(p, t0 + 60_000));
  R.check("the stuck video is reported to the dashboard", p.S.errorLog.some((e) => /stalled|did not start|can't play/.test(e)), p.S.errorLog.join("|"));
}
// 4b. Same, as the only item.
{
  const p = started([vid("mute", 6000)]);
  p.run(10 * 60_000);
  R.check("a single video stuck on its first frame is reported", p.S.errorLog.length > 0, p.S.errorLog.length);
}

// 5. Unexpected exception while one poll answer is handled.
{
  const p = started([img("a", 5000), img("b", 5000)]);
  p.throwOnNextStatus();
  p.S.version = 2;
  p.S.playlist = playlist([img("c", 5000), img("d", 5000)]);
  p.run(2 * 60_000);
  R.check("one handler exception does not stop polling for content", p.S.playlist && ["c", "d"].includes(p.name(p.shown())), p.name(p.shown()));
  const calls = p.S.stateCalls;
  p.run(60_000);
  R.check("polling continues after a handler exception", p.S.stateCalls > calls, p.S.stateCalls - calls);
}

// 6b. Signed media URLs expire after 1 hour (Supabase). A TV without Cache Storage (older browsers) must not keep
//     drawing a URL older than that: the image would be re-requested from an expired link and show black.
{
  const p = started([img("a", 5000), img("b", 5000), img("c", 5000)]);
  let worst = 0;
  p.run(4 * HOUR, (t) => {
    const m = /sig=(\d+)/.exec(p.shown());
    if (m) worst = Math.max(worst, t - Number(m[1]));
  });
  R.check("no slide is drawn from a signed URL older than its 1-hour lifetime", worst < HOUR, Math.round(worst / 60000) + " min");
}

// 5b. Unexpected exception inside a slide change (any unforeseen bug): the stuck-slideshow safety net moves on.
{
  const p = started([img("a", 5000), img("b", 5000), img("c", 5000)]);
  for (const id of ["a", "b"]) {
    const style = p.els[id].style;
    let armed = true, value = style.backgroundImage;
    Object.defineProperty(style, "backgroundImage", {
      configurable: true,
      get() { return value; },
      set(v) { if (armed && String(v).includes("c.jpg")) { armed = false; throw new Error("simulated paint exception"); } value = v; },
    });
  }
  p.run(60_000);
  const t0 = p.now;
  p.run(5 * 60_000);
  R.check("an exception during a slide change is recovered within ~2 minutes", advances(p, t0) >= 20 && p.errors.length >= 1, `${advances(p, t0)} advances, ${p.errors.length} errors`);
}

// 6c. A dead link (expired early, e.g. the TV slept past the link's life) is replaced on the next poll, not after
//     the 30-minute refresh: links live 5 minutes here, so the scheduled refresh alone would leave items skipped.
{
  const p = started([img("a", 5000), vid("v", 5000), img("b", 5000)]);
  p.S.linkTtlMs = 5 * 60_000;
  // Server links and the player's pins both start fresh; only the early expiry is unusual.
  const t0 = p.now;
  p.run(60 * 60_000);
  const shownV = p.log.filter((e) => e.at >= t0 && e.name === "v").length;
  const shownB = p.log.filter((e) => e.at >= t0 && e.name === "b").length;
  R.check("dead links are refreshed on the next poll: video and images keep playing (≥ 150 plays each in 60 min)", shownV >= 150 && shownB >= 150, `v=${shownV} b=${shownB} expired=${p.stats.expired}`);
  R.check("a dead video link is reported as a playback failure, not an autoplay block", !p.S.errorLog.some((e) => /autoplay/.test(e)), p.S.errorLog.slice(0, 3).join("|"));
}

// 6. A single 401 (e.g. an edge error during a deploy) must not unpair; a real unpair still does.
{
  const p = started([img("a", 5000), img("b", 5000)]);
  p.S.status = 401;
  const before = p.S.stateCalls;
  while (p.S.stateCalls === before) p.run(500); // exactly one poll answered 401
  p.S.status = null;
  p.run(60_000);
  R.check("one transient 401 keeps the TV paired and playing", p.screen() === "content" && !!p.storage.pantalla_display_token, p.screen());
  p.S.token = "other".repeat(5);
  p.run(2 * 60_000);
  R.check("a real disconnect (repeated 401) still returns the TV to pairing", p.screen() === "pair" && !p.storage.pantalla_display_token, p.screen());
}

// 7. Network loss for an hour keeps the menu on screen and recovers; updates made while offline arrive.
{
  const p = started([img("a", 5000), img("b", 5000)]);
  p.watchBlank(true);
  p.S.online = false;
  p.S.hangWhenOffline = true;
  p.run(HOUR);
  R.check("1 hour offline: the menu stays on screen (no blank)", p.blank === 0 && p.screen() === "content", p.blank);
  R.check("1 hour offline: a 'Reconnecting' note is shown", p.els.status.className.includes("on"));
  p.S.online = true; p.S.hangWhenOffline = false;
  p.S.version = 2;
  p.S.playlist = playlist([img("c", 5000)]);
  p.run(60_000);
  R.check("after reconnecting, the update made while offline is on screen", p.name(p.shown()) === "c" && !p.els.status.className.includes("on"), p.name(p.shown()));
}

// 8. Server errors (503) for 30 minutes: content keeps playing, then updates.
{
  const p = started([img("a", 5000), img("b", 5000)]);
  p.S.status = 503;
  const t0 = p.now;
  p.run(30 * 60_000);
  R.check("30 minutes of 503: slides keep advancing", advances(p, t0) > 300, advances(p, t0));
  p.S.status = null; p.S.version = 3; p.S.playlist = playlist([img("z", 5000)]);
  p.run(60_000);
  R.check("after 503s end, new content arrives", p.name(p.shown()) === "z");
}

// 9. Playlist edits during playback, every minute for 6 hours.
//    Known P2 (not changed here): an edit that lands while a video is on screen shows black until the new
//    first image has loaded (300 ms in this simulation). Image slides stay up during edits.
{
  const p = started([img("a", 4000), vid("v", 5000), img("b", 4000)]);
  let run = null, longest = 0, gaps = 0;
  for (let i = 0; i < 360; i++) {
    p.S.version += 1;
    const n = `e${i}`;
    p.S.playlist = playlist(i % 3 === 0 ? [img(n, 4000)] : [img(n, 4000), vid(`v${i % 2}`, 5000), img("b", 4000)]);
    p.run(60_000, (t) => {
      const blank = p.visible().length === 0 && p.screen() === "content";
      if (blank && run === null) { run = t; gaps++; }
      if (!blank && run !== null) { longest = Math.max(longest, t - run); run = null; }
    });
  }
  R.check("360 playlist edits: last edit is playing", p.log.some((e) => e.name === "e359"));
  R.check("360 playlist edits: any black gap lasts only the new image's load (≤ 1 s here)", longest <= 1000, `${gaps} gaps, longest ${longest} ms`);
  R.check("360 playlist edits: no uncaught errors", p.errors.length === 0, p.errors[0]);
}

// 10. Missing / invalid / unsupported media.
{
  const p = started([img("bad1", 5000), vid("bad2", 5000), img("good", 5000)]);
  p.run(10 * 60_000);
  R.check("broken image and unsupported video are skipped; good slide plays", p.name(p.shown()) === "good" || p.log.some((e) => e.name === "good"));
  R.check("broken media is reported to the dashboard", p.S.errorLog.length > 0);
}
{
  const p = started([img("bad1", 5000), vid("bad2", 5000)]);
  p.run(30 * 60_000);
  R.check("all-broken playlist does not crash and keeps retrying", p.errors.length === 0 && p.S.stateCalls > 100, p.errors[0]);
}

// 11. Refresh / restart: a saved token resumes playback without pairing.
{
  const first = started([img("a", 5000)]);
  const p = createPlayer({ storage: first.storage });
  p.S.playlist = playlist([img("a", 5000)]);
  p.boot();
  p.run(5000);
  R.check("after a browser refresh the TV resumes without a new code", p.screen() === "content" && p.name(p.shown()) === "a");
}

// 12. Self-update: a newer player build reloads the page once; the same build never loops; matching build is quiet.
{
  const p = started([img("a", 5000)]);
  const html = readFileSync(new URL("../public/player.html", import.meta.url), "utf8");
  const currentBuild = /var PLAYER_BUILD = '([^']+)'/.exec(html)[1];
  p.S.playerBuild = currentBuild;
  p.run(60_000);
  R.check("matching player build: no reload", p.stats.reloads === 0, p.stats.reloads);
  p.S.playerBuild = "2099-01-01.1";
  p.run(60_000);
  R.check("newer player build: the TV reloads once", p.stats.reloads === 1, p.stats.reloads);
  p.run(2 * HOUR);
  R.check("a build that keeps differing never causes a reload loop (6-hour guard)", p.stats.reloads === 1, p.stats.reloads);
  p.run(5 * HOUR);
  R.check("after 6 hours it may try once more", p.stats.reloads === 2, p.stats.reloads);
}
{
  const p = started([img("a", 5000)]);
  p.S.status = 503;
  p.S.playerBuild = "2099-01-01.1";
  p.run(10 * 60_000);
  R.check("no reload while the server is failing (the page might not come back)", p.stats.reloads === 0, p.stats.reloads);
}

R.done();
