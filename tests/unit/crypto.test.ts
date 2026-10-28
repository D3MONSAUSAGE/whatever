import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashCode, isUuid, randomCode, randomToken, sha256 } from "@/lib/server/crypto";

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.PAIRING_CODE_SECRET;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.PAIRING_CODE_SECRET;
  else process.env.PAIRING_CODE_SECRET = previousSecret;
});

describe("crypto", () => {
  it("hashes with sha256", () => {
    expect(sha256("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });

  it("draws a zero-padded 6-digit code", () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });

  it("keys pairing codes so a bare hash is not enough", () => {
    const keyed = hashCode("123456");
    expect(keyed).toMatch(/^[0-9a-f]{64}$/);
    expect(keyed).not.toBe(sha256("123456"));
    process.env.PAIRING_CODE_SECRET = "a-different-test-secret-value";
    expect(hashCode("123456")).not.toBe(keyed);
  });

  it("refuses to hash codes without a long secret", () => {
    process.env.PAIRING_CODE_SECRET = "short";
    expect(() => hashCode("123456")).toThrow(/PAIRING_CODE_SECRET/);
    delete process.env.PAIRING_CODE_SECRET;
    expect(() => hashCode("123456")).toThrow(/PAIRING_CODE_SECRET/);
  });

  it("issues url-safe display tokens", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(20);
    expect(randomToken()).not.toBe(token);
  });

  it("accepts only canonical uuids", () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid(crypto.randomUUID().toUpperCase())).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});
