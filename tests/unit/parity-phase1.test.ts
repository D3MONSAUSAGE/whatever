import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { screenCounts } from "@/lib/server/screen-counts";
import { playbackReport } from "@/lib/server/playback-report";
import { ONLINE_MS } from "@/lib/server/limits";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const NOW = Date.parse("2026-11-15T20:00:00.000Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("screenCounts (GET /api/overview)", () => {
  it("online needs a connected TV and a fresh heartbeat; waiting is every screen with no TV", () => {
    expect(screenCounts([
      { token_hash: "h1", last_seen_at: at(5_000) }, // paired, online
      { token_hash: "h2", last_seen_at: at(ONLINE_MS + 1) }, // paired, stale heartbeat
      { token_hash: "h3", last_seen_at: at(24 * 3600_000) }, // paired, offline a day
      { token_hash: "h4", last_seen_at: null }, // paired, never checked in
      { token_hash: null, last_seen_at: at(1_000) }, // just unpaired: fresh heartbeat, no TV
      { token_hash: null, last_seen_at: null }, // never paired
      { token_hash: "h5", last_seen_at: "not a date" },
    ], NOW)).toEqual({ online: 1, offline: 4, waiting: 2 });
  });

  it("the heartbeat edge matches GET /api/displays (strictly under ONLINE_MS)", () => {
    expect(screenCounts([{ token_hash: "h", last_seen_at: at(ONLINE_MS - 1) }], NOW).online).toBe(1);
    expect(screenCounts([{ token_hash: "h", last_seen_at: at(ONLINE_MS) }], NOW).offline).toBe(1);
    expect(screenCounts([], NOW)).toEqual({ online: 0, offline: 0, waiting: 0 });
  });
});

describe("playbackReport with no TV connected", () => {
  const playing = { content_version: 3, confirmed_version: 3, confirmed_at: at(10_000), acknowledged_version: 3, acknowledged_at: at(11_000), hasAssignment: true };

  it("is pending with no acknowledged/playing time, whatever the last TV reported", () => {
    expect(playbackReport({ ...playing, connected: false })).toEqual({ reportedState: "pending", contentVersion: 3, acknowledgedAt: null, playingAt: null });
    expect(playbackReport({ content_version: 0, hasAssignment: false, connected: false }).reportedState).toBe("pending");
  });

  it("connected or omitted keeps the earlier states", () => {
    expect(playbackReport({ ...playing, connected: true }).reportedState).toBe("playing");
    expect(playbackReport(playing).reportedState).toBe("playing");
    expect(playbackReport({ content_version: 0, hasAssignment: false, connected: true }).reportedState).toBe("unknown");
  });

  it("only emits values the +14 Android parser knows (screen_contract.dart reportedStateLabels)", () => {
    const known = ["assigned", "acknowledged", "playing", "pending"];
    for (const connected of [true, false, undefined]) {
      for (const row of [playing, { content_version: 2, hasAssignment: true }, { content_version: 0, hasAssignment: false }]) {
        const state = playbackReport({ ...row, connected }).reportedState;
        expect([...known, "unknown"]).toContain(state);
        if (connected === false) expect(known).toContain(state);
      }
    }
  });
});

describe("My Screens waiting count copy", () => {
  it("has EN and ES strings", () => {
    expect(en["screens.waitingPair"]).toBe("Waiting to pair");
    expect(en["screens.nWaiting"]).toBe("{n} waiting to pair");
    expect(es["screens.waitingPair"]).toBeTruthy();
    expect(es["screens.nWaiting"]).toContain("{n}");
  });

  it("always shows offline in the phone summary and counts unconnected screens as waiting", () => {
    const src = readFileSync(path.join(process.cwd(), "components/my-screens.tsx"), "utf8");
    expect(src).toContain("const waitingCount = list.filter((display) => !display.connected).length;");
    expect(src).not.toContain("{offlineCount ? <> · <span");
    expect(src).toContain('t("screens.nOffline", { n: offlineCount })');
  });
});
