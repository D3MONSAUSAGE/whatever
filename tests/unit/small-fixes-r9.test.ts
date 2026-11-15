import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DisplayItem } from "@/lib/api";
import { LocaleProvider } from "@/lib/i18n/client";
import { makeT } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import type { Locale } from "@/lib/i18n/locales";
import { afterClassicSave, screenList } from "@/lib/show-on-screens";
import { announceScreensChanged, changesScreens, onScreensChanged, showsScreens } from "@/lib/screens-sync";
import { heartbeatText } from "@/components/tv";
import { ShowOnScreens } from "@/components/show-on-screens";
import { ScreenWorkspace } from "@/components/my-screens";
import { UploadsProvider } from "@/components/uploads";

const tv = (id: string, name: string, playlist: { id: string; name: string } | null, extra: Partial<DisplayItem> = {}) =>
  ({ id, name, connected: true, online: true, playlist, media: null, lastSeenAt: new Date().toISOString(), ...extra }) as unknown as DisplayItem;
const wrap = (locale: Locale, child: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, { initial: locale, children: h(UploadsProvider, { children: child }) }));
const NEW_KEYS = ["screen.noTv", "screen.noTvPlaying", "screen.setToShow", "menuBoards.updatedOn", "menuBoards.updatedNoScreen", "showOnScreens.replacesHere", "media.renamed"] as const;

describe("new strings", () => {
  it("exist in English and Spanish (usted, glossary: pantalla, vincular, Horarios)", () => {
    for (const key of NEW_KEYS) { expect(en[key]).toBeTruthy(); expect(es[key]).toBeTruthy(); expect(es[key]).not.toBe(en[key]); }
    expect(en["showOnScreens.replacesHere"]).toBe("Replaces {current} on this screen");
    expect(es["menuBoards.updatedNoScreen"]).toContain("Agréguelo");
    expect(es["screen.noTv"]).toContain("vinculada");
  });
});

describe("E5-F2: a screen with no TV doesn't claim a heartbeat or playback", () => {
  const unpaired = tv("s1", "QA Bar TV 2", { id: "loop", name: "QA Mixed Loop" }, {
    connected: false, online: false, reportedState: "playing", playingAt: new Date().toISOString(),
  } as Partial<DisplayItem>);

  it("heartbeat line", () => {
    expect(heartbeatText(unpaired, makeT("en"))).toBe("No TV connected");
    expect(heartbeatText(unpaired, makeT("es"))).toBe("No hay una TV vinculada");
    expect(heartbeatText(tv("s2", "Bar", null), makeT("en"))).toBe("Last heartbeat just now");
  });

  it("the screen page after an unpair agrees with the 'No TV is connected' banner (en + es)", () => {
    const html = wrap("en", h(ScreenWorkspace, { id: "s1", fixture: unpaired }));
    expect(html).toContain("No TV is connected to");
    expect(html).not.toContain("Playing on the TV");
    expect(html).not.toContain("Last heartbeat");
    expect(html).toContain("Nothing is playing here: no TV is connected to this screen.");
    expect(html).toContain("Set to show QA Mixed Loop once a TV is connected");
    const htmlEs = wrap("es", h(ScreenWorkspace, { id: "s1", fixture: unpaired }));
    expect(htmlEs).toContain("Mostrará QA Mixed Loop cuando se vincule una TV");
    // A connected, playing screen is unchanged.
    const playing = wrap("en", h(ScreenWorkspace, { id: "s1", fixture: { ...unpaired, connected: true, online: true } as DisplayItem }));
    expect(playing).toContain("Playing on the TV");
    expect(playing).toContain("Last heartbeat just now");
  });
});

