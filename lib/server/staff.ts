/** Staff allowlist: STAFF_EMAILS="a@x.com,b@y.com". Empty or unset means nobody. */
export function isStaff(email: string, env: Record<string, string | undefined> = process.env) {
  const list = (env.STAFF_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const e = (email || "").trim().toLowerCase();
  return !!e && list.includes(e);
}
