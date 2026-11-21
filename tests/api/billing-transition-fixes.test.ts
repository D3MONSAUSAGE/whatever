import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";
import { POST as selectActiveScreens } from "@/app/api/entitlements/active-screens/route";
import { POST as pairDisplay } from "@/app/api/displays/pair/route";
import { GET as listDisplays } from "@/app/api/displays/route";
import { POST as createMedia } from "@/app/api/media/route";
import { POST as publishDisplay } from "@/app/api/displays/publish/route";
import { POST as createPlaylist } from "@/app/api/playlists/route";
import { PATCH as patchDisplay } from "@/app/api/displays/[id]/route";
import { POST as applyBrand } from "@/app/api/brand/apply/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { hashCode, sha256 } from "@/lib/server/crypto";
import type { EntitlementRow } from "@/lib/server/entitlements";

const prevEnforce = process.env.BILLING_ENFORCE;
const prevPairingSecret = process.env.PAIRING_CODE_SECRET;

type Harness = {
  store: Store;
  entitlements: Map<string, EntitlementRow | null | "error" | "throw">;
  selectCalls: Array<{ accountId: string; ids: string[] }>;
  playerThrow: Set<string>;
};

function wrapFakeDb(h: Harness, fake: ReturnType<typeof createFakeDb>) {
  const baseClient = fake.client as unknown as {
    from: (table: string) => unknown;
    rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    auth: unknown;
    storage: unknown;
  };
  return {
    auth: baseClient.auth,
    storage: baseClient.storage,
    from(table: string) {
      return baseClient.from(table);
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name === "account_entitlement") {
        const accountId = String(args.p_account ?? "");
        const spec = h.entitlements.get(accountId);
        if (spec === "throw") throw new Error("database connection lost");
        if (spec === "error") return { data: null, error: { message: "rpc timeout" } };
        if (spec === null || spec === undefined) return { data: [], error: null };
        return { data: [spec], error: null };
      }
      if (name === "entitled_display_ids") {
        const accountId = String(args.p_account ?? "");
        const spec = h.entitlements.get(accountId);
        if (spec === "throw") throw new Error("database connection lost");
        if (spec === "error") return { data: null, error: { message: "rpc timeout" } };
        if (!spec || !spec.playback_allowed) return { data: [], error: null };
        const rows = h.store.displays
          .filter((d) => d.account_id === accountId && d.status !== "deleted" && d.billing_active !== false)
          .slice(0, spec.screen_limit)
          .map((d) => ({ display_id: d.id }));
        return { data: rows, error: null };
      }
      if (name === "display_entitled") {
        const displayId = String(args.p_display ?? "");
        if (h.playerThrow.has(displayId)) throw new Error("player db blip");
        const disp = h.store.displays.find((d) => d.id === displayId);
        if (!disp) return { data: false, error: null };
        const spec = h.entitlements.get(String(disp.account_id));
        if (spec === "throw") throw new Error("db timeout");
        if (spec === "error") return { data: null, error: { message: "rpc error" } };
        if (!spec || !spec.playback_allowed) return { data: false, error: null };
        return { data: disp.billing_active !== false, error: null };
      }
      if (name === "player_pending_commands") return { data: [], error: null };
      if (name === "select_billing_screens") {
        const accountId = String(args.p_account ?? "");
        const ids = (args.p_display_ids ?? []) as string[];
        h.selectCalls.push({ accountId, ids });
        const spec = h.entitlements.get(accountId);
        const limit = spec && typeof spec === "object" ? spec.screen_limit : 0;
        if (ids.length > limit) return { data: "too_many", error: null };
        const owned = h.store.displays.filter((d) => d.account_id === accountId && d.status !== "deleted");
        if (!ids.every((id) => owned.some((d) => d.id === id))) return { data: "not_found", error: null };
        for (const d of owned) d.billing_active = ids.includes(String(d.id));
        return { data: "ok", error: null };
      }
      return baseClient.rpc(name, args);
    },
  };
}

function row(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    state: "active",
    plan: "multi",
    screen_limit: 5,
    active_screens: 1,
    total_screens: 1,
    trial_started_at: null,
    trial_ends_at: null,
    playback_ends_at: "2026-12-11T15:27:47.000Z",
    subscription_status: "active",
    current_period_end: "2026-12-11T15:27:47.000Z",
    cancel_at_period_end: false,
    grace_ends_at: null,
    playback_allowed: true,
    can_add_screen: true,
    server_time: "2026-11-21T20:00:00.000Z",
    ...overrides,
  };
}

