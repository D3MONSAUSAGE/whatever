import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignBusyFor } from "@/lib/assign-publish";

describe("assign playlist publish busy state", () => {
  it("clears Checking… before the confirm and only sets Publishing… after a yes", () => {
    expect(assignBusyFor("preview")).toBe("checking");
    expect(assignBusyFor("confirm")).toBeNull();
    expect(assignBusyFor("commit")).toBe("publishing");
    expect(assignBusyFor("idle")).toBeNull();

    const source = readFileSync("components/displays-screen.tsx", "utf8");
    const publish = source.slice(source.indexOf("async function publish()"), source.indexOf("const selected"));
    const clearBeforeAsk = publish.indexOf('setBusy(assignBusyFor("confirm"))');
    const ask = publish.indexOf("confirm.ask");
    const afterOk = publish.indexOf("if (ok !== true) return");
    const commit = publish.indexOf('setBusy(assignBusyFor("commit"))');
    expect(clearBeforeAsk).toBeGreaterThan(-1);
    expect(clearBeforeAsk).toBeLessThan(ask);
    expect(ask).toBeLessThan(afterOk);
    expect(afterOk).toBeLessThan(commit);
  });

  it("portals the confirm dialog to document.body above the assign sheet", () => {
    const confirm = readFileSync("components/confirm.tsx", "utf8");
    expect(confirm).toContain("createPortal");
    expect(confirm).toContain("document.body");
    expect(confirm).toMatch(/z-\[80\]/);
    const dataTestId = confirm.indexOf('data-testid="confirm-dialog"');
    const portal = confirm.indexOf("createPortal(dialog, document.body)");
    expect(dataTestId).toBeGreaterThan(-1);
    expect(portal).toBeGreaterThan(dataTestId);
    const sheet = readFileSync("components/displays-screen.tsx", "utf8");
    const assignSheet = sheet.slice(sheet.indexOf("function AssignPlaylist"));
    expect(assignSheet).toMatch(/fixed inset-0 z-50/);
  });
});
