import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AlertItem } from "@/lib/api";
import { badgeText, dayLabel, groupAlerts, readBatches, toEpisodes } from "@/lib/notifications";
import { GroupRow, groupText, groupHref, minutesText } from "@/components/notifications";
import { MAX_TOASTS, enqueueToast } from "@/components/toast";
import { TOAST_MS, toastDurationMs } from "@/lib/upload-notice";
import { LocaleProvider } from "@/lib/i18n/client";
import { makeT } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { moreIsActive } from "@/components/shell";

const wrap = (locale: "en" | "es", node: ReactNode) => renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: node }));
let n = 0;
function alert(p: Partial<AlertItem> & Pick<AlertItem, "kind" | "screenName" | "offlineSince" | "at">): AlertItem {
  return { id: `a${++n}`, screenId: `s-${p.screenName}`, offlineSeconds: null, read: false, email: "off", ...p } as AlertItem;
}
const T0 = Date.parse("2026-11-14T17:00:00Z");
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

describe("notification grouping", () => {
  it("pairs an offline alert with the recovery that ends it (same screen and offline start)", () => {
    const eps = toEpisodes([
      alert({ kind: "screen.recovered", screenName: "Kitchen", offlineSince: iso(0), at: iso(12), offlineSeconds: 720, read: true }),
      alert({ kind: "screen.offline", screenName: "Kitchen", offlineSince: iso(0), at: iso(5) }),
    ]);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ resolved: true, backAt: iso(12), offlineSeconds: 720, read: false });
    expect(eps[0].ids).toHaveLength(2);
    const [g] = groupAlerts([
      alert({ kind: "screen.recovered", screenName: "Kitchen", offlineSince: iso(0), at: iso(12), offlineSeconds: 720 }),
      alert({ kind: "screen.offline", screenName: "Kitchen", offlineSince: iso(0), at: iso(5) }),
    ]);
    expect(g).toMatchObject({ kind: "recovered", attention: false, count: 1 });
  });

  it("keeps a screen with no recovery in Needs attention, even after it is read", () => {
    const groups = groupAlerts([alert({ kind: "screen.offline", screenName: "Bar TV", offlineSince: iso(0), at: iso(10), read: true })]);
    expect(groups[0]).toMatchObject({ kind: "offline", attention: true, read: true, screenId: "s-Bar TV" });
    expect(groupHref(groups[0])).toBe("/dashboard/screens/s-Bar TV");
  });

  it("only the newest episode of a screen can need attention", () => {
    const groups = groupAlerts([
      alert({ kind: "screen.recovered", screenName: "Patio", offlineSince: iso(100), at: iso(130) }),
      alert({ kind: "screen.offline", screenName: "Patio", offlineSince: iso(0), at: iso(5) }),
    ]);
    // The older offline row lost its recovery to paging; the screen has since recovered, so nothing is urgent.
    expect(groups.every((g) => !g.attention)).toBe(true);
  });

  it("collapses 3+ screens going offline within 5 minutes into one burst", () => {
    const alerts = ["Front counter", "Kitchen", "Lounge", "Office"].flatMap((name, i) => [
      alert({ kind: "screen.recovered", screenName: name, offlineSince: iso(i), at: iso(15 + i), offlineSeconds: 900 }),
      alert({ kind: "screen.offline", screenName: name, offlineSince: iso(i), at: iso(4 + i) }),
    ]);
    alerts.push(alert({ kind: "screen.offline", screenName: "Bar TV", offlineSince: iso(-600), at: iso(-590) }));
    const groups = groupAlerts(alerts);
    const burst = groups.find((g) => g.kind === "burst")!;
    expect(burst).toMatchObject({ count: 4, attention: false, screenId: null, offlineSince: iso(0), backAt: iso(18) });
    expect(burst.ids).toHaveLength(8);
    expect(groupHref(burst)).toBe("/dashboard/screens");
    expect(groups.find((g) => g.screenName === "Bar TV")?.kind).toBe("offline");
    expect(groups).toHaveLength(2);
  });

  it("two screens are not a burst", () => {
    const groups = groupAlerts([
      alert({ kind: "screen.offline", screenName: "A", offlineSince: iso(0), at: iso(1) }),
      alert({ kind: "screen.offline", screenName: "B", offlineSince: iso(1), at: iso(2) }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["offline", "offline"]);
  });

  it("collapses 3+ outages of one screen within 24 hours into one flapping row", () => {
    const alerts = [0, 120, 300].flatMap((m) => [
      alert({ kind: "screen.recovered", screenName: "Lounge", offlineSince: iso(m), at: iso(m + 6), offlineSeconds: 360 }),
      alert({ kind: "screen.offline", screenName: "Lounge", offlineSince: iso(m), at: iso(m + 3) }),
    ]);
    alerts.push(alert({ kind: "screen.offline", screenName: "Lounge", offlineSince: iso(-3000), at: iso(-2990) }));
    const groups = groupAlerts(alerts);
    const flap = groups.find((g) => g.kind === "flap")!;
    expect(flap).toMatchObject({ count: 3, attention: false, backAt: iso(306) });
    expect(flap.ids).toHaveLength(6);
    // The outage two days earlier stays its own row.
    expect(groups).toHaveLength(2);
  });

  it("caps the badge and batches read requests at the endpoint's limit of 100 ids", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
    const ids = Array.from({ length: 230 }, (_, i) => `id${i}`);
    expect(readBatches(ids).map((b) => b.length)).toEqual([100, 100, 30]);
  });

  it("labels days as Today, Yesterday, or a date in the account language", () => {
    const now = new Date(2026, 10, 17, 12);
    const labels = { today: "Today", yesterday: "Yesterday" };
    expect(dayLabel(new Date(2026, 10, 17, 8).toISOString(), now, "en", labels)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 16, 23).toISOString(), now, "en", labels)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 10, 9).toISOString(), now, "es", labels)).toMatch(/nov/i);
  });
});

