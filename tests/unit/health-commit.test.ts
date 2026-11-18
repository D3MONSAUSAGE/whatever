import { describe, expect, it } from "vitest";
import { deployedCommit } from "@/lib/deploy-info";

describe("/api/health reports the deployed commit", () => {
  it("returns the short commit id from Vercel, and null otherwise", () => {
    expect(deployedCommit({ VERCEL_GIT_COMMIT_SHA: "4f948bda3cc5189e9cfb7941b1e8be842506ceda" })).toBe("4f948bd");
    expect(deployedCommit({})).toBeNull();
    expect(deployedCommit({ VERCEL_GIT_COMMIT_SHA: "<script>" })).toBeNull();
  });
});
