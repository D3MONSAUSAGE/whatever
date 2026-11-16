"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type OnboardingState, type OnboardingStepId } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/en";
import { COMMON_ZONES, otherZones, zoneLabel } from "@/lib/time-zones";

// I18N-2: copy lives in the dictionary (setup.<step>.title/body/action/altAction).
const LINKS: Partial<Record<OnboardingStepId, { href: string; altHref?: string }>> = {
  screen: { href: "/dashboard/screens/add" },
  media: { href: "/dashboard/media", altHref: "/dashboard/media/menus" },
  playlist: { href: "/dashboard/playlists" },
  publish: { href: "/dashboard/playlists" },
  playing: { href: "/dashboard/analytics" },
};

export function SetupTracker({ fixture, origin }: { fixture?: OnboardingState; origin: string }) {
  const live = useApi<OnboardingState>(fixture ? null : "/api/onboarding", fixture ? undefined : 10_000);
  const [local, setLocal] = useState<OnboardingState | null>(null);
  const state = local ?? fixture ?? live.data;
  useEffect(() => { if (live.data) setLocal(null); }, [live.data]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const t = useT();

  if (!state) return null;

  async function setDismissed(dismissed: boolean) {
    if (fixture) return;
    setBusy(true);
    try {
      setLocal(await api<OnboardingState>("/api/onboarding", { method: "POST", body: JSON.stringify({ dismissed }) }));
      if (dismissed) toast.show(t("setup.hiddenToast"));
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!state.show) {
    if (state.dismissed && !state.finished) {
      return (
        <div className="card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm"><strong>{t("setup.label")}</strong> {t("setup.stepsDone", { done: state.completed, total: state.total })}</p>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDismissed(false)}>{t("setup.resume")}</button>
        </div>
      );
    }
    return null;
  }

  const pct = Math.round((state.completed / state.total) * 100);
  return (
    <section className="card p-4 md:p-5 mb-8" aria-labelledby="setup-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="setup-heading" className="font-semibold text-lg">{t("setup.heading")}</h2>
          <p className="text-sm text-muted mt-0.5">{t("setup.stepsDone", { done: state.completed, total: state.total })} {t("setup.stopAnyTime")}</p>
        </div>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDismissed(true)}>{t("setup.hide")}</button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-paper overflow-hidden" role="progressbar" aria-label={t("setup.progress")} aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.completed}>
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid gap-2 mt-4">
        {state.steps.map((step, index) => {
          const links = LINKS[step.id];
          const k = (part: string) => `setup.${step.id}.${part}` as MessageKey;
          const current = state.nextStep === step.id;
          return (
            <li key={step.id} data-step={step.id} className={`rounded-xl border p-3 flex flex-col gap-3 sm:flex-row sm:items-start ${current ? "border-primary bg-paper" : "border-line"}`}>
              <span className={`size-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${step.done ? "bg-live-strong text-white" : current ? "bg-primary text-white" : "bg-paper text-muted border border-line"}`}>
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{t(k("title"))}</h3>
                  {step.done ? <span className="badge badge-live">{t("setup.done")}</span> : current ? <span className="badge">{t("setup.next")}</span> : null}
                </div>
                <p className="text-sm text-muted mt-1">
                  {step.id === "playing" && step.done
                    ? step.confirmed
                      ? t("setup.playing.confirmed")
                      : t("setup.playing.waiting")
                    : t(k("body"))}
                </p>
                {step.id === "screen" && origin ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="tracker-player-url">
                    <span className="text-muted">{t("setup.tvAddress")}</span>
                    <code className="rounded-lg border border-line bg-paper px-2 py-1 text-base font-semibold text-ink break-all">{origin}/pair</code>
                    <span className="text-muted">{t("setup.samePlayer", { host: origin.replace(/^https?:\/\//, "") })}</span>
                    <button type="button" className="btn btn-quiet" onClick={() => navigator.clipboard?.writeText(`${origin}/pair`).catch(() => {})}>{t("setup.copy")}</button>
                  </p>
                ) : null}
                {current && step.id === "business" ? <BusinessStep disabled={!!fixture} onDone={() => live.reload()} /> : null}
                {current && step.id === "location" ? <LocationStep locationId={state.firstLocationId} disabled={!!fixture} onDone={() => live.reload()} /> : null}
              </div>
              {links && !step.done ? (
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <Link href={links.href} className={`btn ${current ? "btn-primary" : "btn-quiet"}`}>{t(k("action"))}</Link>
                  {links.altHref ? <Link href={links.altHref} className="btn btn-quiet">{t(k("altAction"))}</Link> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BusinessStep({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const me = useApi<{ accountName: string }>(disabled ? null : "/api/me");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  useEffect(() => { if (me.data) setValue(me.data.accountName); }, [me.data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = value.trim();
    if (!name) return setError(t("setup.businessRequired"));
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ accountName: name }) });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-3 grid gap-2 sm:flex sm:items-end" onSubmit={save}>
      <div className="flex-1">
        <label className="form-label" htmlFor="setup-business">{t("setup.businessName")}</label>
        <input id="setup-business" className="field" maxLength={80} autoComplete="organization" placeholder={t("setup.businessPlaceholder")}
          value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy || disabled}>{busy ? t("setup.saving") : t("setup.save")}</button>
      {error ? <p role="alert" className="note-error sm:basis-full">{error}</p> : null}
    </form>
  );
}

function zones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn("timeZone");
  } catch {
    // Older browsers: fall back to UTC only.
  }
  return ["UTC"];
}

function LocationStep({ locationId, disabled, onDone }: { locationId: string | null; disabled: boolean; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(() => t("setup.locationDefault"));
  const [tz, setTz] = useState("UTC");
  const [list, setList] = useState<string[]>(["UTC"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setList(zones());
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); } catch { /* keep UTC */ }
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("setup.locationRequired"));
    setBusy(true);
    try {
      if (locationId) {
        await api(`/api/locations/${locationId}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), timezone: tz }) });
      } else {
        await api("/api/locations", { method: "POST", body: JSON.stringify({ name: name.trim(), timezone: tz }) });
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={save}>
      <div>
        <label className="form-label" htmlFor="setup-location">{t("setup.locationName")}</label>
        <input id="setup-location" className="field" maxLength={60} placeholder={t("setup.locationPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="form-label" htmlFor="setup-timezone">{t("setup.timeZone")}</label>
        <select id="setup-timezone" className="field" value={tz} onChange={(e) => setTz(e.target.value)}>
          <optgroup label={t("setup.zonesCommon")}>
            {COMMON_ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </optgroup>
          <optgroup label={t("setup.zonesAll")}>
            {otherZones(list.includes(tz) ? list : [tz, ...list]).map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
          </optgroup>
        </select>
      </div>
      <button className="btn btn-primary" disabled={busy || disabled}>{busy ? t("setup.saving") : t("setup.saveLocation")}</button>
      {error ? <p role="alert" className="note-error sm:col-span-3">{error}</p> : null}
    </form>
  );
}