describe("E5-F3: lists, counts and group views refresh when screens change", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("knows which writes change screens and which reads show them", () => {
    expect(changesScreens("/api/displays/pair", "POST")).toBe(true);
    expect(changesScreens("/api/displays/abc/reconnect", "POST")).toBe(true);
    expect(changesScreens("/api/displays/abc", "DELETE")).toBe(true);
    expect(changesScreens("/api/screen-groups/g1", "PATCH")).toBe(true);
    expect(changesScreens("/api/playlists/p1/publish", "POST")).toBe(true);
    expect(changesScreens("/api/displays", "GET")).toBe(false);
    expect(changesScreens("/api/displays", undefined)).toBe(false);
    expect(changesScreens("/api/media/m1", "PATCH")).toBe(false);
    expect(changesScreens("/api/playlists/p1", "PATCH")).toBe(false);
    for (const p of ["/api/displays", "/api/displays/x/timeline", "/api/screen-groups", "/api/alerts?unread=1&limit=3", "/api/overview"]) expect(showsScreens(p)).toBe(true);
    for (const p of ["/api/media?limit=1", "/api/displays-extra", "/api/menus"]) expect(showsScreens(p)).toBe(false);
  });
  it("announces in this tab and to other tabs", () => {
    const win = new EventTarget();
    const posted: unknown[] = [];
    class FakeChannel { onmessage: (() => void) | null = null; postMessage(m: unknown) { posted.push(m); } close() {} }
    vi.stubGlobal("window", win);
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const heard = vi.fn();
    const off = onScreensChanged(heard);
    announceScreensChanged();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(1);
    off();
    announceScreensChanged();
    expect(heard).toHaveBeenCalledTimes(1);
  });
  it("api() announces after a successful screen write, and useApi reloads screen reads on it; the group page polls", () => {
    const api = readFileSync("lib/api.ts", "utf8");
    expect(api).toContain("if (changesScreens(path, init.method)) announceScreensChanged();");
    expect(api).toMatch(/if \(!path \|\| !showsScreens\(path\)\) return;\s*return onScreensChanged/);
    const groups = readFileSync("components/my-screens.tsx", "utf8");
    expect(groups).toMatch(/export function ScreenGroups[\s\S]*?useApi<DisplayItem\[\]>\(fixture \? null : "\/api\/displays", fixture \? undefined : 10_000\)/);
  });
});

describe("E2b-F1: the screen picker only after creating a new board", () => {
  const displays = [tv("d1", "QA Bar TV", { id: "loop", name: "QA Mixed Loop" }), tv("d2", "Patio", { id: "board", name: "Lunch" }), tv("d3", "Bar", { id: "board", name: "Lunch" }), tv("d4", "Old", { id: "board", name: "Lunch" }, { connected: false })];
  const base = { fromScreen: false, tickedScreens: 0, playlistId: "board", displays };
  it("new board on no screen → picker; new board already on a screen or ticked → none", () => {
    expect(afterClassicSave({ ...base, created: true, displays: [displays[0]!] })).toEqual({ kind: "picker" });
    expect(afterClassicSave({ ...base, created: true })).toEqual({ kind: "none" });
    expect(afterClassicSave({ ...base, created: true, displays: [displays[0]!], tickedScreens: 1 })).toEqual({ kind: "none" });
  });
  it("existing board never gets the picker: names its screens (sorted, paired only) or says it isn't on one", () => {
    expect(afterClassicSave({ ...base, created: false })).toEqual({ kind: "updated", screens: ["Bar", "Patio"] });
    expect(afterClassicSave({ ...base, created: false, displays: [displays[0]!] })).toEqual({ kind: "updated", screens: [] }); // QA R4 case
    expect(afterClassicSave({ ...base, created: false, fromScreen: true })).toEqual({ kind: "none" });
  });
  it("toast text in both languages", () => {
    expect(makeT("en")("menuBoards.updatedOn", { screens: screenList(["Bar", "Patio"], "en") })).toBe("Menu updated. It refreshes on Bar and Patio within a minute.");
    expect(makeT("es")("menuBoards.updatedOn", { screens: screenList(["Bar", "Patio"], "es") })).toBe("Menú actualizado. Se actualiza en Bar y Patio en un minuto.");
    expect(makeT("en")("menuBoards.updatedNoScreen")).toBe("Menu updated. It isn't on a screen yet. Add it from My Screens or Schedules.");
    const boards = readFileSync("components/menu-boards.tsx", "utf8");
    expect(boards).toContain("const created = !view.draft.id;");
    expect(boards).toContain("afterClassicSave({ created,");
  });
});

