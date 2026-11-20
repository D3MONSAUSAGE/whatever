import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fingerprint } from "./helpers/render-fingerprint";

/**
 * Durable guard (Gother R11 process LOW): the TV player and the renderers must not change by accident.
 * If a PR intentionally changes them, update tests/fixtures/render-guard.json in that same PR
 * (regenerate with UPDATE_RENDER_GUARD=1 npx vitest run tests/unit/render-guard.test.ts) and call it out
 * for explicit review. The player SHA is also pinned literally below.
 */
const PLAYER_SHA = "dd448f981236660f2602a07adf8335b75d7b43c2b4f6df82a42232c1379eecf0";
const allow = JSON.parse(readFileSync("tests/fixtures/render-guard.json", "utf8"));
const HOW = "Renderer/player output changed. If intended, update tests/fixtures/render-guard.json in this PR and flag it for explicit review.";

describe("render guard", () => {
  it("pins public/player.html", () => {
    expect(fingerprint().files["public/player.html"], HOW).toBe(PLAYER_SHA);
    expect(allow.files["public/player.html"]).toBe(PLAYER_SHA);
  });
  it("renderer files and SVG output match the allowlist", async () => {
    const now = fingerprint();
    if (process.env.UPDATE_RENDER_GUARD === "1") {
      const { writeFileSync } = await import("node:fs");
      writeFileSync("tests/fixtures/render-guard.json", JSON.stringify(now, null, 1) + "\n");
      return;
    }
    for (const [f, h] of Object.entries(allow.files)) expect(now.files[f], `${f}: ${HOW}`).toBe(h);
    expect(Object.keys(now.outputs).sort()).toEqual(Object.keys(allow.outputs).sort());
    for (const [k, h] of Object.entries(allow.outputs)) expect(now.outputs[k], `${k}: ${HOW}`).toBe(h);
  });
});
