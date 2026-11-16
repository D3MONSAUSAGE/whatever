"use client";
import { useCallback, useEffect, useState } from "react";
import { LoadState } from "@/components/ui";
import { currentLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import {
  ACCOUNT_POPULATIONS, ACCOUNT_SORTS, type AccountPopulation, type AccountRow, type AccountSort, type DevAccounts,
} from "@/lib/dev-accounts";

/**
 * Customer Accounts, as a tab of the developer console (DA-2 data). Holds no data itself: every row comes from
 * POST /api/developer/accounts, which checks developer_users on every request and answers 404 to anyone else.
 * POST keeps an email search out of URLs, browser history and request logs.
 */

type Load = { state: "idle" } | { state: "loading" } | { state: "notFound" } | { state: "error"; message: string } | { state: "ready"; data: DevAccounts };
type Params = { population: AccountPopulation; q: string; sort: AccountSort; dir: "asc" | "desc"; page: number };

/** Brand plan names stay in English in both languages. */
const PAID_PLAN_NAMES: Record<string, string> = { starter: "Starter", business: "Business", multi: "Multi-screen" };

export function AccountsView({ onConfirmed, onNotFound }: { onConfirmed: () => void; onNotFound: () => void }) {
  const t = useT();
  const [params, setParams] = useState<Params>({ population: "customers", q: "", sort: "registered", dir: "desc", page: 1 });
  const [search, setSearch] = useState("");
  const [load, setLoad] = useState<Load>({ state: "idle" });

  const fetchData = useCallback(async () => {
    if (!supabaseConfigured()) { onNotFound(); return; }
    const { data: session } = await getSupabase().auth.getSession();
    const token = session.session?.access_token;
    if (!token) { onNotFound(); return; }
    setLoad((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    const payload = JSON.stringify({ population: params.population, q: params.q, sort: params.sort, dir: params.dir, page: params.page });
    try {
      const res = await fetch("/api/developer/accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Accept-Language": currentLocale(), "Content-Type": "application/json" },
        body: payload,
        cache: "no-store",
      });
      if (res.status === 404 || res.status === 401) { setLoad({ state: "notFound" }); onNotFound(); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setLoad({ state: "error", message: body.error || t("dacct.error") }); return; }
      onConfirmed();
      setLoad({ state: "ready", data: body as DevAccounts });
    } catch {
      setLoad({ state: "error", message: t("ui.checkConnection") });
    }
  }, [params, t, onConfirmed, onNotFound]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const set = (next: Partial<Params>) => setParams((p) => ({ ...p, page: 1, ...next }));
  const counts = load.state === "ready" ? load.data.counts : null;
  const dirLabel = (d: "asc" | "desc") => params.sort === "email" ? t(d === "asc" ? "dacct.dir.emailAsc" : "dacct.dir.emailDesc") : t(d === "asc" ? "dacct.dir.asc" : "dacct.dir.desc");

  return (
    <div className="dc-sections" data-testid="dev-accounts">
      <section className="dc-section" aria-labelledby="dev-accounts-title">
        <header className="dc-section-head">
          <h2 id="dev-accounts-title">{t("dacct.title")}</h2>
          <p>{t("dacct.lede")}</p>
          <p>{t("dacct.legend")}</p>
        </header>

        <div className="dc-filters">
          <div className="dc-segmented" role="group" aria-label={t("dacct.pop.label")}>
            {ACCOUNT_POPULATIONS.map((p) => (
              <button key={p} type="button" className={params.population === p ? "is-on" : ""} aria-pressed={params.population === p}
                onClick={() => set({ population: p })} data-testid={`pop-${p}`}>
                {t(`dacct.pop.${p}` as MessageKey, { n: counts ? counts[p === "customers" ? "customers" : p === "internal" ? "internal" : "all"] : "–" })}
              </button>
            ))}
          </div>
          <form className="dc-custom" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim() }); }}>
            <label>{t("dacct.search")}
              <input type="search" className="dc-input dc-search" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} data-testid="acct-search" />
            </label>
            <button type="submit" className="btn btn-quiet">{t("dacct.searchButton")}</button>
          </form>
          <div className="dc-custom">
            <label>{t("dacct.sort.label")}
              <select className="dc-input" value={params.sort} onChange={(e) => { const s = e.target.value as AccountSort; set({ sort: s, dir: s === "email" ? "asc" : "desc" }); }} data-testid="acct-sort">
                {ACCOUNT_SORTS.map((s) => <option key={s} value={s}>{t(`dacct.sort.${s}` as MessageKey)}</option>)}
              </select>
            </label>
            <label><span className="sr-only">{t("dacct.sort.label")}</span><span aria-hidden="true">&nbsp;</span>
              <select className="dc-input" value={params.dir} onChange={(e) => set({ dir: e.target.value as "asc" | "desc" })} data-testid="acct-dir">
                <option value="desc">{dirLabel("desc")}</option>
                <option value="asc">{dirLabel("asc")}</option>
              </select>
            </label>
          </div>
        </div>

        {load.state === "ready" ? <AccountsTable data={load.data} onPage={(page) => setParams((p) => ({ ...p, page }))} />
          : load.state === "notFound" ? null : <LoadState error={load.state === "error" ? load.message : null} />}
      </section>
    </div>
  );
}

