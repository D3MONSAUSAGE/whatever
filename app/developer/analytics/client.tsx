"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoadState } from "@/components/ui";
import { LogoMark } from "@/components/brand";
import { LanguageSelect } from "@/components/i18n/language-select";
import { BarRows, ColumnChart, Legend, LineChart, Meter, ORDINAL_BLUE, NEUTRAL, SegmentedBar, SERIES, TableView } from "@/components/developer/charts";
import { currentLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { RANGE_PRESETS, type DevAnalytics, type GroupCount, type Note, type NoteKey, type Rate, type RangePreset } from "@/lib/dev-analytics";
import "@/components/site/marketing/marketing.css";
import "@/components/developer/console.css";

/**
 * Developer console (DA-1 data, redesigned). This client shell is public JavaScript and holds no data; every
 * number comes from /api/developer/analytics, which checks developer_users on every request and answers 404
 * to anyone else. Signed-out visitors and non-developers see the normal "not found" page.
 * Only metrics the API already returns are shown; there is no stored revenue history, so none is drawn.
 */

type Load = { state: "loading" } | { state: "notFound" } | { state: "error"; message: string } | { state: "ready"; data: DevAnalytics };

const SECTIONS = ["overview", "activation", "revenue", "screens", "health"] as const;
type SectionId = (typeof SECTIONS)[number];

export function DeveloperAnalytics({ notFound }: { notFound: React.ReactNode }) {
  const t = useT();
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ preset: RangePreset; from: string; to: string }>({ preset: "30d", from: "", to: "" });
  const [includeInternal, setIncludeInternal] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [confirmed, setConfirmed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!supabaseConfigured()) { setLoad({ state: "notFound" }); return; }
    const { data: session } = await getSupabase().auth.getSession();
    const token = session.session?.access_token;
    if (!token) { setLoad({ state: "notFound" }); return; }
    const params = new URLSearchParams({ range: applied.preset });
    if (applied.preset === "custom") { params.set("from", applied.from); params.set("to", applied.to); }
    if (includeInternal) params.set("include", "internal");
    setLoad((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    try {
      const res = await fetch(`/api/developer/analytics?${params}`, {
        headers: { Authorization: `Bearer ${token}`, "Accept-Language": currentLocale() },
        cache: "no-store",
      });
      if (res.status === 404 || res.status === 401) { setLoad({ state: "notFound" }); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setLoad({ state: "error", message: body.error || t("common.somethingWrong") }); return; }
      setConfirmed(true);
      setLoad({ state: "ready", data: body as DevAnalytics });
    } catch {
      setLoad({ state: "error", message: t("ui.checkConnection") });
    }
  }, [applied, includeInternal, t]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  if (load.state === "notFound") return <>{notFound}</>;
  // Nothing about the console is shown until the API confirms a developer.
  if (!confirmed) return <main id="main" className="mx-auto max-w-6xl px-5 py-8"><LoadState error={load.state === "error" ? load.message : null} /></main>;

  const choose = (p: RangePreset) => {
    setPreset(p);
    if (p !== "custom") setApplied({ preset: p, from: "", to: "" });
  };

  return (
    <div className="mk dc" data-testid="dev-analytics">
      <ConsoleHeader />
      <SectionTabs />
      <main id="main" className="dc-main">
        <div className="dc-intro">
          <div>
            <p className="mk-eyebrow">{t("dev.eyebrow")}</p>
            <h1 className="dc-title">{t("dev.title")}</h1>
            <p className="dc-lede">{t("dev.lede")}</p>
            <p className="dc-legend-text">{t("dev.legend")}</p>
          </div>
          <Link href="/developer/accounts" className="btn btn-quiet" data-testid="to-accounts">{t("dacct.toAccounts")}</Link>
        </div>

        <section className="dc-filters" aria-label={t("dev.range.label")}>
          <div className="dc-segmented" role="group" aria-label={t("dev.range.label")}>
            {RANGE_PRESETS.map((p) => (
              <button key={p} type="button" className={preset === p ? "is-on" : ""} aria-pressed={preset === p} onClick={() => choose(p)} data-testid={`range-${p}`}>
                {t(`dev.range.${p}` as MessageKey)}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <form className="dc-custom" onSubmit={(e) => { e.preventDefault(); setApplied({ preset: "custom", from, to }); }}>
              <label>{t("dev.range.from")}<input type="date" className="dc-input" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
              <label>{t("dev.range.to")}<input type="date" className="dc-input" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
              <button type="submit" className="btn btn-primary">{t("dev.range.apply")}</button>
            </form>
          ) : null}
          <label className="dc-switch">
            <input type="checkbox" role="switch" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} data-testid="include-internal" />
            <span aria-hidden="true" />
            {t("dev.include")}
          </label>
        </section>

        {load.state === "ready" ? <Dashboard data={load.data} /> : <LoadState error={load.state === "error" ? load.message : null} />}
      </main>
    </div>
  );
}

function ConsoleHeader() {
  const t = useT();
  return (
    <header className="dc-top">
      <div className="dc-top-inner">
        <Link href="/dashboard" className="dc-brand" aria-label={t("dc.backToApp")}>
          <LogoMark className="size-8" />
          <span className="dc-brand-name">Pekko</span>
          <span className="dc-badge">{t("dc.console")}</span>
        </Link>
        <nav className="dc-top-nav" aria-label={t("dc.console")}>
          <span className="is-on" aria-current="page">{t("dacct.toAnalytics")}</span>
          <Link href="/developer/accounts">{t("dacct.toAccounts")}</Link>
          <Link href="/dashboard">{t("dc.backToApp")}</Link>
        </nav>
        <LanguageSelect compact refresh={false} />
      </div>
    </header>
  );
}

function SectionTabs() {
  const t = useT();
  const [active, setActive] = useState<SectionId>("overview");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (seen) setActive(seen.target.id.replace("dev-sec-", "") as SectionId);
    }, { rootMargin: "-140px 0px -55% 0px" });
    for (const id of SECTIONS) { const el = document.getElementById(`dev-sec-${id}`); if (el) io.observe(el); }
    return () => io.disconnect();
  });
  return (
    <nav className="dc-tabs" aria-label={t("dc.sections")}>
      <div className="dc-tabs-inner">
        {SECTIONS.map((id) => (
          <a key={id} href={`#dev-sec-${id}`} className={active === id ? "is-on" : ""} aria-current={active === id ? "true" : undefined}>{t(`dc.tab.${id}` as MessageKey)}</a>
        ))}
      </div>
    </nav>
  );
}