let harness: Harness;
const ACCT_A = "aaaa1111-1111-4111-8111-111111111111";
const ACCT_B = "bbbb2222-2222-4222-8222-222222222222";
const DISP_A1 = "1111aaaa-1111-4111-8111-111111111111";
const DISP_A2 = "2222aaaa-2222-4222-8222-222222222222";
const DISP_B1 = "1111bbbb-1111-4111-8111-111111111111";
const PLAYER_TOKEN_A = "player-token-a-0123456789abcdef";

beforeEach(() => {
  process.env.BILLING_ENFORCE = "1";
  process.env.PAIRING_CODE_SECRET = "test-pairing-secret-123";
  const fake = createFakeDb();
  harness = {
    store: fake.store,
    entitlements: new Map(),
    selectCalls: [],
    playerThrow: new Set(),
  };
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "a@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "b@example.com");
  fake.store.accounts.push(
    { id: ACCT_A, name: "Cafe A", owner_user_id: "11111111-1111-4111-8111-111111111111", plan: "multi", created_at: "2026-11-01T08:00:00Z" },
    { id: ACCT_B, name: "Cafe B", owner_user_id: "22222222-2222-4222-8222-222222222222", plan: "multi", created_at: "2026-11-01T08:00:00Z" },
  );
  fake.store.displays.push(
    { id: DISP_A1, account_id: ACCT_A, name: "A TV 1", status: "active", billing_active: true, token_hash: sha256(PLAYER_TOKEN_A), content_version: 1 },
    { id: DISP_A2, account_id: ACCT_A, name: "A TV 2", status: "active", billing_active: true, token_hash: createHash("sha256").update("t2").digest("hex"), content_version: 1 },
    { id: DISP_B1, account_id: ACCT_B, name: "B TV 1", status: "active", billing_active: true, token_hash: createHash("sha256").update("t3").digest("hex"), content_version: 1 },
  );
  setTestDb(wrapFakeDb(harness, fake) as never);
});

afterEach(() => {
  setTestDb(null);
  if (prevEnforce === undefined) delete process.env.BILLING_ENFORCE;
  else process.env.BILLING_ENFORCE = prevEnforce;
  if (prevPairingSecret === undefined) delete process.env.PAIRING_CODE_SECRET;
  else process.env.PAIRING_CODE_SECRET = prevPairingSecret;
});

describe("Issue #2: trial_grace locks active-screens and preserves playback", () => {
  it("refuses POST /api/entitlements/active-screens during trial_grace (403 subscription_inactive) and keeps player running", async () => {
    harness.entitlements.set(ACCT_A, row({
      state: "trial_grace",
      plan: "multi",
      screen_limit: 5,
      trial_started_at: "2026-11-01T08:00:00.000Z",
      trial_ends_at: "2026-11-15T08:00:00.000Z",
      playback_ends_at: "2026-11-18T08:00:00.000Z",
      subscription_status: "canceled",
      current_period_end: "2026-11-15T08:00:00.000Z",
      can_add_screen: false,
      playback_allowed: true,
      server_time: "2026-11-16T08:00:00.000Z",
    }));
    harness.entitlements.set(ACCT_B, row({ state: "active", plan: "starter", screen_limit: 1 }));

    const blocked = await selectActiveScreens(new Request("https://pekkotv.com/api/entitlements/active-screens", {
      method: "POST",
      headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
      body: JSON.stringify({ displayIds: [DISP_A1] }),
    }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "subscription_inactive" });
    expect(harness.selectCalls).toEqual([]);

    // Existing published playback for Account A continues uninterrupted
    const playRes = await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": PLAYER_TOKEN_A },
    }));
    expect(playRes.status).toBe(200);

    // Spanish error copy is localized cleanly on active-screens lock
    const esBlocked = await selectActiveScreens(new Request("https://pekkotv.com/api/entitlements/active-screens", {
      method: "POST",
      headers: { Authorization: "Bearer token-a", "Content-Type": "application/json", "Accept-Language": "es" },
      body: JSON.stringify({ displayIds: [DISP_A1] }),
    }));
    expect(esBlocked.status).toBe(403);
    expect(await esBlocked.json()).toMatchObject({ code: "subscription_inactive" });

    // Once expired, player stops with 402 (content kept); DB throw on player check preserves 200 playback
    harness.playerThrow.add(DISP_A1);
    expect((await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": PLAYER_TOKEN_A },
    }))).status).toBe(200);
    harness.playerThrow.delete(DISP_A1);

    harness.entitlements.set(ACCT_A, row({
      state: "expired", plan: "multi", screen_limit: 0, playback_allowed: false, can_add_screen: false,
      trial_ends_at: "2026-11-15T08:00:00.000Z", playback_ends_at: null, subscription_status: "canceled",
      server_time: "2026-11-18T08:00:00.000Z",
    }));
    expect((await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": PLAYER_TOKEN_A },
    }))).status).toBe(402);

    // Tenant B remains completely unaffected and can still choose screens
    const okB = await selectActiveScreens(new Request("https://pekkotv.com/api/entitlements/active-screens", {
      method: "POST",
      headers: { Authorization: "Bearer token-b", "Content-Type": "application/json" },
      body: JSON.stringify({ displayIds: [DISP_B1] }),
    }));
    expect(okB.status).toBe(200);
    expect(harness.selectCalls).toEqual([{ accountId: ACCT_B, ids: [DISP_B1] }]);
  });

  it("allows POST /api/entitlements/active-screens when active (downgraded), trial, past_due, or grandfathered", async () => {
    for (const state of ["active", "trial", "past_due", "grandfathered"] as const) {
      harness.entitlements.set(ACCT_A, row({ state, plan: "starter", screen_limit: 1, can_add_screen: false }));
      const res = await selectActiveScreens(new Request("https://pekkotv.com/api/entitlements/active-screens", {
        method: "POST",
        headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
        body: JSON.stringify({ displayIds: [DISP_A1] }),
      }));
      expect(res.status, state).toBe(200);
    }
  });
});