describe("notification text, both languages", () => {
  it("says what happened in plain words, in English and Spanish", () => {
    const [back] = groupAlerts([
      alert({ kind: "screen.recovered", screenName: "Kitchen", offlineSince: iso(0), at: iso(12), offlineSeconds: 720 }),
      alert({ kind: "screen.offline", screenName: "Kitchen", offlineSince: iso(0), at: iso(5) }),
    ]);
    expect(groupText(back, makeT("en"), "en").title).toBe("Kitchen is back online");
    expect(groupText(back, makeT("en"), "en").body).toMatch(/^Was offline 12 min\. Back at /);
    expect(groupText(back, makeT("es"), "es").title).toBe("Kitchen volvió a estar en línea");
    expect(minutesText(720)).toBe("12 min");
    expect(minutesText(3 * 3600)).toBe("3 h");
  });

  it("renders a row as a button with the unread state for screen readers and no emoji", () => {
    const [g] = groupAlerts([alert({ kind: "screen.offline", screenName: "Bar TV", offlineSince: iso(0), at: iso(1) })]);
    const html = wrap("es", createElement(GroupRow, { group: g, onOpen: () => undefined }));
    expect(html).toContain("<button");
    expect(html).toContain("Bar TV está sin conexión");
    expect(html).toContain("Sin leer.");
    expect(html).not.toMatch(/🔴|🟢/);
  });

  it("has every new string in both languages, translated", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("nc.") || k.startsWith("shell.") || ["dash.nav.overview", "dash.nav.more", "dash.nav.notifications"].includes(k)) as (keyof typeof en)[];
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
  });
});