function useFormat() {
  const t = useT();
  const locale = currentLocale() === "es" ? "es-MX" : "en-US";
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const count = (n: GroupCount) => (n === null ? t("dev.hidden") : num(n));
  const pct = (r: Rate) => (r === null ? "–" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(r));
  // Stripe amounts are minor units (cents).
  const money = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const dateTime = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const shortDay = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return { num, count, pct, money, date, dateTime, day, shortDay };
}

const BILLING_NOTES: readonly NoteKey[] = ["billingFromStripe", "billingUnavailable", "billingTestMode", "mrrBeforeDiscounts", "unmappedSubscriptions"];

function uniqueNotes(notes: Note[]): Note[] {
  const seen = new Set<string>();
  return notes.filter((n) => {
    const k = `${n.key}:${JSON.stringify(n.vars ?? {})}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function Notes({ notes }: { notes: Note[] }) {
  const t = useT();
  const f = useFormat();
  const list = uniqueNotes(notes);
  if (!list.length) return null;
  return (
    <ul className="dc-notes" data-testid="dev-notes">
      {list.map((n, i) => {
        const vars: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(n.vars ?? {})) vars[k] = k === "date" && typeof v === "string" ? f.day(v.slice(0, 10)) : v;
        return (
          <li key={`${n.key}-${i}`} data-note={n.key}>
            <span className="dc-note-badge">{t("dev.incomplete")}</span>
            <span>{t(`dev.note.${n.key}` as MessageKey, vars)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ id, title, intro, notes, children }: { id: SectionId; title: string; intro?: string; notes?: Note[]; children: React.ReactNode }) {
  return (
    <section id={`dev-sec-${id}`} className="dc-section" aria-labelledby={`dev-${id}`} data-testid={`dev-section-${id}`}>
      <header className="dc-section-head">
        <h2 id={`dev-${id}`}>{title}</h2>
        {intro ? <p>{intro}</p> : null}
      </header>
      {children}
      {notes ? <Notes notes={notes} /> : null}
    </section>
  );
}

function Panel({ title, sub, children, className = "" }: { title?: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`dc-panel ${className}`}>
      {title ? <h3 className="dc-panel-title">{title}</h3> : null}
      {sub ? <p className="dc-panel-sub">{sub}</p> : null}
      {children}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "accent" }) {
  return (
    <div className={`dc-kpi ${tone === "accent" ? "is-accent" : ""}`}>
      <p className="dc-kpi-label">{label}</p>
      <p className="dc-kpi-value">{value}</p>
      {hint ? <p className="dc-kpi-hint">{hint}</p> : null}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number | React.ReactNode)[][] }) {
  return (
    <div className="dc-table-wrap">
      <table className="dc-table">
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function noteDate(notes: Note[], key: NoteKey): string | null {
  const n = notes.find((x) => x.key === key);
  const d = n?.vars?.date;
  return typeof d === "string" ? d.slice(0, 10) : null;
}

export function Dashboard({ data }: { data: DevAnalytics }) {
  const t = useT();
  const f = useFormat();
  const { overview: ov, funnel, engagement: en, retention: rt, attribution: at, review } = data;
  const billing = ov.billing;
  // Headline numbers say so when internal/test accounts are counted.
  const head = (key: MessageKey) => (data.population.includeInternal ? t("dev.withInternal", { label: t(key) }) : t(key));
  const hours = (x: { accounts: number; medianHours: number | null; p75Hours: number | null }) =>
    x.medianHours === null ? t("dev.hidden") : t("dc.act.hours", { n: f.num(x.medianHours) });
  const hoursHint = (x: { accounts: number; medianHours: number | null; p75Hours: number | null }) =>
    [x.medianHours === null ? null : t("dc.act.p75", { n: f.num(x.p75Hours ?? x.medianHours) }), t("dev.rt.accountsN", { n: x.accounts })].filter(Boolean).join(" · ");
  const paying = billing.available ? f.num(billing.paying) : t("dev.ov.unavailable");
  const mrr = billing.available && billing.mrr ? f.money(billing.mrr.amount, billing.mrr.currency) : t("dev.ov.unavailable");

  const billingNotes = ov.notes.filter((n) => BILLING_NOTES.includes(n.key));
  const overviewNotes = ov.notes.filter((n) => !BILLING_NOTES.includes(n.key));
  const allNotes = uniqueNotes([...ov.notes, ...funnel.notes, ...funnel.steps.flatMap((s) => s.notes), ...en.notes, ...rt.notes, ...at.notes]);
  const tableLabel = t("dc.chart.table");

  const weekly = rt.cohorts.map((c) => ({ key: c.weekStart, label: f.shortDay(c.weekStart), value: c.size }));
  const registered = funnel.steps[0]?.reached ?? null;
  const freshness: { key: string; label: string; value: number; color: string; display: string }[] = (["lt1h", "lt24h", "lt7d", "older"] as const).map((k, i) => ({ key: k, label: t(`dev.en.${k}`), value: en.screens.lastCheckIn[k], color: ORDINAL_BLUE[i], display: f.num(en.screens.lastCheckIn[k]) }));
  freshness.push({ key: "never", label: t("dev.en.never"), value: en.screens.lastCheckIn.never, color: NEUTRAL, display: f.num(en.screens.lastCheckIn.never) });
  const activityFrom = noteDate(allNotes, "activitySince");
  const uptimeFrom = noteDate(allNotes, "uptimeSince");
  const attributionFrom = noteDate(allNotes, "attributionSince");

  return (
    <div className="dc-sections">
      {data.population.includeInternal ? (
        <div role="status" className="dc-banner" data-testid="dev-internal-banner">{t("dev.internalBanner")}</div>
      ) : null}
      <p className="dc-meta" data-testid="dev-population">
        {t("dev.generated", { time: f.dateTime(data.generatedAt), tz: "PT", from: f.day(data.range.fromDay), to: f.day(data.range.toDay) })}{" "}
        {t("dev.population", { customers: f.num(data.population.customerAccounts), excluded: f.num(data.population.excludedExplicit + data.population.excludedByRule), explicit: f.num(data.population.excludedExplicit), rule: f.num(data.population.excludedByRule) })}
      </p>

      {/* ───────── Overview ───────── */}
      <Section id="overview" title={t("dc.tab.overview")} notes={overviewNotes}>
        <div className="dc-kpis">
          <Kpi label={head("dev.ov.accounts")} value={f.num(ov.accounts.total)} hint={t("dev.ov.newAccounts", { n: ov.accounts.newInRange })} />
          <Kpi label={head("dev.ov.newUsers")} value={f.num(ov.users.newInRange)} hint={t("dev.ov.confirmed", { n: ov.users.confirmedNewInRange })} />
          <Kpi label={head("dev.ov.screens")} value={f.num(ov.screens.connected)} hint={t("dev.ov.online", { n: ov.screens.onlineNow })} />
          <Kpi label={head("dev.ov.paying")} value={paying} hint={billing.available ? t("dev.ov.scheduled", { n: billing.scheduledToCancel }) : undefined} tone="accent" />
          <Kpi label={head("dev.ov.users")} value={f.num(ov.users.total)} hint={t("dev.ov.withoutAccount", { n: ov.users.withoutAccount })} />
          <Kpi label={head("dev.ov.trialsActive")} value={f.num(ov.trials.active)} hint={t("dev.ov.trialsGrace", { n: ov.trials.grace })} />
          <Kpi label={head("dev.ov.trialsExpired")} value={f.num(ov.trials.expired)} hint={t("dev.ov.trialsStarted", { n: ov.trials.startedInRange })} />
          <Kpi label={head("dev.ov.mrr")} value={mrr} tone="accent" />
        </div>
        <Panel title={t("dc.ov.signupsTitle")} sub={t("dc.ov.signupsBody")}>
          {weekly.length ? (
            <>
              <ColumnChart points={weekly} label={t("dc.ov.signupsTitle")} format={f.num} hiddenText={t("dev.hidden")} hiddenTitle={t("dc.chart.hiddenValue")} />
              <TableView label={tableLabel} head={[t("dev.rt.week"), t("dev.rt.size")]} rows={rt.cohorts.map((c) => [f.day(c.weekStart), f.count(c.size)])} />
            </>
          ) : <p className="dc-empty">{t("dev.rt.noCohorts")}</p>}
        </Panel>
      </Section>

      {/* ───────── Activation ───────── */}
      <Section id="activation" title={t("dc.tab.activation")} notes={[...funnel.notes, ...funnel.steps.flatMap((s) => s.notes.filter((n) => !BILLING_NOTES.includes(n.key))), ...rt.notes.filter((n) => !BILLING_NOTES.includes(n.key)), ...at.notes]}>
        <div className="dc-grid-2">
          <Panel title={t("dev.funnel")} sub={t("dev.fn.cohort", { n: f.num(funnel.cohort) })}>
            <BarRows
              hiddenText={t("dev.hidden")}
              max={registered ?? undefined}
              rows={funnel.steps.map((s, i) => ({
                key: s.key,
                label: t(`dev.fn.${s.key}` as MessageKey),
                value: s.reached,
                display: f.num(s.reached ?? 0),
                note: i === 0 ? undefined : [t("dc.act.ofRegistered", { pct: f.pct(s.fromRegistered) }), t("dc.act.dropOff", { pct: f.pct(s.dropOff) })].join(" · "),
              }))}
            />
            <TableView
              label={tableLabel}
              head={[t("dev.fn.step"), t("dev.fn.reached"), t("dev.fn.anyOrder"), t("dev.fn.fromPrev"), t("dev.fn.dropOff"), t("dev.fn.fromRegistered")]}
              rows={funnel.steps.map((s) => [t(`dev.fn.${s.key}` as MessageKey), f.count(s.reached), f.count(s.anyOrder), f.pct(s.fromPrevious), f.pct(s.dropOff), f.pct(s.fromRegistered)])}
            />
          </Panel>
          <div className="dc-stack">
            <Panel title={t("dc.act.speed")}>
              <div className="dc-kpis dc-kpis-2">
                <Kpi label={`${t("dev.rt.timeTv")} · ${t("dc.act.median")}`} value={hours(rt.timeToFirstTv)} hint={hoursHint(rt.timeToFirstTv)} />
                <Kpi label={`${t("dev.rt.timeDisplay")} · ${t("dc.act.median")}`} value={hours(rt.timeToFirstDisplay)} hint={hoursHint(rt.timeToFirstDisplay)} />
              </div>
            </Panel>
            <Panel title={t("dev.rt.cells")}>
              <ul className="dc-retention">
                {rt.cells.map((c) => (
                  <li key={c.day}>
                    <div className="dc-bar-head"><span>{t("dev.rt.day", { n: c.day })}</span><b>{c.retained === null ? t("dev.hidden") : f.pct(c.rate)}</b></div>
                    <Meter value={c.retained === null ? null : c.rate} />
                    <div className="dc-bar-note">{t("dev.rt.eligible", { n: f.num(c.eligible) })}{c.retained !== null ? ` · ${f.num(c.retained)}` : ""}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
        <Panel title={t("dev.rt.cohorts")}>
          {rt.cohorts.length ? (
            <Table
              head={[t("dev.rt.week"), t("dev.rt.size"), t("dev.rt.tv"), t("dev.rt.displayed"), t("dev.rt.paid"), t("dev.rt.d7")]}
              rows={rt.cohorts.map((c) => [f.day(c.weekStart), f.count(c.size), ...[c.tvPaired, c.contentDisplayed, c.paid, c.d7].map((r, i) => <Heat key={i} rate={r} text={f.pct(r)} />)])}
            />
          ) : <p className="dc-empty">{t("dev.rt.noCohorts")}</p>}
        </Panel>
        <Panel title={t("dev.attribution")} sub={t("dev.at.cohort", { n: f.num(at.cohort) })}>
          <div className="dc-grid-2">
            <BarRows hiddenText={t("dev.hidden")} rows={at.channels.map((c) => ({ key: c.key, label: t(`dev.at.${c.key}` as MessageKey), value: c.accounts, display: f.num(c.accounts ?? 0) }))} />
            <div>
              <h4 className="dc-mini-title">{t("dev.at.sources")}</h4>
              {at.sources.length ? (
                <BarRows hiddenText={t("dev.hidden")} color={SERIES[2]} rows={at.sources.map((s) => ({ key: s.source, label: s.source, value: s.accounts, display: f.num(s.accounts) }))} />
              ) : <p className="dc-empty">{t("dev.at.noSources")}</p>}
              {at.smallSources ? <p className="dc-small">{t("dev.at.smallSources", { n: f.num(at.smallSources) })}</p> : null}
            </div>
          </div>
        </Panel>
      </Section>

      {/* ───────── Revenue ───────── */}
      <Section id="revenue" title={t("dc.tab.revenue")} notes={billingNotes}>
        <div className="dc-kpis">
          <Kpi label={head("dev.ov.mrr")} value={mrr} tone="accent" />
          <Kpi label={head("dev.ov.paying")} value={paying} hint={billing.available ? t("dev.ov.scheduled", { n: billing.scheduledToCancel }) : undefined} tone="accent" />
          <Kpi label={t("dc.rev.stripeTrialing")} value={billing.available ? f.num(billing.stripeTrialing) : t("dev.ov.unavailable")} />
          <Kpi label={t("dev.ov.canceled")} value={billing.available ? f.num(billing.canceledInRange) : t("dev.ov.unavailable")} />
          <Kpi label={t("dev.rt.trialToPaid")} value={f.pct(rt.trialToPaid.rate)} hint={t("dev.rt.trialEnded", { n: rt.trialToPaid.ended })} />
          <Kpi label={t("dc.rev.excluded")} value={f.num(billing.excludedSubscriptions)} hint={billing.unmappedSubscriptions ? t("dev.note.unmappedSubscriptions", { n: billing.unmappedSubscriptions }) : undefined} />
        </div>
        <Panel className="dc-empty-panel">
          <p className="dc-empty-title">{t("dc.rev.noHistoryTitle")}</p>
          <p className="dc-empty">{t("dc.rev.noHistoryBody")}</p>
        </Panel>
      </Section>

      {/* ───────── Screen activity ───────── */}
      <Section id="screens" title={t("dc.tab.screens")} notes={en.notes}>
        <div className="dc-kpis">
          <Kpi label={head("dev.ov.screens")} value={f.num(en.screens.connected)} hint={t("dev.ov.paired", { n: f.num(ov.screens.pairedInRange) })} />
          <Kpi label={t("dc.online")} value={f.num(en.screens.onlineNow)} />
          <Kpi label={t("dev.en.publishes")} value={f.num(en.publishing.publishes)} hint={t("dev.en.publishingAccounts") + ": " + f.num(en.publishing.accounts)} />
          <Kpi label={t("dev.en.uploads")} value={f.num(en.publishing.uploads)} hint={t("dev.en.scheduleChanges") + ": " + f.num(en.publishing.scheduleChanges)} />
        </div>
        <Panel title={t("dc.scr.publishingTitle")} sub={t("dc.scr.publishingBody")}>
          <Legend items={[{ label: t("dev.en.publishes"), color: SERIES[0] }, { label: t("dev.en.contentChanges"), color: SERIES[1] }]} />
          <LineChart
            days={en.publishing.daily.map((d) => d.day)}
            series={[{ name: t("dev.en.publishes"), values: en.publishing.daily.map((d) => d.publishes) }, { name: t("dev.en.contentChanges"), values: en.publishing.daily.map((d) => d.contentChanges) }]}
            label={t("dc.scr.publishingTitle")}
            dayLabel={f.shortDay}
            format={f.num}
          />
          <TableView label={tableLabel} head={[t("dc.day"), t("dev.en.publishes"), t("dev.en.contentChanges")]} rows={en.publishing.daily.map((d) => [f.day(d.day), f.num(d.publishes), f.num(d.contentChanges)])} />
        </Panel>
        <div className="dc-grid-2">
          <Panel title={t("dc.scr.activeTitle")}>
            <Legend items={[{ label: t("dev.en.owner"), color: SERIES[0] }, { label: t("dev.en.screens"), color: SERIES[1] }, { label: t("dev.en.either"), color: SERIES[2] }]} />
            <div className="dc-groups">
              {en.active.map((a) => {
                const top = Math.max(1, ...en.active.map((x) => x.either));
                return (
                  <div key={a.days}>
                    <h4 className="dc-mini-title">{a.days === 1 ? t("dev.en.window1") : t("dev.en.window", { n: a.days })}</h4>
                    <BarRows hiddenText={t("dev.hidden")} max={top} rows={[
                      { key: "owner", label: t("dev.en.owner"), value: a.owner, display: f.num(a.owner), color: SERIES[0] },
                      { key: "screens", label: t("dev.en.screens"), value: a.screens, display: f.num(a.screens), color: SERIES[1] },
                      { key: "either", label: t("dev.en.either"), value: a.either, display: f.num(a.either), color: SERIES[2] },
                    ]} />
                  </div>
                );
              })}
            </div>
          </Panel>
          <div className="dc-stack">
            <Panel title={t("dev.en.repeat", { n: f.num(en.repeat.activeAccounts) })}>
              <BarRows hiddenText={t("dev.hidden")} max={Math.max(1, en.repeat.activeAccounts)} rows={[
                { key: "1", label: t("dev.en.oneDay"), value: en.repeat.oneDay, display: f.count(en.repeat.oneDay) },
                { key: "2", label: t("dev.en.twoToThree"), value: en.repeat.twoToThreeDays, display: f.count(en.repeat.twoToThreeDays) },
                { key: "4", label: t("dev.en.fourPlus"), value: en.repeat.fourPlusDays, display: f.count(en.repeat.fourPlusDays) },
                { key: "w", label: t("dev.en.multiWeek"), value: en.repeat.multiWeek, display: f.count(en.repeat.multiWeek) },
              ]} />
            </Panel>
            <Panel title={t("dev.rt.stopped")} sub={t("dev.rt.activated", { n: f.num(rt.stopped.activated) })}>
              <div className="dc-kpis dc-kpis-2">
                <Kpi label={t("dev.rt.dormant14")} value={f.count(rt.stopped.dormant14)} />
                <Kpi label={t("dev.rt.dormant30")} value={f.count(rt.stopped.dormant30)} />
              </div>
            </Panel>
          </div>
        </div>
      </Section>

      {/* ───────── System health ───────── */}
      <Section id="health" title={t("dc.tab.health")} intro={t("dc.hl.intro")}>
        <div className="dc-grid-2">
          <Panel title={t("dev.en.checkIn")} sub={t("dc.hl.checkInSub", { online: f.num(en.screens.onlineNow), connected: f.num(en.screens.connected) })}>
            <SegmentedBar parts={freshness} label={t("dev.en.checkIn")} />
          </Panel>
          <Panel title={t("dc.hl.sourcesTitle")}>
            <ul className="dc-status">
              <StatusRow label={t("dc.hl.stripe")} state={!billing.available ? "bad" : billing.livemode === false ? "warn" : "ok"}
                value={!billing.available ? t("dc.hl.stripeDown") : billing.livemode === false ? t("dc.hl.stripeTest") : t("dc.hl.stripeLive")} />
              <StatusRow label={t("dc.hl.activity")} state={activityFrom ? "ok" : "warn"} value={activityFrom ? t("dc.hl.since", { date: f.day(activityFrom) }) : t("dc.hl.notRecorded")} />
              <StatusRow label={t("dc.hl.uptime")} state={uptimeFrom ? "ok" : "warn"} value={uptimeFrom ? t("dc.hl.since", { date: f.day(uptimeFrom) }) : t("dc.hl.notRecorded")} />
              <StatusRow label={t("dc.hl.attribution")} state={attributionFrom ? "ok" : "warn"} value={attributionFrom ? t("dc.hl.since", { date: f.day(attributionFrom) }) : t("dc.hl.notRecorded")} />
            </ul>
          </Panel>
        </div>
        <Panel title={t("dc.hl.qualityTitle")}>
          <Notes notes={allNotes} />
        </Panel>
        <Panel title={t("dev.review")}>
          {review.candidates.length ? (
            <>
              <p className="dc-small">{t("dev.rv.body")}</p>
              <pre className="dc-code" data-testid="dev-review-template">{review.insertTemplate}</pre>
              <Table
                head={[t("dev.rv.account"), t("dev.rv.rule"), t("dev.rv.created"), t("dev.rv.status")]}
                rows={review.candidates.map((c) => [<code key="id" className="dc-id">{c.accountId}</code>, t(`dev.rv.${c.rule}` as MessageKey), f.date(c.createdAt), c.excludedByDefault ? t("dev.rv.excluded") : t("dev.rv.counted")])}
              />
            </>
          ) : <p className="dc-empty">{t("dev.rv.none")}</p>}
        </Panel>
      </Section>
    </div>
  );
}

function Heat({ rate, text }: { rate: Rate; text: string }) {
  return <span className="dc-heat" style={rate === null ? undefined : { background: `rgb(57 135 229 / ${(0.1 + rate * 0.55).toFixed(2)})` }}>{text}</span>;
}

function StatusRow({ label, value, state }: { label: string; value: string; state: "ok" | "warn" | "bad" }) {
  const icon = state === "ok" ? "M5 12.5l4 4L19 7" : state === "warn" ? "M12 8v5M12 16.5v.5" : "M7 7l10 10M17 7L7 17";
  return (
    <li className={`dc-status-row is-${state}`}>
      <span className="dc-status-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d={icon} /></svg></span>
      <span className="dc-status-label">{label}</span>
      <span className="dc-status-value">{value}</span>
    </li>
  );
}
