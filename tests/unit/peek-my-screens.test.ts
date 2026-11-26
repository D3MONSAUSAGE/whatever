import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { filterPeekScreens, peekScreenCounts, peekScreenStatus } from "@/lib/peek-screens";
import { filterScreens } from "@/lib/screen-filter";
import { onlineNow } from "@/lib/sync-line";

const d = (name: string, connected: boolean, online: boolean, location?: string) => ({ name, connected, online, location: location ? { name: location } : null });
const list = [
  d("Front counter", true, true, "Main St"),
  d("Bar TV", true, false, "Main St"),
  d("Patio", false, false),
  d("Drive-thru", true, true, "Airport"),
  d("Old menu", false, true), // a stale online flag without a TV still reads Waiting, like Status today
];

describe("Peek My Screens status (05-ROUTES status mapping, approved changes 1–2)", () => {
  it("Live = onlineNow, Asleep = connected but not online, Waiting = no TV", () => {
    expect(list.map(peekScreenStatus)).toEqual(["live", "asleep", "waiting", "live", "waiting"]);
    for (const x of list) expect(peekScreenStatus(x) === "live").toBe(onlineNow(x));
  });
  it("filter counts equal the cards each filter shows", () => {
    const counts = peekScreenCounts(list);
    expect(counts).toEqual({ all: 5, live: 2, asleep: 1, waiting: 2 });
    for (const s of ["all", "live", "asleep", "waiting"] as const) expect(filterPeekScreens(list, "", s).length).toBe(counts[s]);
  });
  it("Asleep + Waiting together are exactly today's “not online” filter", () => {
    const today = filterScreens(list, "", "offline").map((x) => x.name);
    const peek = [...filterPeekScreens(list, "", "asleep"), ...filterPeekScreens(list, "", "waiting")].map((x) => x.name);
    expect(peek.sort()).toEqual(today.sort());
  });
  it("search matches name or location exactly like today", () => {
    for (const q of ["main", "BAR", "airport", "zzz", ""]) expect(filterPeekScreens(list, q, "all")).toEqual(filterScreens(list, q, "all"));
    expect(filterPeekScreens(list, "main", "asleep").map((x) => x.name)).toEqual(["Bar TV"]);
  });
});

describe("Peek My Screens wiring", () => {
  const view = readFileSync("components/peek/my-screens-view.tsx", "utf8");
  it("Reconnect opens the workspace's ReconnectTv, never “Wake it”", () => {
    expect(view).toContain("#reconnect");
    expect(view).toContain('t("peek.screens.reconnect")');
    expect(view).not.toMatch(/wake it/i);
  });
  it("keeps the (N offline) tab title and the same ⋯ actions", () => {
    expect(view).toContain("useOfflineTitle(list)");
    for (const k of ["panel=schedule", "panel=playlist", "panel=change", 'label: t("screens.openScreen")']) expect(view).toContain(k);
  });
  it("pairing keeps the same request and the Disconnect confirmation", () => {
    const pair = readFileSync("components/displays-screen.tsx", "utf8");
    expect(pair).toContain('"/api/displays/pair", { method: "POST", body: JSON.stringify(orientation === "portrait" ? { code, name, orientation } : { code, name }) }');
    expect(pair).toContain("onSelect: () => { void disconnect(display); }");
  });
});
