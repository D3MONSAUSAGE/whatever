import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase", () => ({ db: () => { throw new Error("no db in unit tests"); } }));
const { playingStep } = await import("@/lib/server/onboarding");

const confirmedTv = { confirmed_at: "2026-11-17T18:00:00Z", confirmed_version: 4 };
const neverConfirmed = { confirmed_at: null, confirmed_version: null };

describe("onboarding step 8 (Check it's playing)", () => {
  it("stays done after the TV confirmed published content, even when no screen is online now", () => {
    // The phone-browser case: TVs are off, so nothing is online at the moment the tracker loads.
    expect(playingStep({ livePlaying: false, liveConfirmed: false, publish: true, screens: [confirmedTv] }))
      .toEqual({ playing: true, confirmed: true });
  });

  it("is not done until a TV has confirmed painting content (or is online with content now)", () => {
    expect(playingStep({ livePlaying: false, liveConfirmed: false, publish: true, screens: [neverConfirmed] }))
      .toEqual({ playing: false, confirmed: false });
    expect(playingStep({ livePlaying: false, liveConfirmed: false, publish: true, screens: [] }))
      .toEqual({ playing: false, confirmed: false });
    // A version without a confirmation time is not a confirmation.
    expect(playingStep({ livePlaying: false, liveConfirmed: false, publish: true, screens: [{ confirmed_at: null, confirmed_version: 3 }] }).playing).toBe(false);
  });

  it("does not count an old confirmation once nothing is published any more", () => {
    expect(playingStep({ livePlaying: false, liveConfirmed: false, publish: false, screens: [confirmedTv] }))
      .toEqual({ playing: false, confirmed: false });
  });

  it("keeps the live rules: online with content is done (waiting for confirmation), live confirmation is confirmed", () => {
    expect(playingStep({ livePlaying: true, liveConfirmed: false, publish: true, screens: [neverConfirmed] }))
      .toEqual({ playing: true, confirmed: false });
    expect(playingStep({ livePlaying: true, liveConfirmed: true, publish: true, screens: [neverConfirmed] }))
      .toEqual({ playing: true, confirmed: true });
  });

  it("is computed on the server for the account, so every browser and the app get the same answer", () => {
    const src = readFileSync("lib/server/onboarding.ts", "utf8");
    expect(src).toContain("const { playing, confirmed } = playingStep({ livePlaying, liveConfirmed, publish, screens });");
    expect(src).toContain('{ id: "playing", done: playing, confirmed },');
    // Nothing on the client remembers or overrides step state.
    const tracker = readFileSync("components/setup-tracker.tsx", "utf8");
    expect(tracker).not.toMatch(/localStorage|sessionStorage/);
    expect(tracker).toContain('useApi<OnboardingState>(fixture ? null : "/api/onboarding"');
  });

  it("only treats a painted confirmation as evidence (report_playing runs after the player paints content)", () => {
    const player = readFileSync("public/player.html", "utf8");
    expect(player).toMatch(/function markPainted\(v\) \{\s*paintedVersion = v;\s*confirmPlaying\(\);/);
    const sql = readFileSync("supabase/migrations/0005_analytics.sql", "utf8");
    expect(sql).toContain("update public.displays set confirmed_version = p_version, confirmed_at = now() where id = d.id;");
  });
});
