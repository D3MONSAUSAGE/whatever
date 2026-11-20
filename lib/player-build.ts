/**
 * Build id of public/player.html (its `PLAYER_BUILD` constant). Every 200 answer of GET /api/player/state carries
 * it as `playerBuild`; a running TV whose page has a different build reloads itself once, so player fixes reach
 * TVs that stay on for weeks. Change both together whenever public/player.html changes
 * (tests/unit/player-build.test.ts enforces it). Players from before this field ignore it.
 */
export const PLAYER_BUILD = "2026-11-20.1";
