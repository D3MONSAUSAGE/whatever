import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0029_dev_analytics.sql", "utf8");
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const seed = readFileSync("supabase/manual/0029_dev_analytics_seed.template.sql", "utf8");
const rollback = readFileSync("supabase/rollback/0029_dev_analytics.sql", "utf8");

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
  it("runs in one transaction, and so does the rollback", () => {
    expect(code.trim()).toMatch(/^begin;/);
    expect(code.trim()).toMatch(/commit;$/);
    expect(rollback.split("\n").filter((l) => !l.startsWith("--")).join("\n").trim()).toMatch(/^begin;[\s\S]*commit;$/);
  });
  it("requires the service role inside the snapshot function (defense in depth)", () => {
    expect(code).toMatch(/current_setting\('request\.jwt\.claims', true\)/);
    expect(code).toMatch(/v_role = 'service_role'/);
    expect(code).toMatch(/session_user in \('postgres', 'supabase_admin'\)/);
    // The role check comes before the developer check.
    expect(code.indexOf("v_role = 'service_role'")).toBeLessThan(code.indexOf("if not public.is_developer(p_actor)"));
  });
  it("keeps only the referrer host, dropping user:password@", () => {
    const m = code.match(/substring\(p_referrer from '([^']+)'\)/);
    expect(m?.[1]).toBe("^[hH][tT][tT][pP][sS]?://(?:[^/?#@]*@)?([^/:?#@]+)");
    const re = new RegExp(m![1]);
    const host = (u: string) => re.exec(u)?.[1]?.toLowerCase() ?? null;
    expect(host("https://user:pw@evil.example.com:8443/p?q=1#f")).toBe("evil.example.com");
    expect(host("HTTP://u@Host.Test/x")).toBe("host.test");
    expect(host("https://l.facebook.com/x?fbclid=1")).toBe("l.facebook.com");
    expect(host("javascript:alert(1)")).toBeNull();
  });
  it("seed is a template with psql variables and no real identifiers", () => {
    const statements = seed.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const v of ["dev_user_id", "reviewer_account_id", "internal_account_id"]) expect(statements).toContain(`:'${v}'::uuid`);
    expect(seed).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // The only domains named are the internal/test ones; no customer domains or names.
    expect(statements.match(/'[a-z0-9.-]+\.[a-z]{2,}'/gi)).toEqual(["'mail.grokbot.com'", "'example.com'"]);
    expect(statements).not.toMatch(/@[a-z0-9-]+\./i);
  });
});
