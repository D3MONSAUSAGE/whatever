"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoadState, PageHeader } from "@/components/ui";
import { currentLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import {
  ACCOUNT_POPULATIONS, ACCOUNT_SORTS, type AccountPopulation, type AccountRow, type AccountSort, type DevAccounts,
} from "@/lib/dev-accounts";

/**
 * DA-2 (t348u): developer-only Customer Accounts. This client is public JavaScript and holds no data; every row
 * comes from /api/developer/accounts, which answers 404 to anyone who isn't in developer_users. Until the API
 * confirms a developer, the page renders exactly the "not found" page.
 */

type Load = { state: "idle" } | { state: "loading" } | { state: "notFound" } | { state: "error"; message: string } | { state: "ready"; data: DevAccounts };
type Params = { population: AccountPopulation; q: string; sort: AccountSort; dir: "asc" | "desc"; page: number };

/** Brand plan names stay in English in both languages. */
const PAID_PLAN_NAMES: Record<string, string> = { starter: "Starter", business: "Business", multi: "Multi-screen" };

export function DeveloperAccounts({ notFound }: { notFound: React.ReactNode }) {
  const t = useT();
  const [params, setParams] = useState<Params>({ population: "customers", q: "", sort: "registered", dir: "desc", page: 1 });
  const [search, setSearch] = useState("");
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [confirmed, setConfirmed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!supabaseConfigured()) { setLoad({ state: "notFound" }); return; }
    const { data: session } = await getSupabase().auth.getSession();
    const token = session.session?.access_token;
    if (!token) { setLoad({ state: "notFound" }); return; }
    setLoad({ state: "loading" });
    const qs = new URLSearchParams({ population: params.population, sort: params.sort, dir: params.dir, page: String(params.page) });
    if (params.q) qs.set("q", params.q);
    try {
      const res = await fetch(`/api/developer/accounts?${qs}`, {
        headers: { Authorization: `Bearer ${token}`, "Accept-Language": currentLocale() },
        cache: "no-store",
      });
      if (res.status === 404 || res.status === 401) { setLoad({ state: "notFound" }); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setLoad({ state: "error", message: body.error || t("dacct.error") }); return; }
      setConfirmed(true);
      setLoad({ state: "ready", data: body as DevAccounts });
    } catch {
      setLoad({ state: "error", message: t("ui.checkConnection") });
    }
  }, [params, t]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Nothing about this page is shown until the API confirms a developer.
  if (!confirmed) {
    if (load.state === "loading" || load.state === "error") {
      return <main id="main" className="mx-auto max-w-6xl px-5 py-8"><LoadState error={load.state === "error" ? load.message : null} /></main>;
    }
    return <>{notFound}</>;
  }

  const set = (next: Partial<Params>) => setParams((p) => ({ ...p, page: 1, ...next }));
  const counts = load.state === "ready" ? load.data.counts : null;
  const dirLabel = (d: "asc" | "desc") => params.sort === "email" ? t(d === "asc" ? "dacct.dir.emailAsc" : "dacct.dir.emailDesc") : t(d === "asc" ? "dacct.dir.asc" : "dacct.dir.desc");

  return (
    <main id="main" className="mx-auto max-w-7xl px-5 py-8 grid gap-6" data-testid="dev-accounts">
      <PageHeader
        eyebrow={t("dacct.eyebrow")}
        title={t("dacct.title")}
        lede={t("dacct.lede")}
        action={<Link href="/developer/analytics" className="btn btn-quiet" data-testid="to-analytics">{t("dacct.toAnalytics")}</Link>}
      />
      <p className="text-sm text-muted">{t("dacct.legend")}</p>

      <section className="card p-4 grid gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("dacct.pop.label")}>
          {ACCOUNT_POPULATIONS.map((p) => (
            <button key={p} type="button" className={`btn ${params.population === p ? "btn-primary" : "btn-quiet"}`} aria-pressed={params.population === p}
              onClick={() => set({ population: p })} data-testid={`pop-${p}`}>
              {t(`dacct.pop.${p}` as MessageKey, { n: counts ? counts[p === "customers" ? "customers" : p === "internal" ? "internal" : "all"] : "–" })}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex flex-wrap items-end gap-2" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim() }); }}>
            <label className="grid gap-1 text-sm">{t("dacct.search")}
              <input type="search" className="field min-w-64" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} data-testid="acct-search" />
            </label>
            <button type="submit" className="btn btn-quiet">{t("dacct.searchButton")}</button>
          </form>
          <label className="grid gap-1 text-sm">{t("dacct.sort.label")}
            <select className="field" value={params.sort} onChange={(e) => { const s = e.target.value as AccountSort; set({ sort: s, dir: s === "email" ? "asc" : "desc" }); }} data-testid="acct-sort">
              {ACCOUNT_SORTS.map((s) => <option key={s} value={s}>{t(`dacct.sort.${s}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm"><span className="sr-only">{t("dacct.sort.label")}</span>
            <select className="field" value={params.dir} onChange={(e) => set({ dir: e.target.value as "asc" | "desc" })} data-testid="acct-dir">
              <option value="desc">{dirLabel("desc")}</option>
              <option value="asc">{dirLabel("asc")}</option>
            </select>
          </label>
        </div>
      </section>

      {load.state === "ready" ? <AccountsTable data={load.data} onPage={(page) => setParams((p) => ({ ...p, page }))} /> : <LoadState error={load.state === "error" ? load.message : null} />}
    </main>
  );
}

function useFormat() {
  const locale = currentLocale() === "es" ? "es-MX" : "en-US";
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const dateTime = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return { date, dateTime, day };
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  const cls = tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-black/5 text-muted";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function AccountsTable({ data, onPage }: { data: DevAccounts; onPage: (page: number) => void }) {
  const t = useT();
  const f = useFormat();
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const planName = (plan: string | null) => !plan ? "" : PAID_PLAN_NAMES[plan] ?? (["trial", "grandfathered", "comp"].includes(plan) ? t(`dacct.plan.${plan}` as MessageKey) : plan);

  const trialCell = (r: AccountRow) => (
    <>
      <div>{t(`dacct.trial.${r.trial.status}` as MessageKey)}</div>
      {r.trial.endsAt && (r.trial.status === "active" || r.trial.status === "grace" || r.trial.status === "expired")
        ? <div className="text-xs text-muted">{t(r.trial.status === "active" ? "dacct.trial.ends" : "dacct.trial.ended", { date: f.date(r.trial.endsAt) })}</div> : null}
    </>
  );
  const subCell = (r: AccountRow) => {
    const s = r.subscription;
    if (s.source === "none") return <><div>{t("dacct.sub.none")}</div>{s.mismatch ? <Badge tone="warn">{t("dacct.sub.mismatch")}</Badge> : null}{r.plan && r.plan !== "trial" ? <div className="text-xs text-muted">{planName(r.plan)}</div> : null}</>;
    return (
      <>
        <div>{s.status}{s.plan ? ` · ${planName(s.plan)}` : r.plan ? ` · ${planName(r.plan)}` : ""}</div>
        {s.currentPeriodEnd ? <div className="text-xs text-muted">{t(s.cancelAtPeriodEnd ? "dacct.sub.cancels" : "dacct.sub.renews", { date: f.date(s.currentPeriodEnd) })}</div> : null}
        {s.source === "stored" ? <Badge>{t("dacct.sub.stored")}</Badge> : null}
        {s.mismatch ? <Badge tone="warn">{t("dacct.sub.mismatch")}</Badge> : null}
      </>
    );
  };
  const tvCell = (r: AccountRow) => (
    <>
      <div>{r.tv.paired ? t("dacct.tv.yes", { active: r.tv.activeScreens, ever: r.tv.screensEver }) : t("dacct.tv.no")}</div>
      {r.tv.lastCheckInAt ? <div className="text-xs text-muted">{t("dacct.tv.checkIn", { time: f.dateTime(r.tv.lastCheckInAt) })}</div> : null}
    </>
  );
  const shownCell = (r: AccountRow) => (
    <>
      <div>{t(`dacct.shown.${r.displayed.status}` as MessageKey)}</div>
      {r.displayed.lastConfirmedAt ? <div className="text-xs text-muted">{t("dacct.shown.last", { time: f.dateTime(r.displayed.lastConfirmedAt) })}</div> : null}
    </>
  );
  const activityCell = (r: AccountRow) => {
    const a = r.lastActivity;
    if (!a.at) return <span className="text-muted">{t("dacct.act.none")}</span>;
    const what = a.source === "sign_in" ? t("dacct.act.sign_in") : a.action ? t(`dacct.act.${a.action}` as MessageKey) : "";
    return <><div>{f.dateTime(a.at)}</div>{what ? <div className="text-xs text-muted">{what}</div> : null}</>;
  };
  const sourceCell = (r: AccountRow) => {
    const s = r.signupSource;
    const detail = [s.utmSource, s.utmMedium, s.utmCampaign].filter(Boolean).join(" / ") || s.referrerHost || "";
    return <><div>{t(`dev.at.${s.channel}` as MessageKey)}</div>{detail ? <div className="text-xs text-muted break-all">{detail}</div> : null}</>;
  };

  const notes = data.notes.map((n) => {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(n.vars ?? {})) vars[k] = k === "date" && typeof v === "string" ? f.day(v.slice(0, 10)) : v;
    return { key: n.key, text: t(`dacct.note.${n.key}` as MessageKey, vars) };
  });

  return (
    <section className="grid gap-3" data-testid="acct-results">
      <p className="text-sm text-muted">{t("dacct.generated", { time: f.dateTime(data.generatedAt), tz: "PT" })} {t("dacct.results", { n: data.total })}</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm" data-testid="acct-table">
          <thead>
            <tr>
              {(["email", "registered", "trial", "subscription", "tv", "displayed", "activity", "source"] as const).map((c) => (
                <th key={c} scope="col" className="text-left font-semibold text-muted px-3 py-2 whitespace-nowrap">{t(`dacct.col.${c}` as MessageKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">{t("dacct.empty")}</td></tr>
            ) : data.rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top" data-testid="acct-row">
                <td className="px-3 py-2 min-w-[13rem]">
                  <div className="font-medium break-all">{r.email}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.internalReason ? <Badge>{t(`dacct.reason.${r.internalReason}` as MessageKey)}</Badge> : null}
                    {r.userOnly ? <Badge>{t("dacct.userOnly")}</Badge> : null}
                    {!r.emailConfirmed ? <Badge tone="warn">{t("dacct.unconfirmed")}</Badge> : null}
                    {r.deletionPending ? <Badge tone="warn">{t("dacct.deletionPending")}</Badge> : null}
                    {r.plusAliasHint && !r.internal ? <Badge>{t("dacct.plusAlias")}</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{f.date(r.registeredAt)}</td>
                <td className="px-3 py-2">{trialCell(r)}</td>
                <td className="px-3 py-2">{subCell(r)}</td>
                <td className="px-3 py-2">{tvCell(r)}</td>
                <td className="px-3 py-2">{shownCell(r)}</td>
                <td className="px-3 py-2">{activityCell(r)}</td>
                <td className="px-3 py-2">{sourceCell(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="flex items-center gap-3 text-sm" aria-label={t("dacct.pageOf", { page: data.page, pages })}>
          <button type="button" className="btn btn-quiet" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>{t("dacct.prev")}</button>
          <span>{t("dacct.pageOf", { page: data.page, pages })}</span>
          <button type="button" className="btn btn-quiet" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>{t("dacct.next")}</button>
        </nav>
      ) : null}
      <ul className="grid gap-1.5" data-testid="acct-notes">
        {notes.map((n) => <li key={n.key} className="text-sm text-muted" data-note={n.key}>{n.text}</li>)}
      </ul>
    </section>
  );
}
