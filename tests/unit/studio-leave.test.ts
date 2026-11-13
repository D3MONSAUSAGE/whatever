import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("studio leave guard", () => {
  it("is a client-only module that uses the existing confirm and wraps shell links", () => {
    const source = readFileSync("components/studio-leave.tsx", "utf8")
      + readFileSync("components/shell.tsx", "utf8")
      + readFileSync("components/classic-editor.tsx", "utf8")
      + readFileSync("components/layout-studio.tsx", "utf8");
    expect(source).toContain('"use client"');
    expect(source).toContain("confirmDiscardUnsaved");
    expect(source).toContain("StudioLeaveProvider");
    expect(source).toContain("StudioGuardedLink");
    expect(source).toContain('href="/dashboard/account/brand-kit"');
    expect(source).toContain("useRegisterStudioLeave");
    expect(source).not.toContain("app/api");
  });
});
