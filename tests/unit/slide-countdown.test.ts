import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { secondsLeft, slideMs, startSlideTimer, videoSecondsLeft, type TimerDeps } from "@/lib/slide-timer";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const fakeDeps = (): TimerDeps => ({
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
});

afterEach(() => { vi.useRealTimers(); });

describe("slide countdown timer", () => {
  it("counts down every second and moves to the next slide exactly when it reaches the end", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const done = vi.fn();
    startSlideTimer(8000, { onTick: (s) => ticks.push(s), onDone: done }, fakeDeps());
    expect(ticks).toEqual([8]);
    vi.advanceTimersByTime(1000);
    expect(ticks.at(-1)).toBe(7);
    vi.advanceTimersByTime(6000);
    expect(ticks.at(-1)).toBe(1);
    expect(done).not.toHaveBeenCalled(); // "1s" stays up until the switch
    vi.advanceTimersByTime(999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(ticks).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    vi.advanceTimersByTime(10_000);
    expect(done).toHaveBeenCalledTimes(1); // no ticks or switches after the slide ended
    expect(ticks).toHaveLength(8);
  });

  it("uses each slide's own duration and restarts from it on the next slide", () => {
    vi.useFakeTimers();
    const durations = [10_000, 3000, 5000]; // playlist default, a 3 s override, a presentation slide's own time
    let index = 0;
    const seen: string[] = [];
    let timer: { stop: () => void } | null = null;
    const start = () => {
      timer = startSlideTimer(durations[index], {
        onTick: (s) => seen.push(`${index}:${s}`),
        onDone: () => { index = (index + 1) % durations.length; start(); },
      }, fakeDeps());
    };
    start();
    vi.advanceTimersByTime(10_000);
    expect(index).toBe(1);
    expect(seen.at(-1)).toBe("1:3");
    vi.advanceTimersByTime(3000);
    expect(index).toBe(2);
    expect(seen.at(-1)).toBe("2:5");
    vi.advanceTimersByTime(5000);
    expect(index).toBe(0);
    expect(seen.at(-1)).toBe("0:10");
    timer!.stop();
  });

  it("stops completely when the preview closes or the slide changes by hand", () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const done = vi.fn();
    const timer = startSlideTimer(5000, { onTick: tick, onDone: done }, fakeDeps());
    expect(vi.getTimerCount()).toBe(2);
    timer.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(20_000);
    expect(done).not.toHaveBeenCalled();
    expect(tick).toHaveBeenCalledTimes(1);
    timer.stop(); // safe to call twice
  });

  it("keeps the preview's existing minimum and fallback durations, and rounds up", () => {
    expect(slideMs(0)).toBe(10_000);
    expect(slideMs(200)).toBe(1000);
    expect(slideMs(7000)).toBe(7000);
    expect(secondsLeft(7001)).toBe(8);
    expect(secondsLeft(7000)).toBe(7);
    expect(secondsLeft(-5)).toBe(0);
    expect(videoSecondsLeft(12, 3.2)).toBe(9);
    expect(videoSecondsLeft(Number.NaN, 0)).toBeNull();
    expect(videoSecondsLeft(0, 0)).toBeNull();
  });
});

describe("playlist preview wiring", () => {
  const src = () => readFileSync("components/playlist-editor.tsx", "utf8");

  it("one timer drives both the countdown and the slide change; the old separate timeout is gone", () => {
    const s = src();
    expect(s).toContain("const timer = startSlideTimer(slide.durationMs, {\n      onTick: setSecondsToNext,\n      onDone: () => setIndex((current) => (current + 1) % slides.length),");
    expect(s).toContain("return () => timer.stop();");
    expect(s).not.toContain("window.setTimeout(() => setIndex(");
    // Videos keep moving on when they end, and count down from their own clock.
    expect(s).toContain("const left = videoSecondsLeft(event.currentTarget.duration, event.currentTarget.currentTime);");
    expect(s).toContain("setIndex((currentIndex) => (currentIndex + 1) % slides.length);");
  });

  it("shows the countdown in both the inline and Full preview, readable on demand by screen readers", () => {
    const s = src();
    expect(s).toContain('<p className="slide-countdown" role="timer" data-testid="slide-countdown">');
    expect(s).toContain('t("pe.nextIn", { n: secondsToNext })');
    expect(s.match(/<Preview slides=\{previewSlides\}/g)).toHaveLength(2);
    expect(en["pe.nextIn"]).toBe("Next slide in {n}s");
    for (const k of ["pe.nextIn", "pe.oneSlide", "pe.manualMode", "pe.playing"] as const) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
    expect(s).not.toContain('" · Manual"');
  });

  it("uses the configured durations: playlist default, slide override, presentation slide times, video length", () => {
    const s = src();
    expect(s).toContain("? (Number.isFinite(defaultMs) && defaultMs >= 1000 ? defaultMs : 10000)\n        : Math.round(Number(slide.seconds) * 1000);");
    expect(s).toContain("durationMs: part.durationMs ?? Math.max(3000, base),");
    expect(s).toContain("? (slide.mediaDurationMs && slide.mediaDurationMs >= 500 ? slide.mediaDurationMs : 5000)");
  });

  it("does not touch the TV player", () => {
    expect(readFileSync("public/player.html", "utf8")).not.toContain("slide-timer");
  });
});
