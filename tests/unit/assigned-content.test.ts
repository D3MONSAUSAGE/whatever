import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assignedContentPreview, assignedKindLabel, isProbablyVideo } from "@/lib/assigned-content";
import { AssignedThumb } from "@/components/assigned-thumb";
import type { DisplayItem } from "@/lib/api";

function display(patch: Partial<DisplayItem> & { id: string; name: string }): DisplayItem {
  return {
    connected: true,
    online: true,
    lastSeenAt: new Date().toISOString(),
    media: null,
    playlist: null,
    ...patch,
  };
}

const fixtures = {
  image: display({ id: "img", name: "Bar TV", media: { id: "m1", fileName: "dinner-menu.png", url: "https://cdn.example/dinner.png" } }),
  video: display({ id: "vid", name: "Lounge", media: { id: "m2", fileName: "specials.mp4", url: "https://cdn.example/specials.mp4" } }),
  board: display({ id: "board", name: "Kitchen", playlist: { id: "pl-b", name: "Lunch board", url: null }, boardPreviewUrl: "https://cdn.example/board.png" }),
  playlist: display({ id: "pl", name: "Front counter", playlist: { id: "pl-l", name: "Lunch loop", url: "https://cdn.example/loop.jpg" } }),
  empty: display({ id: "empty", name: "Patio", connected: false, online: false, lastSeenAt: null }),
};

describe("assigned content preview", () => {
  it("uses existing stills and never puts a raw video file in an img src", () => {
    expect(assignedContentPreview(fixtures.image)).toMatchObject({ src: "https://cdn.example/dinner.png", kind: "image", label: "Assigned" });
    expect(assignedContentPreview(fixtures.video)).toMatchObject({ src: null, kind: "video", label: "Assigned" });
    expect(assignedContentPreview(fixtures.board)).toMatchObject({ src: "https://cdn.example/board.png", kind: "menu-board" });
    expect(assignedContentPreview(fixtures.playlist)).toMatchObject({ src: "https://cdn.example/loop.jpg", kind: "playlist" });
    expect(assignedContentPreview(fixtures.empty)).toMatchObject({ src: null, kind: "empty" });
    expect(isProbablyVideo("specials.mp4", "https://cdn.example/specials.mp4")).toBe(true);
    expect(assignedKindLabel("menu-board")).toBe("Menu board");
  });

  it("prefers the rendered menu-board still over a playlist url", () => {
    const both = display({
      id: "both",
      name: "Kitchen",
      playlist: { id: "pl-b", name: "Lunch board", url: "https://cdn.example/first-item.png" },
      boardPreviewUrl: "https://cdn.example/board.png",
    });
    expect(assignedContentPreview(both).src).toBe("https://cdn.example/board.png");
    expect(assignedContentPreview(both).kind).toBe("menu-board");
  });

  it("renders a 16:9 assigned thumbnail with a type placeholder when there is no still", () => {
    const html = renderToStaticMarkup(createElement(AssignedThumb, { display: fixtures.video }));
    expect(html).toContain('data-testid="assigned-thumb"');
    expect(html).toContain('data-kind="video"');
    expect(html).toContain("Assigned");
    expect(html).not.toContain('src="https://cdn.example/specials.mp4"');
    expect(html).toContain("aspect-ratio: 16 / 9");
    const board = renderToStaticMarkup(createElement(AssignedThumb, { display: fixtures.board }));
    expect(board).toContain("https://cdn.example/board.png");
    expect(board).toContain('loading="lazy"');
  });

  it("shows thumbnails on My Screens cards, with Change content as the primary action", () => {
    const source = readFileSync("components/my-screens.tsx", "utf8");
    expect(source).toContain("AssignedThumb");
    expect(source).toContain("Change content");
    expect(source).toContain("panel=change");
    expect(source).toContain("panel=schedule");
    expect(source).toContain("panel=playlist");
    expect(source).toContain("btn-primary");
    expect(source).toContain("Total screens");
    expect(source).toContain('compact');
  });
});