describe("Issue #3: every write-gated route fails closed with 503 plan_check_unavailable", () => {
  it("blocks media, publish, playlists, displays patch, brand apply, active-screens, and pairing when entitlement lookup fails or is missing", async () => {
    harness.store.pairing_sessions.push({
      id: randomUUID(),
      code_hash: hashCode("123456"),
      session_secret_hash: "sec",
      status: "pending",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    harness.entitlements.set(ACCT_B, row({ state: "active", plan: "multi" }));

    for (const mode of ["error", "throw", null] as const) {
      harness.entitlements.set(ACCT_A, mode);

      const calls = [
        () => createMedia(new Request("https://pekkotv.com/api/media", {
          method: "POST",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: "a.jpg", contentType: "image/jpeg", byteSize: 1024 }),
        })),
        () => publishDisplay(new Request("https://pekkotv.com/api/displays/publish", {
          method: "POST",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({ displayId: DISP_A1 }),
        })),
        () => createPlaylist(new Request("https://pekkotv.com/api/playlists", {
          method: "POST",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Menu", items: [] }),
        })),
        () => patchDisplay(new Request(`https://pekkotv.com/api/displays/${DISP_A1}`, {
          method: "PATCH",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Renamed" }),
        }), { params: Promise.resolve({ id: DISP_A1 }) }),
        () => applyBrand(new Request("https://pekkotv.com/api/brand/apply", {
          method: "POST",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })),
        () => selectActiveScreens(new Request("https://pekkotv.com/api/entitlements/active-screens", {
          method: "POST",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({ displayIds: [DISP_A1] }),
        })),
        () => pairDisplay(new Request("https://pekkotv.com/api/displays/pair", {
          method: "POST",
          headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
          body: JSON.stringify({ code: "123456", name: "Front TV" }),
        })),
      ];

      for (const invoke of calls) {
        const res = await invoke();
        expect(res.status, `mode=${String(mode)}`).toBe(503);
        expect(res.headers.get("Retry-After")).toBe("5");
        const json = await res.json();
        expect(json.code).toBe("plan_check_unavailable");
      }

      // Displays listing and TV playback preserve already-authorized playback during a lookup outage
      if (mode !== null) {
        const displaysRes = await listDisplays(new Request("https://pekkotv.com/api/displays", {
          headers: { Authorization: "Bearer token-a" },
        }));
        expect(displaysRes.status).toBe(200);
        const list = await displaysRes.json() as Array<{ entitled: boolean }>;
        expect(list.every((d) => d.entitled === true)).toBe(true);

        const playRes = await playerState(new Request("https://pekkotv.com/api/player/state", {
          headers: { "x-display-token": PLAYER_TOKEN_A },
        }));
        expect(playRes.status).toBe(200);
      }

      // Account B's writes still succeed while Account A's entitlement lookup fails
      const bPlay = await createPlaylist(new Request("https://pekkotv.com/api/playlists", {
        method: "POST",
        headers: { Authorization: "Bearer token-b", "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tenant B Menu", items: [] }),
      }));
      expect(bPlay.status).not.toBe(503);
    }
  });
});