describe("toasts", () => {
  it("routine toasts fade after 5 seconds; errors stay until dismissed", () => {
    expect(TOAST_MS).toBe(5_000);
    expect(toastDurationMs(false)).toBe(5_000);
    expect(toastDurationMs(true)).toBeNull();
    expect(toastDurationMs(false, 2_000)).toBe(2_000);
    expect(toastDurationMs(false, null)).toBeNull();
  });

  it("stacks up to three, drops the oldest, and replaces an identical message", () => {
    const mk = (id: number, text: string, error = false) => ({ id, text, error, durationMs: null as number | null });
    let list: Parameters<typeof enqueueToast>[0] = [mk(1, "a"), mk(2, "b"), mk(3, "c")];
    list = enqueueToast(list, mk(4, "d"));
    expect(MAX_TOASTS).toBe(3);
    expect(list.map((t) => t.id)).toEqual([2, 3, 4]);
    list = enqueueToast(list, mk(5, "c"));
    expect(list.map((t) => t.text)).toEqual(["b", "d", "c"]);
  });
});

describe("app shell and notification center wiring", () => {
  const shell = readFileSync("components/shell.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  it("no longer puts alert or billing banners above every page", () => {
    expect(shell).not.toMatch(/AlertsBanner|BillingBanner/);
    expect(existsSync("components/billing-banner.tsx")).toBe(false);
    expect(readFileSync("components/alerts.tsx", "utf8")).not.toContain("export function AlertsBanner");
    expect(shell).toContain("<NotificationBell />");
    expect(shell).toContain("<BillingChip />");
    expect(shell).toContain("<NotificationsProvider preview={preview} fixture={notifications}>");
  });

  it("keeps the alert history at its old URL and adds /dashboard/notifications", () => {
    expect(readFileSync("app/dashboard/alerts/page.tsx", "utf8")).toContain("<AlertsScreen />");
    expect(readFileSync("app/dashboard/notifications/page.tsx", "utf8")).toContain("<AlertsScreen />");
    const alerts = readFileSync("components/alerts.tsx", "utf8");
    expect(alerts).toContain(`useApi<AlertFeed>(fixture ? null : "/api/alerts?limit=50", 60_000)`);
    expect(alerts).toContain("/api/alerts?limit=50&before=");
    expect(alerts).toContain("export function AlertSettings()");
  });

  it("uses the existing endpoints and read semantics", () => {
    const nc = readFileSync("components/notifications.tsx", "utf8");
    expect(nc).toContain('const FEED = "/api/alerts?limit=50";');
    expect(nc).toContain('useApi<Entitlements>(live ? "/api/entitlements" : null, 60_000)');
    expect(nc).toContain('api("/api/alerts/read", { method: "POST", body: JSON.stringify({ ids }) })');
    expect(nc).toContain('api("/api/alerts/read", { method: "POST", body: JSON.stringify({ all: true }) })');
  });

  it("routes every shell link through the unsaved-changes guard", () => {
    expect(shell).not.toMatch(/<Link\b|from "next\/link"/);
    expect(shell).toContain("requestLeave(() => void onSignOut())");
    expect(readFileSync("components/notifications.tsx", "utf8")).toContain("requestLeave(() => router.push(href))");
  });

  it("collapses to an icon rail on tablets and in the editor, and hides the phone tabs in the editor", () => {
    expect(css).toMatch(/@media \(min-width: 768px\) and \(max-width: 1279px\) \{\s*\.ps-side \{ width: 4\.5rem;/);
    expect(css).toContain("body:has(.studio-app) .ps-side { width: 4.5rem;");
    expect(css).toContain("body:has(.studio-app) .ps-mtabs { display: none; }");
    expect(css).toContain("body:has(.studio-app) .ps-topbar { position: static; }");
  });

  it("marks More current for the pages that live behind it", () => {
    for (const p of ["/dashboard", "/dashboard/playlists", "/dashboard/playlists/x", "/dashboard/account/brand-kit", "/dashboard/settings", "/dashboard/billing", "/dashboard/notifications", "/developer/analytics"]) {
      expect(moreIsActive(p), p).toBe(true);
    }
    for (const p of ["/dashboard/screens", "/dashboard/media/menus", "/dashboard/content", "/dashboard/schedule"]) {
      expect(moreIsActive(p), p).toBe(false);
    }
  });
});
