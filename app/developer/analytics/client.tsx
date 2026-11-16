"use client";
import { useCallback, useEffect, useState } from "react";
import { LoadState, PageHeader, Stat } from "@/components/ui";
import { currentLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { RANGE_PRESETS, type DevAnalytics, type GroupCount, type Note, type Rate, type RangePreset } from "@/lib/dev-analytics";

/**
 * DA-1 (t337u Phase 1): aggregate-only developer analytics. This client shell is public JavaScript; every number
 * comes from /api/developer/analytics, which answers 404 to anyone who isn't in developer_users. Signed-out
 * visitors and non-developers see the normal "not found" page.
 */

type Load = { state: "loading" } | { state: "notFound" } | { state: "error"; message: string } | { state: "ready"; data: DevAnalytics };

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
  // Nothing about the dashboard is shown until the API confirms a developer.
  if (!confirmed) return <main id="main" className="mx-auto max-w-6xl px-5 py-8"><LoadState error={load.state === "error" ? load.message : null} /></main>;

  const choose = (p: RangePreset) => {
    setPreset(p);
    if (p !== "custom") setApplied({ preset: p, from: "", to: "" });
  };

  return (
    <main id="main" className="mx-auto max-w-6xl px-5 py-8 grid gap-6" data-testid="dev-analytics">
      <PageHeader eyebrow={t("dev.eyebrow")} title={t("dev.title")} lede={t("dev.lede")} />
      <p className="text-sm text-muted">{t("dev.legend")}</p>

      <section className="card p-4 grid gap-3" aria-label={t("dev.range.label")}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("dev.range.label")}>
          {RANGE_PRESETS.map((p) => (
            <button key={p} type="button" className={`btn ${preset === p ? "btn-primary" : "btn-quiet"}`} aria-pressed={preset === p} onClick={() => choose(p)} data-testid={`range-${p}`}>
              {t(`dev.range.${p}` as MessageKey)}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setApplied({ preset: "custom", from, to }); }}>
            <label className="grid gap-1 text-sm">{t("dev.range.from")}<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
            <label className="grid gap-1 text-sm">{t("dev.range.to")}<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
            <button type="submit" className="btn btn-primary">{t("dev.range.apply")}</button>
          </form>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} data-testid="include-internal" />
          {t("dev.include")}
        </label>
      </section>

      {load.state === "ready" ? <Dashboard data={load.data} /> : <LoadState error={load.state === "error" ? load.message : null} />}
    </main>
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
  return { num, count, pct, money, date, dateTime, day };
}

