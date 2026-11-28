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
    for (const line of ['data-testid="not-found"', 't("error.notFoundTitle")', 't("error.notFoundBody")', "<NotFoundActions labels={{ dashboard: t(\"common.goToDashboard\"), home: t(\"error.goHome\"), login: t(\"nav.login\") }} />", "<PublicPage>"]) {
      expect(site).toContain(line);
      expect(seg).toContain(line);
    }
    // Consolidated console: the list is the "Customer accounts" tab; the data still comes only from the gated API.
    const tab = read("components/developer/accounts-view.tsx");
    expect(tab.match(/fetch\(/g)).toHaveLength(1);
    expect(tab).toContain('fetch("/api/developer/accounts", {');
    expect(tab).toContain('method: "POST"');
    // The search never goes into a URL.
    expect(tab).not.toMatch(/\/api\/developer\/accounts\?|URLSearchParams/);
    // The old URL only redirects a confirmed developer (server-checked) to the tab; everyone else sees the 404.
    const old = read("app/developer/accounts/client.tsx");
    expect(old.match(/fetch\(/g)).toHaveLength(1);
    expect(old).toContain('fetch("/api/developer/access"');
    expect(old).toContain("if (res.status === 200) location.replace(ACCOUNTS_TAB_URL);");
    expect(old).toContain('export const ACCOUNTS_TAB_URL = "/developer/analytics?view=accounts";');
  });
  it("is a tab of the console, which keeps its own aggregate API", () => {
    const analytics = read("app/developer/analytics/client.tsx");
    expect(analytics).toContain('const ACCOUNTS_VIEW_URL = "/developer/analytics?view=accounts";');
    expect(analytics).toContain('data-testid="tab-accounts"');
    expect(analytics).toContain("<AccountsView onConfirmed={onConfirmed} onNotFound={onDenied} />");
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
