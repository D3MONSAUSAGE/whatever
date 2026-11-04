import { describe, expect, it } from "vitest";
import { isStaff } from "@/lib/server/staff";
import { deletionEnabled } from "@/lib/server/account-deletion";

describe("staff allowlist", () => {
  it("matches exact emails, case-insensitively, and denies by default", () => {
    expect(isStaff("a@x.com", {})).toBe(false);
    expect(isStaff("a@x.com", { STAFF_EMAILS: "" })).toBe(false);
    expect(isStaff("A@X.com", { STAFF_EMAILS: " a@x.com , b@y.com" })).toBe(true);
    expect(isStaff("a@x.co", { STAFF_EMAILS: "a@x.com" })).toBe(false);
    expect(isStaff("", { STAFF_EMAILS: "," })).toBe(false);
  });
});
describe("deletion flag", () => {
  it("is off unless ACCOUNT_DELETION=1", () => {
    expect(deletionEnabled({})).toBe(false);
    expect(deletionEnabled({ ACCOUNT_DELETION: "true" })).toBe(false);
    expect(deletionEnabled({ ACCOUNT_DELETION: "1" })).toBe(true);
  });
});
