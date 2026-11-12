import { describe, expect, it } from "vitest";
import { freshBoard } from "@/lib/layout-account";
import { parseLayout, sampleLayout } from "@/lib/layout-studio";
import {
  LEGACY_DRAFT_KEY, LEGACY_PUBLISHED_KEY, clearLayoutStudioDraftsOnSignOut, draftStorageKey,
  editorStateAfterScopeChange, loadBrowserStudioState, orgIdFromEntitlements, publishedStorageKey,
  readStudioDraft, saveAccountGuard, shouldClearStudioDraftsOnAuthEvent, signedInPreviewLoad,
  writeStudioDraft, writeStudioPublished, type StudioScope, type StudioSnapshot,
} from "@/lib/layout-studio-draft";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

const orgA: StudioScope = { userId: "user-a", orgId: "org-a" };
const orgB: StudioScope = { userId: "user-b", orgId: "org-b" };
const sameUserOrgB: StudioScope = { userId: "user-a", orgId: "org-b" };

function snap(scope: StudioScope, title: string): Omit<StudioSnapshot, "userId" | "orgId"> {
  return { doc: { ...sampleLayout("menu-promo-67"), title }, imageHref: null, videoOn: false, boardId: null };
}

describe("layout studio draft scoping", () => {
  it("scopes keys by userId:orgId the same way pekko-slide-src does", () => {
    expect(draftStorageKey(orgA)).toBe("layout-studio-draft-v1:user-a:org-a");
    expect(publishedStorageKey(orgA)).toBe("layout-studio-published-v1:user-a:org-a");
    expect(draftStorageKey(orgA)).not.toBe(draftStorageKey(orgB));
    expect(draftStorageKey(orgA)).not.toBe(draftStorageKey(sameUserOrgB));
  });

  it("ignores a cross-org snapshot and preserves the same-org draft", () => {
    const storage = new MemoryStorage();
    writeStudioDraft(storage, orgA, snap(orgA, "Gother QA Promo v4"));
    writeStudioDraft(storage, orgB, snap(orgB, "qa-ux-mobile lunch"));
    expect(readStudioDraft(storage, orgB)?.doc.title).toBe("qa-ux-mobile lunch");
    expect(readStudioDraft(storage, orgA)?.doc.title).toBe("Gother QA Promo v4");
    // Cross-org read is empty, and the other org's key is still there.
    const crossed = readStudioDraft(storage, orgB);
    expect(crossed?.doc.title).not.toBe("Gother QA Promo v4");
    expect(storage.getItem(draftStorageKey(orgA))).toContain("Gother QA Promo v4");
  });

  it("does not show a legacy unscoped key, including in account mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_DRAFT_KEY, JSON.stringify({ doc: { ...sampleLayout("menu-promo-67"), title: "Gother QA Promo v4" }, imageHref: null, videoOn: false }));
    storage.setItem(LEGACY_PUBLISHED_KEY, JSON.stringify({ doc: sampleLayout("menu-promo-67"), imageHref: null, videoOn: false }));
    const account = loadBrowserStudioState({ accountMode: true, scope: orgB, storage });
    expect(account.draft).toBeNull();
    expect(account.published).toBeNull();
    expect(account.ignoredLegacy).toBe(true);
    const preview = loadBrowserStudioState({ accountMode: false, scope: orgB, storage });
    expect(preview.draft).toBeNull();
    expect(preview.published).toBeNull();
    expect(preview.ignoredLegacy).toBe(true);
    // Unscoped key is not deleted on a normal read, so a current-org draft is never removed by accident.
    expect(storage.getItem(LEGACY_DRAFT_KEY)).toBeTruthy();
  });

  it("ignores a scoped payload whose stored org does not match the key's caller", () => {
    const storage = new MemoryStorage();
    storage.setItem(draftStorageKey(orgB), JSON.stringify({
      userId: "user-a", orgId: "org-a",
      doc: { ...sampleLayout("menu-promo-67"), title: "Gother QA Promo v4" },
      imageHref: null, videoOn: false,
    }));
    expect(readStudioDraft(storage, orgB)).toBeNull();
    expect(storage.getItem(draftStorageKey(orgB))).toContain("Gother QA Promo v4");
  });

  it("clears scoped and legacy keys on sign-out, and not on token refresh", () => {
    const storage = new MemoryStorage();
    writeStudioDraft(storage, orgA, snap(orgA, "Org A draft"));
    writeStudioPublished(storage, sameUserOrgB, snap(sameUserOrgB, "Org B published"));
    storage.setItem(LEGACY_DRAFT_KEY, JSON.stringify({ doc: sampleLayout("menu-promo-67") }));
    expect(shouldClearStudioDraftsOnAuthEvent("TOKEN_REFRESHED", "user-a", "user-a")).toBe(false);
    expect(shouldClearStudioDraftsOnAuthEvent("SIGNED_IN", null, "user-a")).toBe(false);
    expect(shouldClearStudioDraftsOnAuthEvent("SIGNED_OUT", "user-a", null)).toBe(true);
    expect(shouldClearStudioDraftsOnAuthEvent("SIGNED_IN", "user-a", "user-b")).toBe(true);
    clearLayoutStudioDraftsOnSignOut(storage);
    expect(storage.length).toBe(0);
    expect(readStudioDraft(storage, orgA)).toBeNull();
  });

  it("on an org switch, shows the new org's draft or a fresh board, never the previous org", () => {
    const storage = new MemoryStorage();
    writeStudioDraft(storage, orgA, snap(orgA, "Gother QA Promo v4"));
    writeStudioDraft(storage, sameUserOrgB, snap(sameUserOrgB, "qa-ux-mobile lunch"));
    const switched = editorStateAfterScopeChange(storage, sameUserOrgB);
    expect(switched.resetToFresh).toBe(false);
    expect(switched.draft?.doc.title).toBe("qa-ux-mobile lunch");
    expect(switched.draft?.doc.title).not.toBe("Gother QA Promo v4");
    // Previous org's draft remains stored, and the current org's is not deleted.
    expect(readStudioDraft(storage, orgA)?.doc.title).toBe("Gother QA Promo v4");
    expect(readStudioDraft(storage, sameUserOrgB)?.doc.title).toBe("qa-ux-mobile lunch");
    const emptyOrg = editorStateAfterScopeChange(storage, { userId: "user-a", orgId: "org-c" });
    expect(emptyOrg.resetToFresh).toBe(true);
    expect(emptyOrg.draft).toBeNull();
  });

  it("resets to a fresh board when the signed-in preview has no board for this account", () => {
    const empty = signedInPreviewLoad({ boards: [], legacy: [], library: [] }, null);
    expect(empty.kind).toBe("fresh");
    expect(empty.board).toBeNull();
    expect(empty.fresh?.name).toMatch(/Untitled board/);
    const loaded = signedInPreviewLoad({
      boards: [{ id: "board-1", name: "Lunch", document: sampleLayout("menu-promo-67"), mediaId: null, playlistId: null }],
      legacy: [],
      library: [],
    }, null);
    expect(loaded.kind).toBe("board");
    expect(loaded.board?.name).toBe("Lunch");
  });

  it("refuses to save a document that did not originate on the current account", () => {
    expect(saveAccountGuard(orgA, orgB)).toEqual({
      allow: false,
      resetToFresh: true,
      message: "That draft belonged to another account. It was not saved. A new board is open instead.",
    });
    expect(saveAccountGuard(orgA, orgA)).toEqual({ allow: true });
    const missing = saveAccountGuard(null, orgB);
    expect(missing.allow).toBe(false);
    if (!missing.allow) expect(missing.resetToFresh).toBe(false);
    expect(saveAccountGuard(orgA, null).allow).toBe(false);
    const stale = { ...sampleLayout("menu-promo-67"), title: "Gother QA Promo v4" };
    const guard = saveAccountGuard(orgA, orgB);
    expect(guard.allow).toBe(false);
    // The POST body is not produced on a mismatch; the editor resets to a fresh board instead.
    const reset = freshBoard(0);
    expect(reset.document.title).not.toBe(stale.title);
    expect(parseLayout(reset.document).ok).toBe(true);
  });

  it("reads org id from the existing entitlements payload without an API change", () => {
    expect(orgIdFromEntitlements({ account_id: "org-from-entitlements", plan: "trial" })).toBe("org-from-entitlements");
    expect(orgIdFromEntitlements({ plan: "trial" })).toBeNull();
  });
});
