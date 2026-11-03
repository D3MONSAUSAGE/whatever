export const VISITOR_COOKIE = "pk_mc"; // first-party, httpOnly; only set once the visitor makes a choice
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readCookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
export function visitorId(req: Request) {
  const v = readCookie(req, VISITOR_COOKIE);
  return v && UUID.test(v) ? v : null;
}
export const gpc = (req: Request) => req.headers.get("sec-gpc") === "1";
export function visitorCookie(id: string, maxAgeDays: number) {
  return `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${maxAgeDays * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
/** fbp/fbc format checks so arbitrary strings aren't stored. */
export const validFbp = (v: unknown): v is string => typeof v === "string" && /^fb\.\d\.\d{10,13}\.\d{1,20}$/.test(v);
export const validFbc = (v: unknown): v is string => typeof v === "string" && /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{10,250}$/.test(v);
export const validFbclid = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{10,250}$/.test(v);
