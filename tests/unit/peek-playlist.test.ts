import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { removalQueued } from "@/lib/peek-playlist";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const displays = [
  { id: "a", name: "Front counter", assigned: true },
  { id: "b", name: "Kitchen", assigned: true },
  { id: "c", name: "Drive-thru", assigned: true },
  { id: "d", name: "Bar TV", assigned: false },
];

describe("Peek playlist editor: removal queued", () => {
  it("names only assigned TVs that are unticked", () => {
    expect(removalQueued(displays, { a: true, b: true, c: false, d: false }).map((d) => d.id)).toEqual(["c"]);
    expect(removalQueued(displays, { a: true, b: true, c: true, d: true })).toEqual([]);
    expect(removalQueued(displays, {}).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });
  it("re-ticking clears it; an unassigned TV is never queued", () => {
    expect(removalQueued(displays, { a: true, b: true, c: true, d: false })).toEqual([]);
  });
  it("has EN and ES copy from 08-COPY", () => {
    expect(en["peek.pe.removalQueued"]).toBe("Removal queued");
    expect(es["peek.pe.removalSummaryOne"]).toContain("{names}");
  });
  it("leaves publish() unchanged: same displayIds from the ticks, same endpoint", () => {
    const src = readFileSync("components/playlist-editor.tsx", "utf8");
    expect(src).toContain('const displayIds = Object.entries(chosen).filter(([, on]) => on).map(([displayId]) => displayId);');
    expect(src).toContain('await api(`/api/playlists/${id}/publish`, { method: "POST", body: JSON.stringify({ displayIds }) });');
  });
});
