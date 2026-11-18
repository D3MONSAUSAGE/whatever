/**
 * Timing for the playlist editor's slideshow preview (inline and Full preview). Browser-only preview code:
 * TVs run their own player and never use this.
 *
 * One deadline per slide drives both the switch to the next slide and the "Next slide in Ns" countdown, so the
 * number on screen and the actual transition can't drift apart.
 */
export type TimerDeps = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
};

const browserDeps = (): TimerDeps => ({
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id as number),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
});

/** The same floor the preview has always used for an image slide. */
export const MIN_SLIDE_MS = 1000;
export const FALLBACK_SLIDE_MS = 10000;

export function slideMs(durationMs: number | undefined): number {
  return Math.max(MIN_SLIDE_MS, durationMs || FALLBACK_SLIDE_MS);
}

/** Whole seconds left, rounded up: "Next slide in 1s" shows until the slide actually changes. */
export function secondsLeft(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/**
 * Starts a timed slide. Calls onTick(seconds) immediately and whenever the whole-second value changes, then
 * onDone() once at the deadline. stop() clears everything (slide change, playlist edit, or the dialog closing).
 */
export function startSlideTimer(
  durationMs: number,
  handlers: { onTick: (seconds: number) => void; onDone: () => void },
  deps: TimerDeps = browserDeps(),
): { stop: () => void } {
  const ms = slideMs(durationMs);
  const deadline = deps.now() + ms;
  let last = -1;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const s = secondsLeft(deadline - deps.now());
    // At the deadline the switch itself takes over; never flash "0s" first.
    if (s <= 0) return;
    if (s !== last) {
      last = s;
      handlers.onTick(s);
    }
  };
  tick();
  // Four checks a second keep the visible number within a quarter second of the real deadline.
  const interval = deps.setInterval(tick, 250);
  const timeout = deps.setTimeout(() => {
    if (stopped) return;
    stopped = true;
    deps.clearInterval(interval);
    handlers.onDone();
  }, ms);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      deps.clearInterval(interval);
      deps.clearTimeout(timeout);
    },
  };
}

/** Seconds left in a playing video, from its own clock (videos move on when they end). */
export function videoSecondsLeft(duration: number, currentTime: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return secondsLeft((duration - currentTime) * 1000);
}
