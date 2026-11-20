import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PLAYER_BUILD } from "@/lib/player-build";

/** A running TV reloads itself when GET /api/player/state reports a different build than its own page. */
describe("player build id", () => {
  const html = readFileSync("public/player.html", "utf8");
  it("public/player.html and lib/player-build.ts carry the same build", () => {
    const m = /var PLAYER_BUILD = '([^']+)';/.exec(html);
    expect(m?.[1]).toBe(PLAYER_BUILD);
  });
  it("the state route sends it on every successful answer", () => {
    const route = readFileSync("app/api/player/state/route.ts", "utf8");
    expect(route).toContain("playerBuild: PLAYER_BUILD");
  });
});
