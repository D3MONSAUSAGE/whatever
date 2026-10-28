import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isDisposableTestEmail } from "../helpers/account-cleanup";

describe("test account cleanup", () => {
  it("only matches the disposable addresses these tests create", () => {
    const id = randomUUID();
    expect(isDisposableTestEmail(`pantalla-e2e-${id}@mailinator.com`)).toBe(true);
    expect(isDisposableTestEmail(`pantalla-rls-${id}@mailinator.com`)).toBe(true);
    expect(isDisposableTestEmail("owner@cafe.test")).toBe(false);
    expect(isDisposableTestEmail(`pantalla-e2e-${id}@gmail.com`)).toBe(false);
    expect(isDisposableTestEmail("pantalla-e2e-not-a-uuid@mailinator.com")).toBe(false);
  });
});