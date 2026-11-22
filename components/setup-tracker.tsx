"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { OnboardingV2State, OnboardingV2Step, PreviewTarget, RecordableStep, V2StepId } from "@/lib/onboarding";
import { isRecordableStep } from "@/lib/onboarding";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/en";

// Onboarding v2 (menu first). Copy lives in the dictionary (setup.v2.<step>.title/body/action).
const NEW_MENU = "/dashboard/media/menus?new=1";
const UPLOAD = "/dashboard/media";
const PAIR = "/dashboard/screens/add#add-screen";

export function previewHref(target: PreviewTarget | null): string {
  if (!target) return UPLOAD;
  return target.kind === "menu_board" ? `/dashboard/media/menus?board=${encodeURIComponent(target.menuId)}` : UPLOAD;
}

function stepHref(id: V2StepId, target: PreviewTarget | null): string {
  switch (id) {
    case "first_menu": return NEW_MENU;
    case "preview_menu": return previewHref(target);
    case "customize_menu": return target?.kind === "menu_board" ? previewHref(target) : NEW_MENU;
    case "screen": return PAIR;
    case "show_on_tv": return target?.kind === "menu_board" ? previewHref(target) : "/dashboard/playlists";
    case "first_update": return target?.kind === "menu_board" ? previewHref(target) : "/dashboard/playlists";
    case "playlists": return "/dashboard/playlists";
    case "schedules": return "/dashboard/schedule";
  }
}

