import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** 6-digit codes are too small to protect with a plain hash, so key it. */
export function hashCode(code: string) {
  const secret = process.env.PAIRING_CODE_SECRET;
  if (!secret || secret.length < 16) throw new Error("PAIRING_CODE_SECRET is missing or too short");
  return createHmac("sha256", secret).update(code).digest("hex");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