function useFormat() {
  const locale = currentLocale() === "es" ? "es-MX" : "en-US";
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const dateTime = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return { date, dateTime, day };
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  return <span className={`dc-chip ${tone === "warn" ? "is-warn" : ""}`}>{children}</span>;
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
        ? <div className="dc-cell-sub">{t(r.trial.status === "active" ? "dacct.trial.ends" : "dacct.trial.ended", { date: f.date(r.trial.endsAt) })}</div> : null}
    </>
  );
  const subCell = (r: AccountRow) => {
    const s = r.subscription;
    if (s.source === "none") return <><div>{t("dacct.sub.none")}</div>{s.mismatch ? <Chip tone="warn">{t("dacct.sub.mismatch")}</Chip> : null}{r.plan && r.plan !== "trial" ? <div className="dc-cell-sub">{planName(r.plan)}</div> : null}</>;
    return (
      <>
        <div>{s.status}{s.plan ? ` · ${planName(s.plan)}` : r.plan ? ` · ${planName(r.plan)}` : ""}</div>
        {s.currentPeriodEnd ? <div className="dc-cell-sub">{t(s.cancelAtPeriodEnd ? "dacct.sub.cancels" : "dacct.sub.renews", { date: f.date(s.currentPeriodEnd) })}</div> : null}
        {s.source === "stored" ? <Chip>{t("dacct.sub.stored")}</Chip> : null}
        {s.mismatch ? <Chip tone="warn">{t("dacct.sub.mismatch")}</Chip> : null}
      </>
    );
  };
  const tvCell = (r: AccountRow) => (
    <>
      <div>{r.tv.paired ? t("dacct.tv.yes", { active: r.tv.activeScreens, ever: r.tv.screensEver }) : t("dacct.tv.no")}</div>
      {r.tv.lastCheckInAt ? <div className="dc-cell-sub">{t("dacct.tv.checkIn", { time: f.dateTime(r.tv.lastCheckInAt) })}</div> : null}
    </>
  );
  const shownCell = (r: AccountRow) => (
    <>
      <div>{t(`dacct.shown.${r.displayed.status}` as MessageKey)}</div>
      {r.displayed.lastConfirmedAt ? <div className="dc-cell-sub">{t("dacct.shown.last", { time: f.dateTime(r.displayed.lastConfirmedAt) })}</div> : null}
    </>
  );
  const activityCell = (r: AccountRow) => {
    const a = r.lastActivity;
    if (!a.at) return <span className="dc-cell-sub">{t("dacct.act.none")}</span>;
    const what = a.source === "sign_in" ? t("dacct.act.sign_in") : a.action ? t(`dacct.act.${a.action}` as MessageKey) : "";
    return <><div>{f.dateTime(a.at)}</div>{what ? <div className="dc-cell-sub">{what}</div> : null}</>;
  };
  const sourceCell = (r: AccountRow) => {
    const s = r.signupSource;
    const detail = [s.utmSource, s.utmMedium, s.utmCampaign].filter(Boolean).join(" / ") || s.referrerHost || "";
    return <><div>{t(`dev.at.${s.channel}` as MessageKey)}</div>{detail ? <div className="dc-cell-sub break-all">{detail}</div> : null}</>;
  };

  const notes = data.notes.map((n) => {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(n.vars ?? {})) vars[k] = k === "date" && typeof v === "string" ? f.day(v.slice(0, 10)) : v;
    // firstPlaybackWindow is the aggregate dashboard's own note, reused word for word.
    const key = (n.key === "firstPlaybackWindow" ? "dev.note.firstPlaybackWindow" : `dacct.note.${n.key}`) as MessageKey;
    return { key: n.key, text: t(key, vars) };
  });

  return (
    <div className="dc-section" data-testid="acct-results">
      <p className="dc-meta">{t("dacct.generated", { time: f.dateTime(data.generatedAt), tz: "PT" })} {t("dacct.results", { n: data.total })}</p>
      <div className="dc-panel dc-panel-flush">
        <div className="dc-table-wrap">
          <table className="dc-table dc-accounts" data-testid="acct-table">
            <thead>
              <tr>
                {(["email", "registered", "trial", "subscription", "tv", "displayed", "activity", "source"] as const).map((c) => (
                  <th key={c} scope="col">{t(`dacct.col.${c}` as MessageKey)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={8} className="dc-empty-row">{t("dacct.empty")}</td></tr>
              ) : data.rows.map((r) => (
                <tr key={r.id} data-testid="acct-row">
                  <td className="dc-email-cell">
                    <div className="dc-email">{r.email}</div>
                    <div className="dc-chips">
                      {r.internalReason ? <Chip>{t(`dacct.reason.${r.internalReason}` as MessageKey)}</Chip> : null}
                      {r.userOnly ? <Chip>{t("dacct.userOnly")}</Chip> : null}
                      {!r.emailConfirmed ? <Chip tone="warn">{t("dacct.unconfirmed")}</Chip> : null}
                      {r.deletionPending ? <Chip tone="warn">{t("dacct.deletionPending")}</Chip> : null}
                      {r.plusAliasHint && !r.internal ? <Chip>{t("dacct.plusAlias")}</Chip> : null}
                    </div>
                  </td>
                  <td>{f.date(r.registeredAt)}</td>
                  <td>{trialCell(r)}</td>
                  <td>{subCell(r)}</td>
                  <td>{tvCell(r)}</td>
                  <td>{shownCell(r)}</td>
                  <td>{activityCell(r)}</td>
                  <td>{sourceCell(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {pages > 1 ? (
        <nav className="dc-pager" aria-label={t("dacct.pageOf", { page: data.page, pages })}>
          <button type="button" className="btn btn-quiet" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>{t("dacct.prev")}</button>
          <span>{t("dacct.pageOf", { page: data.page, pages })}</span>
          <button type="button" className="btn btn-quiet" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>{t("dacct.next")}</button>
        </nav>
      ) : null}
      <ul className="dc-notes dc-notes-plain" data-testid="acct-notes">
        {notes.map((n) => <li key={n.key} data-note={n.key}>{n.text}</li>)}
      </ul>
    </div>
  );
}
