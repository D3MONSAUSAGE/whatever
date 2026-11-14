import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MEDIA_NAME_MAX, mediaRename } from "@/lib/media-rename";

describe("U2-05: rename in Media (display name only)", () => {
  it("keeps the original extension so pickers still list the file", () => {
    expect(mediaRename("IMG_2041.JPG", "Patio")).toEqual({ ok: true, name: "Patio.JPG" });
    expect(mediaRename("logo.png", "Harbor logo.png")).toEqual({ ok: true, name: "Harbor logo.png" });
    expect(mediaRename("logo.png", "Harbor logo.PNG")).toEqual({ ok: true, name: "Harbor logo.png" });
    expect(mediaRename("promo.mp4", "  Happy hour  ")).toEqual({ ok: true, name: "Happy hour.mp4" });
    expect(mediaRename("promo.mp4", "Happy.hour.mov")).toEqual({ ok: true, name: "Happy.hour.mov.mp4" });
    expect(mediaRename("noext", "New name")).toEqual({ ok: true, name: "New name" });
  });

  it("rejects empty names and strips control characters; caps at 200", () => {
    for (const bad of ["", "   ", ".png", " .PNG ", null, 42]) expect(mediaRename("logo.png", bad).ok).toBe(false);
    expect(mediaRename("logo.png", "A\u0000B\u0007C")).toEqual({ ok: true, name: "ABC.png" });
    const long = mediaRename("logo.png", "x".repeat(500));
    expect(long.ok && long.name.length).toBe(MEDIA_NAME_MAX);
    expect(long.ok && long.name.endsWith(".png")).toBe(true);
  });

  it("server: admin-only, account-scoped, updates file_name only (no storage, no deletes)", () => {
    const route = readFileSync("app/api/media/[id]/route.ts", "utf8");
    const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
    expect(patch).toMatch(/const admin = await requireAdmin\(req\);/);
    expect(patch.match(/\.eq\("account_id", admin\.accountId\)/g)).toHaveLength(2);
    expect(patch).toMatch(/\.update\(\{ file_name: next\.name \}\)/);
    expect(patch).not.toMatch(/storage|storage_path|\.delete\(|\.remove\(|rpc\(/);
    expect(patch).toMatch(/kind === "presentation"/);
  });

  it("UI: Rename for images and videos, presentations keep their own endpoint", () => {
    const ui = readFileSync("components/media-library.tsx", "utf8");
    expect(ui).toMatch(/aria-label=\{`Rename \$\{item\.fileName\}`\}>Rename<\/button>/);
    expect(ui).toMatch(/presentation \? `\/api\/media\/presentation\/\$\{item\.id\}` : `\/api\/media\/\$\{item\.id\}`/);
    expect(ui).toMatch(/Only the name shown in Pekko changes\. Screens and playlists keep using this file\./);
  });
});
