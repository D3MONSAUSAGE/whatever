import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import DeveloperAccountsPage from "@/app/developer/accounts/page";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("DA-2 /developer/accounts page", () => {
  it("always answers a real 404 (QA R17-F1): the server never knows who is asking", () => {
    let thrown: unknown;
    try { DeveloperAccountsPage(); } catch (e) { thrown = e; }
    expect(String((thrown as { digest?: string })?.digest)).toMatch(/404/);
  });
  it("its not-found shows the same markup as the site 404 and loads data only from the gated API", () => {
    const site = read("app/not-found.tsx");
    const seg = read("app/developer/accounts/not-found.tsx");
    for (const line of ['data-testid="not-found"', 't("error.notFoundTitle")', 't("error.notFoundBody")', "<NotFoundActions />", "<PublicPage>"]) {
      expect(site).toContain(line);
      expect(seg).toContain(line);
    }
    const client = read("app/developer/accounts/client.tsx");
    expect(client.match(/fetch\(/g)).toHaveLength(1);
    expect(client).toContain('fetch("/api/developer/accounts", {');
    expect(client).toContain('method: "POST"');
    // The search never goes into a URL.
    expect(client).not.toMatch(/\/api\/developer\/accounts\?|URLSearchParams/);
  });
  it("is linked from the aggregate dashboard, which keeps its own API", () => {
    const analytics = read("app/developer/analytics/client.tsx");
    expect(analytics).toContain('href="/developer/accounts"');
    expect(analytics).toContain("/api/developer/analytics?");
    expect(analytics).not.toContain("/api/developer/accounts");
  });
  it("the 0030 migration is additive: one function, no tables, no writes, no client grants", () => {
    const sql = read("supabase/migrations/0030_dev_accounts.sql").replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/create\s+table|alter\s+table|insert\s+into|update\s+public|delete\s+from|drop\s|create\s+trigger/i);
    expect(sql).toMatch(/revoke execute on function public\.dev_accounts_list\(uuid\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*(anon|authenticated)/i);
    expect(sql).not.toContain("screen.content_changed");
    expect(sql).not.toMatch(/subject_name|detail|storage_path|file_name|token|encrypted_password|stripe_customer_id|stripe_subscription_id|raw_user_meta_data|phone|\bname\b/i);
  });
});
