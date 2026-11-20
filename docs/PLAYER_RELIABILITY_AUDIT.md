# TV player reliability audit (2026-11-20)

**Status:** fixes deployed in production commit `5a3e3f6` (#163). All soak runs are complete (results below). Not yet tested on Smart TV hardware.

Scope: the production TV player `public/player.html` (plain ES5 page at `/player`, `/tv`, `/pair`), its service worker `public/player-sw.js`, and the routes it calls (`/api/player/state`, `/pair`, `/pair/status`, `/unpair`). Evidence is the code, a virtual-clock simulator that runs the real player script, and headless-Chromium soak runs. **No Smart TV hardware was tested.** Browser automation is not equivalent to a Samsung/LG/Android TV browser (different decoders, GPU memory, power management).

## How the player works (what matters for reliability)

| Area | Implementation | Where |
| --- | --- | --- |
| Content updates | Polls `GET /api/player/state` every `pollMs` (10–30 s; 1.5 s in manual mode; 2.5 s right after a publish). No websockets or Supabase realtime on the TV, so there are no subscriptions to leak. | `pollState` / `handleState` |
| Requests | `XMLHttpRequest`, 15 s timeout plus a 20 s watchdog, so a hung request always ends | `request()` |
| Images | Preloaded with `new Image()`, then shown as a CSS background on one of two layers (fade or swap). No blank frame between slides. | `present`, `swapTo` |
| Video | Two reused `<video>` elements (no element churn). Muted plus `playsinline` for autoplay. A `src` is removed and `load()` called on release, freeing decoders. | `presentVideo`, `releaseVideo` |
| Broken media | Error, autoplay refusal, no start within the cap, and a stall are all skipped and reported to the dashboard ("This video can't play on this TV.", etc.). Known-bad items are skipped for 4, 8, … passes, then retried. | `failOnce`, `markBad`, `skipKnownBad` |
| Network loss | Keeps the last content on screen with a "Reconnecting…" note, and retries every 2 s while content is up. The `online` event triggers an immediate poll. | `handleState`, `online` listener |
| Offline restarts | Where Cache Storage exists, playlist files are saved by `mediaId` (max 500 MB, current playlist only) and replayed from `blob:` URLs. The service worker serves the saved page network-first. | `cacheMedia`, `playSaved`, `player-sw.js` |
| Signed links | Media URLs are Supabase signed links valid for 1 hour, refreshed every 30 minutes (`refresh=1`) | `refreshPlaylistUrls`, state route `URL_TTL_SECONDS` |
| Pairing persistence | The token is kept in `localStorage` (memory fallback), so refresh or restart resumes without a new code | `getToken` / `setToken` |
| Billing pause | 402 shows a paused card and keeps the token, re-checking every 60 s | `status === 402` |
| Codecs | Uploads are validated server-side: H.264 (Baseline/Main/High ≤ level 4.2) MP4, ≤ 1920 px, ≤ 3 min. HEVC/VP9/AV1 are refused with a clear message. | `lib/mp4.ts` |

## Findings

Classification: **Confirmed** = reproduced by a test against the previous player; **Plausible** = the code allows it, but it wasn't reproduced; **Mitigated** = handled by existing code, with test evidence.

| # | Potential failure | Status (before this change) | Evidence | Likelihood / customer impact | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | A slide image request that never answers (stalled Wi-Fi, no error event) freezes the slideshow on the previous slide indefinitely | **Confirmed** | `simulate-player-reliability`: 0 slide changes in 9 min on the previous player | Low–medium on weak restaurant Wi-Fi / Medium: the menu stops rotating (specials never show) until power-cycle | **Fixed (P1):** 30 s load limit, then skip and report |
| 2 | A video reports "playing" but its clock never moves (decoder stuck on the first frame): frozen frame forever, never reported | **Confirmed** | 0 changes in 9 min, no dashboard error | Low (TV decoder quirk) / High when it happens: frozen screen | **Fixed (P0):** 10 s no-progress limit, skip, report, retry later |
| 3 | Any unexpected JavaScript exception while a poll answer is handled stops polling for good (the TV never gets updates again) | **Confirmed** (by injected exception; no natural trigger found) | Polling stopped, 0 calls after the exception | Low / High: menus can't be updated until power-cycle | **Fixed (P0):** poll handler always reschedules |
| 4 | Any unexpected exception during a slide change stops the slideshow for good | **Confirmed** (injected) | 0 advances after one exception | Low / High: frozen menu | **Fixed (P0):** stuck-slideshow safety net (no movement for longest slide + 90 s, then next slide) |
| 5 | One 401 (e.g. an edge or deploy error) unpairs the TV and deletes its saved files; staff must re-pair on site | **Confirmed** | One 401 sends the TV to the pairing screen | Low / High: TV shows a pairing code during service | **Fixed (P1):** unpair only on a second 401, 5 s later (a real dashboard disconnect still unpairs, within ~15 s) |
| 6 | TVs without Cache Storage keep drawing slides from the first signed link even after it expired (1 h): if the browser drops its in-memory copy, the slide is re-requested from a dead link and shows black | **Confirmed in code**; black screen **plausible** (depends on the TV's memory cache) | Simulator: slides drawn from 240-minute-old links | Medium on older TVs / Medium: black slide | **Fixed (P1):** refreshed links replace pins; the next showing preloads the fresh link first |
| 7 | Player fixes never reach a TV that stays on for weeks (the page is never reloaded) | **Confirmed in code** | No reload path existed | Certain / Indirect: every future reliability fix | **Fixed (P1):** server sends `playerBuild`; an older page reloads once (6-hour loop guard). Requires **one manual refresh or restart** of each TV to pick up this first version. |
| 8 | Self-review regression in my first version of #4: a healthy single looping video would be "rescued" after 90 s and then skipped | **Confirmed and fixed before merge** | Harness now matches browsers' `play()` semantics; 1,911 vs ~16,900 loops in 3 days | n/a | Fixed in the same PR (every video time update counts as progress; stall watch re-armed each loop) |
| 8b | A media link that fails (expired early, e.g. the TV slept past the link's life) is only replaced by the scheduled 30-minute refresh. The item is skipped for at least 4 passes, and the back-off never resets after it plays fine again, so later one-off failures wait longer and longer | **Confirmed** (found by the accelerated no-cache soak; reproduced in the simulator: 38 of ~230 video plays in an hour) | Soak: 7 expired-link video requests in 30 min | Low with 60-min links and 30-min refresh / Medium: a video or slide missing for many loops | **Fixed (P1):** a failed network link requests fresh links on the next poll; a first failure retries with the fresh link at once; back-off resets after a successful play |
| 8c | A video whose source fails (dead link, bad file) is reported to the owner as "blocked from autoplaying" | **Confirmed** (soak) | `play()` rejections were all labelled as autoplay | Medium / Low: misleading dashboard message | **Fixed (P1):** `NotSupportedError` is reported as "This video can't play on this TV." (existing translated string) |
| 9 | An edit published while a video is on screen shows black for the new first image's load time (≈ 0.3–3 s) | **Confirmed** (simulator) | Image-to-image edits keep the old slide | Each publish during a video / Low: brief black flash | **P2, not changed** |
| 10 | The service worker returns a server error page (5xx) at boot instead of the saved player | Plausible | `player-sw.js` uses the cache only when fetch throws | Very low (Vercel outage during a TV boot) / Medium | **P2** |
| 11 | Memory leak from media elements, listeners, timers or object URLs | **Mitigated** | Two reused video elements; `removeAttribute('src')` and `load()`; object URLs revoked when content leaves the playlist; listener count constant over 7 simulated days; real-Chromium heap flat (see soak) | Low | None |
| 12 | Network outage / server errors | **Mitigated** | 1 h offline and 30 min of 503s: content stays up, the note shows, updates arrive after | — | None |
| 13 | Autoplay blocked / unsupported or broken media | **Mitigated** | Skipped and reported; image fallback; codec validation at upload | Low | None |
| 14 | Long-running playlist scheduling (timer drift, growth) | **Mitigated** | 7 simulated days, 19,960 loops, pending timers ≤ 12, no errors | — | None |
| 15 | Pairing lost on refresh or restart | **Mitigated** | Token in `localStorage`; simulator check | — | None |
| 16 | Deploy while TVs run | **Mitigated** for API changes (additive contract, old players ignore new fields); see #7 for player code | `tests/api/routes.test.ts` exact contract | — | — |
| 17 | TV browser / renderer crash or OS-level memory pressure | **Untested** (cannot be reproduced without hardware) | — | Unknown / High | Real-TV test below |
| 18 | Power outage → TV doesn't reopen the browser | Accepted (not a requirement) | — | — | — |

## Recommendations

- **P0 (fixed in this change):** #2, #3, #4.
- **P1 (fixed in this change):** #1, #5, #6, #7, #8b, #8c.
- **P2 (optional, not changed):** #9 keep the current video up until the new first image is ready; #10 service worker falls back to the saved page on a 5xx; add an "auto-recovered" note to the dashboard when the safety net fires (needs a new translated message).
- **Future:** dedicated player hardware/app, kiosk launchers that reopen the browser after power loss, offline-first beyond the existing Cache Storage replay, remote reboot.

## Test evidence

**Simulator** (`npm run test:player`, in CI): `scripts/simulate-player-reliability.mjs` runs the real player script on a virtual clock. It has 41 scenarios: 7 days of a mixed loop; 3 days of one looping video; a 2-minute video; a stuck image request; a stuck video; exceptions; one 401; dead and expired links; 1 hour offline; 30 min of 503s; 360 edits; broken media; refresh; and self-update. **The previous player fails 14; this version passes all 41.** The existing 87 player checks still pass.

**Real Chromium soaks** (`scripts/soak-player.mjs`, headless Chromium 153, local mock server, real JPEGs plus 720p H.264 MP4s). Every run had the same scripted events: 3 min offline, playlist edits, about 2 min of 503s, a browser refresh, and one 401. A watcher checked the screen once per second. "Blank" means no layer or video visible and no status screen. "Frozen" means a shown video's clock didn't move for 3 s or more. All runs **finished after the merge of #163** (production `5a3e3f6`).

| Run | Player | Transitions | Blank s | Frozen video s | After one 401 | Expired-link requests | JS heap (1st → 2nd half avg) | DOM nodes | Renderer RSS (1st → 2nd half avg) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 min, no Cache Storage, 5-min links | previous | 331 | 0 | 0 | **unpaired** | 3 (videos skipped) | 1.01 → 1.05 MB | 398–416 | n/a¹ |
| 60 min, Cache Storage | previous | 643 | 0 | 0 | **unpaired** | 0 | 1.05 → 1.10 MB | 398–420 | n/a¹ |
| 30 min, no Cache Storage, 5-min links | fixed, before #8b/#8c² | 451 | 0 | 0 | paired | 7 (led to #8b/#8c) | 1.01 → 1.05 MB | 398–402 | 427 → 430 MB |
| 90 min, one looping video | fixed, before #8b/#8c | 4 (one video, looping) | 1³ | 0 | paired | 0 | 1.01 → 1.00 MB | 397–398 | 383 → 391 MB |
| 120 min, mixed playlist, Cache Storage | fixed, before #8b/#8c | 1,707 | 0 | 0 | paired | 1⁴ | 1.13 → 1.14 MB | 398–402 | 580 → 587 MB |
| **100 min, no Cache Storage, real 1-hour links** | **deployed build** | 1,433 | 0 | 0 | paired | **0** | 1.04 → 1.09 MB | 398–399 | 508 → 517 MB |

No run had a page error, a renderer crash or a reported player error, apart from the expired-link skips noted.

1. Previous-player runs measured renderer memory across every Chromium on the machine (several soaks ran side by side), so those numbers aren't comparable and are omitted.
2. Its 5-minute links are shorter than the player's 30-minute refresh, so this run can't exercise #6. The 100-minute run with real 1-hour links does: it crossed the first expiry with 0 dead-link requests.
3. The one blank second is the page reloading after the scripted browser refresh (the video was back by the next sample).
4. One request hit an expired link with no visible effect (no blank, no skip, no error). It was most likely the background download into Cache Storage using a link older than an hour. It's minor and not a blocker.

**Reading the numbers:** the JS heap stays near 1 MB and DOM nodes stay flat. Event listeners vary between 17 and 24 only because of short-lived request handlers. Renderer memory rises by less than 2% between the first and second half of each run, which is no evidence of a leak over 1.5–2 hours in desktop Chromium. That doesn't prove the same on a TV browser with a different media stack, or over days; see the real-TV tests.

## Real-TV tests to run yourself

1. **24-hour soak on each TV model you sell to.** Use a mixed playlist (3 images, 1 video) and a single looping video. Check in the morning that the menu still rotates and the video still moves.
2. **Wi-Fi cut during service:** unplug the router for 5 minutes, then 1 hour. The menu should stay up with "Reconnecting…", and an edit made while offline should appear within about 30 s of reconnecting.
3. **Edit while playing:** publish a menu change while a video is on screen and while an image is on screen. Expect the change within about 10–15 s (a brief black flash is possible during a video, #9).
4. **Unpair from the dashboard:** the TV should show a new code within about 15 s.
5. **Self-update (once this version is on the TV):** after the next player deploy, the TV should reload by itself once, with a 1–2 s black screen.
6. **Bad media:** upload a video that the TV can't decode (if any). Expect it to be skipped and the dashboard to show "This video can't play on this TV."
7. **Older TV without Cache Storage** (pre-2018 Tizen/webOS): run 3 hours or more and confirm no slide turns black after the first hour (#6).
8. **Power cycle:** confirm the TV reopens the player and resumes without a new code (if the TV restores the browser at all).

**Required once after this deploy:** refresh or restart each TV once, so it runs the build that can update itself.
