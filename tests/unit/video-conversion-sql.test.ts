import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0033_video_conversion.sql", "utf8");
const code = sql.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
const rollback = readFileSync("supabase/rollback/0033_video_conversion.sql", "utf8");

describe("0033 video conversion migration (static checks)", () => {
  it("locks both tables away from clients", () => {
    for (const table of ["video_conversion_months", "video_conversion_jobs"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, "i"));
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${table}`, "i"));
    }
  });

  it("is additive and leaves backup, account, and billing tables alone", () => {
    expect(code).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
    expect(code).not.toMatch(/alter table public\.(accounts|media|subscriptions)/i);
    expect(code).not.toMatch(/backup/i);
    expect(code.trim()).toMatch(/^begin;/);
    expect(code.trim()).toMatch(/commit;$/);
    expect(rollback.split("\n").filter((line) => !line.startsWith("--")).join("\n").trim()).toMatch(/^begin;[\s\S]*commit;$/);
  });

  it("reserves under a row lock and refuses when reserved plus spent would exceed the cap", () => {
    expect(code).toMatch(/for update/);
    expect(code).toMatch(/budget_exhausted/);
    expect(code).toMatch(/v_reserved \+ v_spent \+ p_reserved_millis > v_cap/);
    expect(code).toMatch(/least\(p_actual_millis, v_reserved\)/);
  });

  it("filters processing and failed media out of player_playlist and player_state", () => {
    expect(code).toMatch(/m\.processing_status is null or m\.processing_status = 'ready'/);
    expect(code).toMatch(/create or replace function public\.player_playlist/);
    expect(code).toMatch(/create or replace function public\.player_state/);
  });

  it("requires the service role before mutating the ledger", () => {
    expect(code).toMatch(/v_role = 'service_role'/);
    expect(code).toMatch(/not_authorized/);
  });
});
