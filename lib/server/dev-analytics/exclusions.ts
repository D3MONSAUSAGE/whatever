import type { ReviewCandidate } from "@/lib/dev-analytics";

/**
 * Domains whose owners are always internal/QA/test. Only these (plus comp accounts) are excluded without an
 * explicit analytics_exclusions row. Public mail domains (gmail.com, hotmail.com, ...) are never on this
 * list: Francisco confirmed those accounts are real customers (t340u).
 */
export const DEFAULT_INTERNAL_DOMAINS = ["mail.grokbot.com", "teamtegrate.com", "example.com"] as const;

/** DEV_ANALYTICS_INTERNAL_DOMAINS="a.com,b.com" adds domains. It can't remove the defaults. */
export function internalDomains(env: Record<string, string | undefined> = process.env): string[] {
  const extra = (env.DEV_ANALYTICS_INTERNAL_DOMAINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...DEFAULT_INTERNAL_DOMAINS, ...extra])];
}

export type ClassifiableAccount = {
  id: string;
  created_at: string;
  comp: boolean;
  email_domain: string | null;
  plus_alias: boolean;
  excluded_reason: string | null;
};

export type Classification = {
  /** Left out of customer metrics unless "include internal" is on. */
  excluded: boolean;
  explicit: boolean;
  rule: ReviewCandidate["rule"] | null;
};

export function classifyAccount(a: ClassifiableAccount, domains: readonly string[]): Classification {
  const explicit = !!a.excluded_reason;
  const domain = (a.email_domain || "").toLowerCase();
  const rule: Classification["rule"] = a.comp ? "comp"
    : domain && domains.includes(domain) ? "internal_domain"
    : a.plus_alias ? "plus_alias"
    : null;
  // A "+alias" on a public domain is only a hint for review. It never hides a customer by itself.
  const byRule = rule === "comp" || rule === "internal_domain";
  return { excluded: explicit || byRule, explicit, rule };
}

/** Accounts that look internal but have no explicit exclusion row yet, newest first. Ids only. */
export function reviewCandidates(accounts: ClassifiableAccount[], domains: readonly string[], limit = 200): ReviewCandidate[] {
  const out: ReviewCandidate[] = [];
  for (const a of accounts) {
    const c = classifyAccount(a, domains);
    if (c.explicit || !c.rule) continue;
    out.push({ accountId: a.id, rule: c.rule, createdAt: a.created_at, excludedByDefault: c.excluded });
  }
  return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, limit);
}

export const INSERT_TEMPLATE =
  "insert into public.analytics_exclusions (account_id, reason) values ('<account-id>', 'internal') on conflict do nothing;";
