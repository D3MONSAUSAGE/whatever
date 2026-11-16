import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0029_dev_analytics.sql", "utf8");
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const seed = readFileSync("supabase/manual/0029_dev_analytics_seed.sql", "utf8");

describe("DA-1 migration 0029 (static checks)", () => {
  it("locks both tables away from clients", () => {
    for (const table of ["developer_users", "analytics_exclusions"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke all on (table )?public\\.${table} from public, anon, authenticated`, "i"));
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${table}`, "i"));
    }
  });
  it("lets only the service role run the functions, which re-check the caller", () => {
    for (const fn of ["is_developer", "dev_analytics_snapshot", "dev_analytics_referrer_host"]) {
      expect(sql).toMatch(new RegExp(`revoke (all|execute) on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`, "i"));
    }
    expect(sql).toMatch(/not_authorized/);
    expect(sql).toMatch(/42501/);
    expect(code).not.toMatch(/subject_name|file_name|fbclid|gclid/i);
  });
  it("is additive only", () => {
    expect(code).not.toMatch(/\b(drop table|truncate|delete from|alter table public\.(accounts|activity_events|displays))/i);
  });
  it("keeps real customers out of the seed (t340u)", () => {
    const statements = seed.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(statements).not.toMatch(/gmail\.com|hotmail\.com|guanatostacos/i);
    expect(statements).not.toMatch(/06516d67-e209-4214-bd58-3a4b6b699005/);
  });
});