export function SetupTracker({ fixture, origin }: { fixture?: OnboardingV2State; origin: string }) {
  const live = useApi<OnboardingV2State>(fixture ? null : "/api/onboarding?v=2", fixture ? undefined : 10_000);
  const [local, setLocal] = useState<OnboardingV2State | null>(null);
  const [fixtureState, setFixtureState] = useState(fixture);
  const state = local ?? fixtureState ?? live.data;
  useEffect(() => { if (live.data) setLocal(null); }, [live.data]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const t = useT();

  if (!state) return null;

  async function post(body: Record<string, unknown>) {
    return api<OnboardingV2State>("/api/onboarding?v=2", { method: "POST", body: JSON.stringify(body) });
  }

  async function setDismissed(dismissed: boolean) {
    if (fixture) return setFixtureState((s) => s && { ...s, dismissed, show: !dismissed && !s.finished, showFirstSuccess: dismissed ? false : s.showFirstSuccess });
    setBusy(true);
    try {
      setLocal(await post({ dismissed }));
      if (dismissed) toast.show(t("setup.hiddenToast"));
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function closeSuccess() {
    if (fixture) return setFixtureState((s) => s && { ...s, showFirstSuccess: false });
    if (state) setLocal({ ...state, showFirstSuccess: false });
    post({ dismissFirstSuccess: true }).then(setLocal).catch(() => { /* the card stays closed here; it is re-offered only if the save failed */ });
  }

  /** Lightweight steps (preview, customize, optional discovery) are credited when the owner follows the link. */
  function record(step: V2StepId) {
    if (fixture || !isRecordableStep(step)) return;
    post({ recordStep: step as RecordableStep }).then(setLocal).catch(() => {});
  }

  const success = state.showFirstSuccess ? (
    <section className="card p-4 md:p-5 mb-6 border-primary" role="status" aria-labelledby="first-success-heading" data-testid="first-success">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="first-success-heading" className="font-semibold text-lg">{t("setup.v2.success.title")}</h2>
          <p className="text-sm text-muted mt-1">{t("setup.v2.success.body")}</p>
        </div>
        <button type="button" className="btn btn-quiet" onClick={closeSuccess}>{t("setup.v2.success.close")}</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={previewHref(state.previewTarget)} className="btn btn-primary" onClick={() => record("preview_menu")}>{t("setup.v2.success.preview")}</Link>
        <Link href={PAIR} className="btn btn-quiet">{t("setup.v2.success.connect")}</Link>
      </div>
    </section>
  ) : null;

  if (!state.show) {
    if (state.dismissed && !state.finished) {
      return (
        <div className="card p-4 mb-6 flex flex-wrap items-center justify-between gap-3" data-testid="setup-resume">
          <p className="text-sm"><strong>{t("setup.label")}</strong> {t("setup.stepsDone", { done: state.requiredCompleted, total: state.requiredTotal })}</p>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDismissed(false)}>{t("setup.resume")}</button>
        </div>
      );
    }
    return success;
  }

  const required = state.steps.filter((s) => s.required);
  const optional = state.steps.filter((s) => s.optional);
  const firstMenuDone = state.steps.find((s) => s.id === "first_menu")?.done ?? false;
  const pct = Math.round((state.requiredCompleted / state.requiredTotal) * 100);
  const row = (step: OnboardingV2Step, index: number | null) => (
    <StepRow key={step.id} step={step} index={index} current={state.nextStep === step.id} origin={origin}
      locked={(step.id === "preview_menu" || step.id === "customize_menu") && !firstMenuDone}
      href={stepHref(step.id, state.previewTarget)} onFollow={() => record(step.id)} />
  );
  return (
    <>
      {success}
      <section className="card p-4 md:p-5 mb-8" aria-labelledby="setup-heading" data-testid="setup-tracker">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="setup-heading" className="font-semibold text-lg">{t("setup.v2.heading")}</h2>
            <p className="text-sm text-muted mt-0.5">{t("setup.stepsDone", { done: state.requiredCompleted, total: state.requiredTotal })} {t("setup.v2.sub")}</p>
          </div>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDismissed(true)}>{t("setup.hide")}</button>
        </div>
        <div className="mt-3 h-2 rounded-full bg-paper overflow-hidden" role="progressbar" aria-label={t("setup.progress")} aria-valuemin={0} aria-valuemax={state.requiredTotal} aria-valuenow={state.requiredCompleted}>
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ol className="grid gap-2 mt-4">{required.map((step, i) => row(step, i + 1))}</ol>
        <h3 className="text-sm font-semibold text-muted mt-5 mb-2">{t("setup.v2.optionalHeading")}</h3>
        <ul className="grid gap-2">{optional.map((step) => row(step, null))}</ul>
      </section>
    </>
  );
}

function StepRow({ step, index, current, origin, locked, href, onFollow }: {
  step: OnboardingV2Step; index: number | null; current: boolean; origin: string; locked: boolean; href: string; onFollow: () => void;
}) {
  const t = useT();
  const k = (part: string) => `setup.v2.${step.id}.${part}` as MessageKey;
  const Tag = index === null ? "div" : "span";
  return (
    <li data-step={step.id} data-done={step.done ? "1" : "0"} className={`rounded-xl border p-3 flex flex-col gap-3 sm:flex-row sm:items-start ${current ? "border-primary bg-paper" : "border-line"}`}>
      <Tag className={`size-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${step.done ? "bg-live-strong text-white" : current ? "bg-primary text-white" : "bg-paper text-muted border border-line"}`} aria-hidden="true">
        {step.done ? "✓" : index ?? "·"}
      </Tag>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{t(k("title"))}</h3>
          {step.optional ? <span className="badge">{t("setup.v2.optional")}</span> : null}
          {step.done ? <span className="badge badge-live">{t("setup.done")}</span> : current ? <span className="badge">{t("setup.next")}</span> : null}
        </div>
        <p className="text-sm text-muted mt-1">
          {step.id === "show_on_tv" && step.done
            ? step.confirmed ? t("setup.playing.confirmed") : t("setup.playing.waiting")
            : locked && !step.done ? t("setup.v2.needsMenu") : t(k("body"))}
        </p>
        {step.id === "screen" && !step.done && origin ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="tracker-player-url">
            <span className="text-muted">{t("setup.tvAddress")}</span>
            <code className="rounded-lg border border-line bg-paper px-2 py-1 text-base font-semibold text-ink break-all">{origin}/pair</code>
            <span className="text-muted">{t("setup.samePlayer", { host: origin.replace(/^https?:\/\//, "") })}</span>
            <button type="button" className="btn btn-quiet" onClick={() => navigator.clipboard?.writeText(`${origin}/pair`).catch(() => {})}>{t("setup.copy")}</button>
          </p>
        ) : null}
      </div>
      {!step.done && !locked ? (
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Link href={href} className={`btn ${current ? "btn-primary" : "btn-quiet"}`} onClick={onFollow}>{t(k("action"))}</Link>
          {step.id === "first_menu" ? <Link href={UPLOAD} className="btn btn-quiet">{t("setup.v2.first_menu.altAction")}</Link> : null}
        </div>
      ) : null}
    </li>
  );
}
