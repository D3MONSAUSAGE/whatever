import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A PostgREST builder is lazy: constructing it does not send the request.
 * `then` is what starts it. This mock counts that call, not the rpc() call.
 */
const state = vi.hoisted(() => ({
  executed: 0,
  results: [] as Array<{ data: boolean | null; error: { message: string } | null } | { reject: Error }>,
}));

vi.mock("@/lib/server/supabase", () => ({
  BUCKET: "media",
  db: () => ({
    rpc: () => ({
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        state.executed += 1;
        const next = state.results.shift() ?? { data: true, error: null };
        const pending = "reject" in next ? Promise.reject(next.reject) : Promise.resolve(next);
        return pending.then(onFulfilled, onRejected);
      },
    }),
  }),
}));

import { HEARTBEAT_MS, startClaimHeartbeat } from "@/lib/server/presentation-upload";

afterEach(() => {
  vi.useRealTimers();
  state.executed = 0;
  state.results.length = 0;
  vi.restoreAllMocks();
});

/** Only the timers the heartbeat uses. Leaving setImmediate real keeps Vitest's worker RPC on the real clock. */
function useHeartbeatTimers() {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
}

describe("presentation claim heartbeat", () => {
  it("executes the lazy request on every tick and stops when cleared", async () => {
    useHeartbeatTimers();
    const beat = startClaimHeartbeat("account", "media", "token");
    try {
      expect(state.executed).toBe(0);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(state.executed).toBe(1);
      expect(beat.lost()).toBe(false);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(state.executed).toBe(2);

      beat.stop();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(state.executed).toBe(2);
    } finally {
      beat.stop();
      vi.useRealTimers();
    }
  });

  it("stops the worker when the claim is lost and does not tick again", async () => {
    useHeartbeatTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.results.push({ data: false, error: null });
    const beat = startClaimHeartbeat("account", "media", "token");
    try {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(state.executed).toBe(1);
      expect(beat.lost()).toBe(true);
      expect(errors).toHaveBeenCalledWith("presentation claim was lost", { mediaId: "media" });

      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(state.executed).toBe(1);
    } finally {
      beat.stop();
      vi.useRealTimers();
    }
  });

  it("logs a failed heartbeat and keeps the claim", async () => {
    useHeartbeatTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.results.push({ data: null, error: { message: "timeout" } });
    state.results.push({ reject: new Error("network") });
    const beat = startClaimHeartbeat("account", "media", "token");
    try {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(beat.lost()).toBe(false);
      expect(errors).toHaveBeenCalledWith("presentation claim heartbeat failed", { mediaId: "media", error: "timeout" });

      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(state.executed).toBe(2);
      expect(beat.lost()).toBe(false);
      expect(errors).toHaveBeenCalledWith("presentation claim heartbeat failed", { mediaId: "media", error: "network" });
    } finally {
      beat.stop();
      vi.useRealTimers();
    }
  });
});
