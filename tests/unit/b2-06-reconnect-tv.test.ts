import { describe, expect, it } from "vitest";
import { reconnectCode, reconnectIntro } from "@/lib/reconnect-tv";

describe("B2-06: reconnect a TV to an existing screen", () => {
  it("accepts the 6-digit code with spaces or dashes and rejects anything else", () => {
    expect(reconnectCode("482913")).toBe("482913");
    expect(reconnectCode(" 482 913 ")).toBe("482913");
    expect(reconnectCode("482-913")).toBe("482913");
    expect(reconnectCode("48291")).toBeNull();
    expect(reconnectCode("4829130")).toBeNull();
    expect(reconnectCode("")).toBeNull();
  });

  it("explains what happens for each connection state and that the screen keeps its setup", () => {
    const base = { name: "Bar TV 2" };
    const notConnected = reconnectIntro({ ...base, connected: false, online: false });
    const offline = reconnectIntro({ ...base, connected: true, online: false });
    const online = reconnectIntro({ ...base, connected: true, online: true });
    expect(notConnected).toContain("No TV is connected");
    expect(offline).toContain("old connection stops working");
    expect(online).toContain("disconnected");
    for (const text of [notConnected, offline, online]) {
      expect(text).toContain("“Bar TV 2”");
      expect(text).toContain("keeps its name, content, schedules and groups");
    }
  });
});
