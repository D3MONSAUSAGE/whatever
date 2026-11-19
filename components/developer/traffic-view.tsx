"use client";
import { useCallback, useEffect, useState } from "react";
import { LoadState } from "@/components/ui";
import { BarRows, Legend, LineChart, SERIES, TableView } from "@/components/developer/charts";
import { currentLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { RANGE_PRESETS, type RangePreset } from "@/lib/dev-analytics";
import type { DevTraffic } from "@/lib/traffic";

/**
 * Developer console "Website traffic" tab. Holds no data itself: everything comes from
 * GET /api/developer/traffic, which checks developer_users on every request and answers 404 to anyone else.
 * Numbers are aggregate counts from the cookieless marketing-page counter (migration 0031); registrations
 * are customer accounts only. Nothing is shown as data when collection isn't set up.
 */
type Load = { state: "loading" } | { state: "notFound" } | { state: "error"; message: string } | { state: "ready"; data: DevTraffic };

export function TrafficView({ onConfirmed, onNotFound }: { onConfirmed: () => void; onNotFound: () => void }) {
  const t = useT();
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ preset: RangePreset; from: string; to: string }>({ preset: "30d", from: "", to: "" });
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const fetchData = useCallback(async () => {
    if (!supabaseConfigured()) { onNotFound(); return; }
    const { data: session } = await getSupabase().auth.getSession();
    const token = session.session?.access_token;
    if (!token) { onNotFound(); return; }
    const params = new URLSearchParams({ range: applied.preset });
    if (applied.preset === "custom") { params.set("from", applied.from); params.set("to", applied.to); }
    setLoad((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    try {
      const res = await fetch(`/api/developer/traffic?${params}`, { headers: { Authorization: `Bearer ${token}`, "Accept-Language": currentLocale() }, cache: "no-store" });
      if (res.status === 404 || res.status === 401) { setLoad({ state: "notFound" }); onNotFound(); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setLoad({ state: "error", message: body.error || t("common.somethingWrong") }); return; }
      onConfirmed();
      setLoad({ state: "ready", data: body as DevTraffic });
    } catch {
      setLoad({ state: "error", message: t("ui.checkConnection") });
    }
  }, [applied, t, onConfirmed, onNotFound]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const choose = (p: RangePreset) => { setPreset(p); if (p !== "custom") setApplied({ preset: p, from: "", to: "" }); };

  return (
    <div className="dc-sections" data-testid="dev-traffic">
      <section className="dc-section" aria-labelledby="dev-traffic-title">
        <header className="dc-section-head">
          <h2 id="dev-traffic-title">{t("tr.title")}</h2>
          <p>{t("tr.lede")}</p>
        </header>
        <div className="dc-filters" aria-label={t("dev.range.label")}>
          <div className="dc-segmented" role="group" aria-label={t("dev.range.label")}>
            {RANGE_PRESETS.map((p) => (
              <button key={p} type="button" className={preset === p ? "is-on" : ""} aria-pressed={preset === p} onClick={() => choose(p)} data-testid={`tr-range-${p}`}>
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
        </div>
        {load.state === "ready" ? <TrafficReport data={load.data} /> : load.state === "notFound" ? null : <LoadState error={load.state === "error" ? load.message : null} />}
      </section>
    </div>
  );
}

function useFormat() {
  const t = useT();
  const locale = currentLocale() === "es" ? "es-MX" : "en-US";
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const pct = (r: number | null) => (r === null ? "–" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(r));
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const shortDay = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const dateTime = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const count = (n: number | null) => (n === null ? t("dev.hidden") : num(n));
  return { num, pct, day, shortDay, dateTime, count };
}

export function TrafficReport({ data }: { data: DevTraffic }) {
  const t = useT();
  const f = useFormat();
  const notes = data.notes.map((n) => {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(n.vars ?? {})) vars[k] = k === "date" && typeof v === "string" ? f.day(v.slice(0, 10)) : v;
    return { key: n.key, text: n.key === "attributionSince" ? t("dev.note.attributionSince", vars) : n.key === "smallGroups" ? t("dev.note.smallGroups") : t(`tr.note.${n.key}` as MessageKey, vars) };
  });
  const pageLabel = (p: string) => (p === "/" ? t("tr.page.home") : p === "/es" ? t("tr.page.homeEs") : p);

  return (
    <div className="dc-sections">
      <p className="dc-meta" data-testid="tr-meta">
        {t("dev.generated", { time: f.dateTime(data.generatedAt), tz: "PT", from: f.day(data.range.fromDay), to: f.day(data.range.toDay) })}
      </p>
      {!data.collecting ? (
        <div className="dc-panel dc-empty-panel" data-testid="tr-not-collecting">
          <p className="dc-empty-title">{t("tr.notCollectingTitle")}</p>
          <p className="dc-empty">{t("tr.note.notCollecting")}</p>
        </div>
      ) : null}

      <div className="dc-kpis">
        <Kpi label={t("tr.kpi.visitors")} value={f.num(data.totals.visitors)} hint={t("tr.kpi.visitorsHint")} accent />
        <Kpi label={t("tr.kpi.landings")} value={f.num(data.totals.landings)} hint={t("tr.kpi.landingsHint")} />
        <Kpi label={t("tr.kpi.pageViews")} value={f.num(data.totals.pageViews)} />
        <Kpi label={t("tr.kpi.conversion")} value={f.pct(data.registrations.conversion)} hint={t("tr.kpi.conversionHint", { n: f.num(data.registrations.customers) })} accent />
      </div>

      <div className="dc-panel">
        <h3 className="dc-panel-title">{t("tr.dailyTitle")}</h3>
        <p className="dc-panel-sub">{t("tr.dailySub")}</p>
        {data.collecting && data.totals.pageViews > 0 ? (
          <>
            <Legend items={[{ label: t("tr.kpi.visitors"), color: SERIES[0] }, { label: t("tr.kpi.pageViews"), color: SERIES[1] }]} />
            <LineChart
              days={data.daily.map((d) => d.day)}
              series={[{ name: t("tr.kpi.visitors"), values: data.daily.map((d) => d.visitors) }, { name: t("tr.kpi.pageViews"), values: data.daily.map((d) => d.pageViews) }]}
              label={t("tr.dailyTitle")} dayLabel={f.shortDay} format={f.num}
            />
            <TableView label={t("dc.chart.table")} head={[t("dc.day"), t("tr.kpi.visitors"), t("tr.kpi.landings"), t("tr.kpi.pageViews")]}
              rows={data.daily.map((d) => [f.day(d.day), f.num(d.visitors), f.num(d.landings), f.num(d.pageViews)])} />
          </>
        ) : <p className="dc-empty">{t("tr.noData")}</p>}
      </div>

      <div className="dc-grid-2">
        <div className="dc-panel">
          <h3 className="dc-panel-title">{t("tr.pagesTitle")}</h3>
          <p className="dc-panel-sub">{t("tr.pagesSub")}</p>
          {data.pages.length ? (
            <>
              <BarRows hiddenText={t("dev.hidden")} rows={data.pages.map((p) => ({ key: p.path, label: pageLabel(p.path), value: p.landings, display: f.num(p.landings), note: t("tr.pageViewsN", { n: f.num(p.pageViews) }) }))} />
              <TableView label={t("dc.chart.table")} head={[t("tr.col.page"), t("tr.kpi.landings"), t("tr.kpi.pageViews")]} rows={data.pages.map((p) => [p.path, f.num(p.landings), f.num(p.pageViews)])} />
            </>
          ) : <p className="dc-empty">{t("tr.noData")}</p>}
        </div>
        <div className="dc-panel">
          <h3 className="dc-panel-title">{t("tr.referrersTitle")}</h3>
          <p className="dc-panel-sub">{t("tr.referrersSub")}</p>
          {data.referrers.length ? (
            <BarRows hiddenText={t("dev.hidden")} color={SERIES[2]} rows={data.referrers.map((r) => ({ key: r.host, label: r.host, value: r.landings, display: f.num(r.landings) }))} />
          ) : <p className="dc-empty">{t("tr.noReferrers")}</p>}
        </div>
      </div>

      <div className="dc-panel">
        <h3 className="dc-panel-title">{t("tr.sourcesTitle")}</h3>
        <p className="dc-panel-sub">{t("tr.sourcesSub")}</p>
        <div className="dc-table-wrap">
          <table className="dc-table" data-testid="tr-sources">
            <thead><tr><th scope="col">{t("tr.col.source")}</th><th scope="col">{t("tr.kpi.landings")}</th><th scope="col">{t("tr.col.registrations")}</th><th scope="col">{t("tr.col.conversion")}</th></tr></thead>
            <tbody>
              {data.channels.map((c) => (
                <tr key={c.key} data-channel={c.key}>
                  <td>{t(`dev.at.${c.key}` as MessageKey)}</td>
                  <td>{f.num(c.landings)}</td>
                  <td>{f.count(c.registrations)}</td>
                  <td>{f.pct(c.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FunnelPanel funnel={data.funnel} />

      <ul className="dc-notes" data-testid="tr-notes">
        {notes.map((n) => (
          <li key={n.key} data-note={n.key}><span className="dc-note-badge">{t("tr.noteBadge")}</span><span>{n.text}</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Signup funnel: browser stages from 0032, then registrations and confirmations from account data. */
function FunnelPanel({ funnel }: { funnel: DevTraffic["funnel"] }) {
  const t = useT();
  const f = useFormat();
  return (
    <div className="dc-panel" data-testid="tr-funnel">
      <h3 className="dc-panel-title">{t("tr.funnel.title")}</h3>
      <p className="dc-panel-sub">{t("tr.funnel.sub")}</p>
      {!funnel.collecting ? <p className="dc-empty" data-testid="tr-funnel-off">{t("tr.funnel.notCollecting")}</p> : null}
      <div className="dc-table-wrap">
        <table className="dc-table">
          <thead><tr><th scope="col">{t("tr.funnel.stage")}</th><th scope="col">{t("tr.funnel.count")}</th><th scope="col">{t("tr.funnel.fromPrevious")}</th></tr></thead>
          <tbody>
            {funnel.stages.map((s) => (
              <tr key={s.key} data-stage={s.key}><td>{t(`tr.funnel.${s.key}` as MessageKey)}</td><td>{f.num(s.count)}</td><td>{f.pct(s.fromPrevious)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dc-table-wrap" style={{ marginTop: 16 }}>
        <table className="dc-table">
          <thead><tr><th scope="col">{t("tr.funnel.ctaWhere")}</th><th scope="col">{t("tr.funnel.count")}</th></tr></thead>
          <tbody>
            {funnel.ctaByLocation.map((c) => <tr key={c.location}><td>{t(`tr.funnel.cta.${c.location}` as MessageKey)}</td><td>{f.num(c.count)}</td></tr>)}
            {funnel.templateTries.map((c) => <tr key={`try-${c.spot}`}><td>{t(`tr.funnel.try.${c.spot}` as MessageKey)}</td><td>{f.num(c.count)}</td></tr>)}
          </tbody>
        </table>
      </div>
      {funnel.errorsByCode.length ? (
        <div className="dc-table-wrap" style={{ marginTop: 16 }}>
          <table className="dc-table">
            <thead><tr><th scope="col">{t("tr.funnel.errors")}</th><th scope="col">{t("tr.funnel.count")}</th></tr></thead>
            <tbody>{funnel.errorsByCode.map((e) => <tr key={e.code}><td>{t(`tr.funnel.err.${e.code}` as MessageKey)}</td><td>{f.num(e.count)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      <p className="dc-panel-sub" style={{ marginTop: 12 }}>{t("tr.funnel.note")}</p>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`dc-kpi ${accent ? "is-accent" : ""}`}>
      <p className="dc-kpi-label">{label}</p>
      <p className="dc-kpi-value">{value}</p>
      {hint ? <p className="dc-kpi-hint">{hint}</p> : null}
    </div>
  );
}