describe("E2b-F2: each screen line reads 'Replaces {current} on this screen'", () => {
  it("renders in English and Spanish; a screen already showing the board says so", () => {
    const props = { boardId: "b", boardName: "QA R9 – classic new", playlistId: "board", displays: [tv("d1", "QA Bar TV 2", { id: "loop", name: "QA Mixed Loop" }), tv("d2", "Patio", { id: "board", name: "Lunch" })], onDone: () => {}, onSkip: () => {} };
    const html = wrap("en", h(ShowOnScreens, props));
    expect(html).toContain("Replaces QA Mixed Loop on this screen");
    expect(html).not.toContain("Now showing");
    expect(html).toContain("Set to show this board");
    expect(wrap("es", h(ShowOnScreens, props))).toContain("Reemplaza QA Mixed Loop en esta pantalla");
  });
});

describe("U2-05-F1: the Media grid shows the new name right after a rename", () => {
  it("patches the item from the PATCH response before reloading, and the toast names it", () => {
    const src = readFileSync("components/media-library.tsx", "utf8");
    expect(src).toContain("live.patchItem(renaming.id, { fileName });");
    expect(src).toContain('onSaved(res.fileName ?? res.name ?? wanted);');
    expect(src).toContain('t("media.renamed", { name: fileName })');
    expect(src).toMatch(/const patchItem = useCallback\(\(id: string, patch: Partial<MediaItem>\) => \{\s*setPage\(\(current\) => current \? \{ \.\.\.current, items: current\.items\.map/);
    expect(makeT("en")("media.renamed", { name: "QA Burger Hero.jpg" })).toBe("Renamed to QA Burger Hero.jpg");
  });
});

describe("Gother #109 fold-ins", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("MEDIUM: a just-unpaired screen (recent heartbeat, no TV) isn't counted online in the list, group headers or overview", async () => {
    const { onlineNow } = await import("@/lib/sync-line");
    const { MyScreens } = await import("@/components/my-screens");
    expect(onlineNow({ connected: false, online: true })).toBe(false);
    expect(onlineNow({ connected: true, online: true })).toBe(true);
    const displays = [tv("a", "QA Bar TV 2", null, { connected: false, online: true } as Partial<DisplayItem>), tv("b", "Patio", null)];
    const Screens = MyScreens as (props: { fixture: { displays: DisplayItem[]; groups: never[] } }) => ReturnType<typeof MyScreens>;
    const html = wrap("en", h(Screens, { fixture: { displays, groups: [] } }));
    expect(html).toMatch(/1 online/);
    expect(html).not.toMatch(/2 online/);
    for (const f of ["components/my-screens.tsx", "components/overview-screen.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/filter\(\((display|item)\) => \1\.online\)/);
    }
  });
  it("low 1: the same tab hears a change once (its own channel message is skipped); other tabs still hear it", () => {
    const win = new EventTarget();
    const channels: { onmessage: ((e: { data: unknown }) => void) | null }[] = [];
    class FakeChannel {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      constructor() { channels.push(this); }
      postMessage(data: unknown) { for (const c of channels) if (c !== this) c.onmessage?.({ data }); }
      close() { const i = channels.indexOf(this); if (i >= 0) channels.splice(i, 1); }
    }
    vi.stubGlobal("window", win);
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const heard = vi.fn();
    const off = onScreensChanged(heard);
    announceScreensChanged();
    expect(heard).toHaveBeenCalledTimes(1); // window event only; own-tab channel echo skipped
    channels[0]!.onmessage?.({ data: { tab: "another-tab" } });
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });
  it("low 2: replaceNotes speaks the UI language", async () => {
    const { replaceNotes, screenChoices } = await import("@/lib/show-on-screens");
    const choices = screenChoices([tv("d2", "QA Bar TV 2", { id: "loop", name: "QA Mixed Loop" }), tv("d3", "Patio TV", null)], "board");
    expect(replaceNotes(choices, ["d2"], makeT("es"))).toEqual(["Reemplaza QA Mixed Loop en QA Bar TV 2."]);
    expect(replaceNotes(choices, ["d3"], makeT("es"))).toEqual(["Patio TV todavía no tiene nada asignado."]);
    expect(replaceNotes(choices, [], makeT("es"))).toEqual(["Al marcar una pantalla, se reemplaza lo que tiene asignado."]);
    expect(replaceNotes(choices, ["d2"])).toEqual(["Replaces QA Mixed Loop on QA Bar TV 2."]); // English unchanged
    expect(readFileSync("components/show-on-screens.tsx", "utf8")).toContain("replaceNotes(choices, picked, t)");
  });
});
