import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HEYCATCH_PROJECT_KEY, heycatchBeforeSend, heycatchPathAllowed } from "@/lib/heycatch";

const MARKETING = ["/", "/features", "/pricing", "/faq", "/support", "/contact", "/es", "/es/features", "/es/pricing", "/es/faq", "/es/support", "/es/contact"];
const NOT_MARKETING = ["/login", "/signup", "/dashboard", "/dashboard/account", "/developer/analytics", "/developer/accounts", "/pair", "/tv", "/player",
  "/auth/confirm", "/reset-password", "/forgot-password", "/terms", "/privacy", "/account-deletion", "/api/health", "/es/login", "/pricing/", "", undefined];

describe("HeyCatch analytics scope", () => {
  it("only lets events through on the twelve public marketing URLs", () => {
    for (const p of MARKETING) expect(heycatchPathAllowed(p), p).toBe(true);
    for (const p of NOT_MARKETING) expect(heycatchPathAllowed(p), String(p)).toBe(false);
  });

  it("beforeSend keeps events on marketing pages and drops everything else", () => {
    const ev = { event: "$pageview", properties: {} };
    expect(heycatchBeforeSend(ev, "/es")).toBe(ev);
    expect(heycatchBeforeSend(ev, "/pricing")).toBe(ev);
    expect(heycatchBeforeSend(ev, "/login")).toBeNull();
    expect(heycatchBeforeSend(ev, "/dashboard")).toBeNull();
    expect(heycatchBeforeSend(ev, undefined)).toBeNull();
    expect(heycatchBeforeSend(null, "/")).toBeNull();
  });

  it("uses the publishable project key from the install request", () => {
    expect(HEYCATCH_PROJECT_KEY).toBe("hck_pk_9lmBdPD6VPOp5doQibPsa2HoSp0i7SH7");
  });

  it("the SDK is imported by exactly one component, which only the six marketing page files mount (never a shared shell, so legal, sign-in and dashboard bundles do not evaluate it)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", "tests", ".git"].includes(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, "utf8").includes("@heycatch/sdk")) hits.push(p.replace(process.cwd() + "/", ""));
      }
    };
    for (const d of ["app", "components", "lib"]) walk(join(process.cwd(), d));
    expect(hits).toEqual(["components/site/heycatch-analytics.tsx"]);
    const mounts: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) scan(p);
        else if (/\.tsx$/.test(name) && /<HeyCatchAnalytics\s*\/>/.test(readFileSync(p, "utf8"))) mounts.push(p.replace(process.cwd() + "/", ""));
      }
    };
    for (const d of ["app", "components"]) scan(join(process.cwd(), d));
    expect(mounts.sort()).toEqual(["app/contact/page.tsx", "app/faq/page.tsx", "app/features/page.tsx", "app/page.tsx", "app/pricing/page.tsx", "app/support/page.tsx"]);
  });
});
