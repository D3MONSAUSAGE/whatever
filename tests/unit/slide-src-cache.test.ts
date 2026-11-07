import { afterEach, describe, expect, it } from "vitest";
import { clearSlideSrcCache, onDashboardAuthChange, rememberSlideSrc, SLIDE_SRC_KEY } from "@/lib/slide-src-cache";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key() { return null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

const memory = new MemoryStorage();

afterEach(() => {
  memory.clear();
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
});

function install() {
  (globalThis as { sessionStorage?: Storage }).sessionStorage = memory as unknown as Storage;
}

describe("presentation slide URL cache", () => {
  it("drops account A's signed URLs when that user signs out and account B signs in", () => {
    install();
    const accountA = { userId: "user-a", orgId: "org-a" };
    const opened = rememberSlideSrc(
      accountA,
      "/storage/v1/object/sign/media/org-a/slide.png",
      "full",
      "https://cdn.example/a-token",
    );
    expect(opened).toBe("https://cdn.example/a-token");
    expect(memory.getItem(SLIDE_SRC_KEY)).toContain("a-token");
    expect(memory.getItem(SLIDE_SRC_KEY)).toContain("user-a");
    expect(memory.getItem(SLIDE_SRC_KEY)).toContain("org-a");

    clearSlideSrcCache();
    onDashboardAuthChange();

    expect(memory.getItem(SLIDE_SRC_KEY)).toBeNull();

    const accountB = { userId: "user-b", orgId: "org-b" };
    const next = rememberSlideSrc(
      accountB,
      "/storage/v1/object/sign/media/org-b/slide.png",
      "full",
      "https://cdn.example/b-token",
    );
    expect(next).toBe("https://cdn.example/b-token");
    const stored = memory.getItem(SLIDE_SRC_KEY) ?? "";
    expect(stored).not.toContain("a-token");
    expect(stored).not.toContain("user-a");
    expect(stored).not.toContain("org-a");
    expect(stored).toContain("user-b");
    expect(stored).toContain("org-b");
  });

  it("does not reuse a URL across orgs or asset paths", () => {
    install();
    rememberSlideSrc(
      { userId: "user-a", orgId: "org-a" },
      "/media/org-a/slide.png",
      "full",
      "https://cdn.example/a-token",
    );
    expect(rememberSlideSrc(
      { userId: "user-a", orgId: "org-b" },
      "/media/org-a/slide.png",
      "full",
      "https://cdn.example/other-org",
    )).toBe("https://cdn.example/other-org");
    expect(rememberSlideSrc(
      { userId: "user-a", orgId: "org-a" },
      "/media/org-a/slide-v2.png",
      "full",
      "https://cdn.example/new-path",
    )).toBe("https://cdn.example/new-path");
    expect(rememberSlideSrc(
      { userId: "user-a", orgId: "org-a" },
      "/media/org-a/slide.png",
      "full",
      "https://cdn.example/ignored-fresh",
    )).toBe("https://cdn.example/a-token");
  });
});
