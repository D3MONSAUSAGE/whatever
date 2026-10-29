import { db } from "./supabase";
import { isMissingSchema } from "./schema";

export async function loadLocations(accountId: string) {
  const rich = await db().from("locations").select("id, name, timezone, created_at").eq("account_id", accountId).order("created_at");
  if (!rich.error) {
    return (rich.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      timezone: typeof row.timezone === "string" && row.timezone ? row.timezone : "UTC",
    }));
  }
  if (!isMissingSchema(rich.error)) return "error" as const;
  const plain = await db().from("locations").select("id, name, created_at").eq("account_id", accountId).order("created_at");
  if (plain.error) return "error" as const;
  return (plain.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), timezone: "UTC" }));
}