function Notes({ notes }: { notes: Note[] }) {
  const t = useT();
  const f = useFormat();
  if (!notes.length) return null;
  return (
    <ul className="grid gap-1.5" data-testid="dev-notes">
      {notes.map((n, i) => {
        const vars: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(n.vars ?? {})) vars[k] = k === "date" && typeof v === "string" ? f.day(v.slice(0, 10)) : v;
        return (
          <li key={`${n.key}-${i}`} className="text-sm flex gap-2 items-start" data-note={n.key}>
            <span className="shrink-0 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-semibold">{t("dev.incomplete")}</span>
            <span className="text-muted">{t(`dev.note.${n.key}` as MessageKey, vars)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ id, title, notes, children }: { id: string; title: string; notes?: Note[]; children: React.ReactNode }) {
  return (
    <section className="grid gap-3" aria-labelledby={`dev-${id}`} data-testid={`dev-section-${id}`}>
      <h2 id={`dev-${id}`} className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
      {notes ? <Notes notes={notes} /> : null}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{head.map((h) => <th key={h} scope="col" className="text-left font-semibold text-muted px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-3 py-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Dashboard({ data }: { data: DevAnalytics }) {
  const t = useT();
  const f = useFormat();
  const { overview: ov, funnel, engagement: en, retention: rt, attribution: at, review } = data;
  const billing = ov.billing;
  // Headline numbers say so when internal/test accounts are counted.
  const head = (key: MessageKey) => (data.population.includeInternal ? t("dev.withInternal", { label: t(key) }) : t(key));
  const hours = (x: { accounts: number; medianHours: number | null; p75Hours: number | null }) =>
    x.medianHours === null ? t("dev.hidden") : t("dev.rt.hours", { median: f.num(x.medianHours), p75: f.num(x.p75Hours ?? x.medianHours) });

  return (
    <div className="grid gap-8">
      {data.population.includeInternal ? (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm font-semibold" data-testid="dev-internal-banner">
          {t("dev.internalBanner")}
        </div>
      ) : null}
      <p className="text-sm text-muted" data-testid="dev-population">
        {t("dev.generated", { time: f.dateTime(data.generatedAt), tz: "PT", from: f.day(data.range.fromDay), to: f.day(data.range.toDay) })}{" "}
        {t("dev.population", { customers: f.num(data.population.customerAccounts), excluded: f.num(data.population.excludedExplicit + data.population.excludedByRule), explicit: f.num(data.population.excludedExplicit), rule: f.num(data.population.excludedByRule) })}
      </p>

      <Section id="overview" title={t("dev.overview")} notes={ov.notes}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={head("dev.ov.accounts")} value={f.num(ov.accounts.total)} hint={t("dev.ov.newAccounts", { n: ov.accounts.newInRange })} />
          <Stat label={head("dev.ov.users")} value={f.num(ov.users.total)} hint={t("dev.ov.withoutAccount", { n: ov.users.withoutAccount })} />
          <Stat label={head("dev.ov.newUsers")} value={f.num(ov.users.newInRange)} hint={t("dev.ov.confirmed", { n: ov.users.confirmedNewInRange })} />
          <Stat label={head("dev.ov.screens")} value={f.num(ov.screens.connected)} hint={t("dev.ov.online", { n: ov.screens.onlineNow })} />
          <Stat label={head("dev.ov.trialsActive")} value={f.num(ov.trials.active)} hint={t("dev.ov.trialsGrace", { n: ov.trials.grace })} />
          <Stat label={head("dev.ov.trialsExpired")} value={f.num(ov.trials.expired)} hint={t("dev.ov.trialsStarted", { n: ov.trials.startedInRange })} />
          <Stat label={head("dev.ov.paying")} value={billing.available ? f.num(billing.paying) : t("dev.ov.unavailable")} hint={billing.available ? t("dev.ov.scheduled", { n: billing.scheduledToCancel }) : undefined} />
          <Stat label={head("dev.ov.mrr")} value={billing.available && billing.mrr ? f.money(billing.mrr.amount, billing.mrr.currency) : t("dev.ov.unavailable")} />
        </div>
        <ul className="text-sm text-muted grid gap-0.5">
          <li>{t("dev.ov.paired", { n: f.num(ov.screens.pairedInRange) })}</li>
          {billing.available ? <li>{t("dev.ov.canceled")}: {f.num(billing.canceledInRange)}</li> : null}
        </ul>
      </Section>

      <Section id="funnel" title={t("dev.funnel")} notes={[...funnel.notes, ...funnel.steps.flatMap((s) => s.notes)]}>
        <p className="text-sm text-muted">{t("dev.fn.cohort", { n: f.num(funnel.cohort) })}</p>
        <Table
          head={[t("dev.fn.step"), t("dev.fn.reached"), t("dev.fn.anyOrder"), t("dev.fn.fromPrev"), t("dev.fn.dropOff"), t("dev.fn.fromRegistered")]}
          rows={funnel.steps.map((s) => [t(`dev.fn.${s.key}` as MessageKey), f.count(s.reached), f.count(s.anyOrder), f.pct(s.fromPrevious), f.pct(s.dropOff), f.pct(s.fromRegistered)])}
        />
      </Section>

      <Section id="engagement" title={t("dev.engagement")} notes={en.notes}>
        <Table
          head={[t("dev.en.active"), t("dev.en.owner"), t("dev.en.screens"), t("dev.en.either")]}
          rows={en.active.map((a) => [a.days === 1 ? t("dev.en.window1") : t("dev.en.window", { n: a.days }), f.num(a.owner), f.num(a.screens), f.num(a.either)])}
        />
        <Table
          head={[t("dev.en.checkIn"), t("dev.rt.size")]}
          rows={(["lt1h", "lt24h", "lt7d", "older", "never"] as const).map((k) => [t(`dev.en.${k}`), f.num(en.screens.lastCheckIn[k])])}
        />
        <Table
          head={[t("dev.en.publishing"), t("dev.en.count")]}
          rows={[
            [t("dev.en.publishes"), f.num(en.publishing.publishes)],
            [t("dev.en.contentChanges"), f.num(en.publishing.contentChanges)],
            [t("dev.en.uploads"), f.num(en.publishing.uploads)],
            [t("dev.en.scheduleChanges"), f.num(en.publishing.scheduleChanges)],
            [t("dev.en.publishingAccounts"), f.num(en.publishing.accounts)],
          ]}
        />
        <Table
          head={[t("dev.en.repeat", { n: f.num(en.repeat.activeAccounts) }), t("dev.rt.size")]}
          rows={[
            [t("dev.en.oneDay"), f.count(en.repeat.oneDay)],
            [t("dev.en.twoToThree"), f.count(en.repeat.twoToThreeDays)],
            [t("dev.en.fourPlus"), f.count(en.repeat.fourPlusDays)],
            [t("dev.en.multiWeek"), f.count(en.repeat.multiWeek)],
          ]}
        />
      </Section>

      <Section id="retention" title={t("dev.retention")} notes={rt.notes}>
        <Table
          head={[t("dev.rt.cells"), t("dev.rt.size"), t("dev.fn.reached"), t("dev.rt.rate")]}
          rows={rt.cells.map((c) => [t("dev.rt.day", { n: c.day }), t("dev.rt.eligible", { n: f.num(c.eligible) }), f.count(c.retained), f.pct(c.rate)])}
        />
        {rt.cohorts.length ? (
          <Table
            head={[t("dev.rt.week"), t("dev.rt.size"), t("dev.rt.tv"), t("dev.rt.displayed"), t("dev.rt.paid"), t("dev.rt.d7")]}
            rows={rt.cohorts.map((c) => [f.day(c.weekStart), f.count(c.size), f.pct(c.tvPaired), f.pct(c.contentDisplayed), f.pct(c.paid), f.pct(c.d7)])}
          />
        ) : <p className="text-sm text-muted">{t("dev.rt.noCohorts")}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("dev.rt.trialToPaid")} value={f.pct(rt.trialToPaid.rate)} hint={t("dev.rt.trialEnded", { n: rt.trialToPaid.ended })} />
          <Stat label={t("dev.rt.timeTv")} value={hours(rt.timeToFirstTv)} hint={t("dev.rt.accountsN", { n: rt.timeToFirstTv.accounts })} />
          <Stat label={t("dev.rt.timeDisplay")} value={hours(rt.timeToFirstDisplay)} hint={t("dev.rt.accountsN", { n: rt.timeToFirstDisplay.accounts })} />
          <Stat label={t("dev.rt.billingCanceled")} value={f.num(rt.stopped.billingCanceledInRange)} />
        </div>
        <Table
          head={[t("dev.rt.stopped"), t("dev.rt.activated", { n: f.num(rt.stopped.activated) })]}
          rows={[[t("dev.rt.dormant14"), f.count(rt.stopped.dormant14)], [t("dev.rt.dormant30"), f.count(rt.stopped.dormant30)]]}
        />
      </Section>

      <Section id="attribution" title={t("dev.attribution")} notes={at.notes}>
        <Table head={[t("dev.at.cohort", { n: f.num(at.cohort) }), t("dev.rt.size")]} rows={at.channels.map((c) => [t(`dev.at.${c.key}` as MessageKey), f.count(c.accounts)])} />
        {at.sources.length ? (
          <Table head={[t("dev.at.sources"), t("dev.rt.size")]} rows={at.sources.map((s) => [s.source, f.num(s.accounts)])} />
        ) : <p className="text-sm text-muted">{t("dev.at.noSources")}</p>}
        {at.smallSources ? <p className="text-sm text-muted">{t("dev.at.smallSources", { n: f.num(at.smallSources) })}</p> : null}
      </Section>

      <Section id="review" title={t("dev.review")}>
        {review.candidates.length ? (
          <>
            <p className="text-sm text-muted">{t("dev.rv.body")}</p>
            <pre className="card p-3 text-xs overflow-x-auto" data-testid="dev-review-template">{review.insertTemplate}</pre>
            <Table
              head={[t("dev.rv.account"), t("dev.rv.rule"), t("dev.rv.created"), t("dev.rv.status")]}
              rows={review.candidates.map((c) => [c.accountId, t(`dev.rv.${c.rule}` as MessageKey), f.date(c.createdAt), c.excludedByDefault ? t("dev.rv.excluded") : t("dev.rv.counted")])}
            />
          </>
        ) : <p className="text-sm text-muted">{t("dev.rv.none")}</p>}
      </Section>
    </div>
  );
}
