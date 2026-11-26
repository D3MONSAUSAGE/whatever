import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { boardTvCount, lockedPublishRows, publishTargets } from "@/lib/peek-publish";
import { filterPeekBoards, peekBoardState, showingSummaryText } from "@/components/peek/menu-boards-view";
import { makeT } from "@/lib/i18n";
import { afterClassicSave } from "@/lib/show-on-screens";
import type { DisplayItem } from "@/lib/api";

const disp = (id: string, o: { online?: boolean; connected?: boolean; playlist?: string; media?: string }): DisplayItem => ({
  id, name: id, connected: o.connected ?? true, online: o.online ?? true, lastSeenAt: null,
  playlist: o.playlist ? { id: o.playlist, name: o.playlist, url: null } : null,
  media: o.media ? { id: o.media, fileName: `${o.media}.png`, url: null } : null,
} as unknown as DisplayItem);

// 05-ROUTES AC: 5 displays (own playlist, direct image, other playlist, unassigned, asleep own playlist).
const board = { playlistId: "pl-board", mediaId: "m-board" };
const five = [
  disp("own", { playlist: "pl-board" }),
  disp("direct", { media: "m-board" }),
  disp("other", { playlist: "pl-other" }),
  disp("none", {}),
  disp("asleep-own", { playlist: "pl-board", online: false }),
];

describe("Publish dialog locked rows (verified rule 1–2)", () => {
  it("locks exactly own-playlist and direct-image TVs; asleep ones say 'when it reconnects'", () => {
    const locked = lockedPublishRows(board, five);
    expect([...locked.keys()].sort()).toEqual(["asleep-own", "direct", "own"]);
    expect(locked.get("asleep-own")?.asleep).toBe(true);
    expect(locked.get("own")?.asleep).toBe(false);
  });
  it("a TV on another playlist stays a normal row (edge case: no promise either way)", () => {
    expect(lockedPublishRows(board, five).has("other")).toBe(false);
  });
  it("a never-published board locks nothing", () => {
    expect(lockedPublishRows({ playlistId: null, mediaId: null }, five).size).toBe(0);
    expect(lockedPublishRows(null, five).size).toBe(0);
  });
  it("ticked unlocked rows are sent; locked rows never are", () => {
    const locked = lockedPublishRows(board, five);
    expect(publishTargets({ own: true, other: true, none: false, direct: true }, locked)).toEqual(["other"]);
  });
  it("the dialog keeps Publish / Publishing… and the toasts", () => {
    const src = readFileSync("components/menu-templates.tsx", "utf8");
    expect(src).toContain('peek ? t("ls.publish")');
    expect(src).toContain('t("tpl.publishing")');
    expect(src).toContain('t("tpl.publishedOn", { n: ids.length })');
    expect(src).toContain("peek.publish.autoUpdatesAsleep");
  });
});

describe("Menu Boards list states", () => {
  const menus = [
    { id: "a", playlistId: "pl-a", mediaId: "m-a" },
    { id: "b", playlistId: "pl-b", mediaId: "m-b" },
    { id: "c", playlistId: null, mediaId: null },
  ];
  const displays = [disp("1", { playlist: "pl-a" }), disp("2", { playlist: "pl-a", online: false }), disp("3", { playlist: "pl-a", connected: false })];
  it("Live · N TVs counts connected displays on the board's playlist, the afterClassicSave rule", () => {
    expect(boardTvCount(menus[0], displays)).toBe(2);
    const updated = afterClassicSave({ created: false, fromScreen: false, tickedScreens: 0, playlistId: "pl-a", displays });
    expect(updated.kind === "updated" && updated.screens.length).toBe(2);
  });
  it("Live / Drafts filters", () => {
    expect(filterPeekBoards(menus, displays, "live").map((m) => m.id)).toEqual(["a"]);
    expect(filterPeekBoards(menus, displays, "drafts").map((m) => m.id)).toEqual(["c"]);
    expect(filterPeekBoards(menus, displays, "all").length).toBe(3);
    expect(peekBoardState(menus[1], displays)).toEqual({ tvs: 0, live: false, draft: false });
  });
  it("Delete keeps the existing confirmation and toast", () => {
    const src = readFileSync("components/menu-boards.tsx", "utf8");
    expect(src).toContain('title: t("mb.delTitle")');
    expect(src).toContain('onDelete={(menu) => { void remove(menu); }}');
    expect(src).toContain('toast.show(t("mb.deleted"))');
  });
});

describe("TV counts read singular for one", () => {
  for (const loc of ["en", "es"] as const) it(loc, () => {
    const t = makeT(loc);
    const one = t("peek.menus.liveOnOneTv"), two = t("peek.menus.liveOnTvs", { n: 2 });
    expect(one).toMatch(/1 TV$/); expect(two).toMatch(/2 TVs?$/);
    expect(showingSummaryText(t, 1, 1)).not.toMatch(/boards|TVs/);
    expect(showingSummaryText(t, 1, 3)).toMatch(/^1 (board|menú) /);
    expect(showingSummaryText(t, 2, 3)).toMatch(/^2 /);
  });
});
