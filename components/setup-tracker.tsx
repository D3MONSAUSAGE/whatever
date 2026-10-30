"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type OnboardingState, type OnboardingStepId } from "@/lib/api";
import { useToast } from "@/components/toast";

const COPY: Record<OnboardingStepId, { title: string; body: string; href?: string; action?: string; altHref?: string; altAction?: string }> = {
  account: { title: "Create your account", body: "You're signed in. Your account is ready." },
  business: { title: "Name your business", body: "The name you and your team will see in Seemple." },
  location: { title: "Add your first location", body: "Where your screens are. The time zone keeps schedules on local time." },
  screen: { title: "Pair a screen", body: "On the TV, open the player address below. Then type the 6-digit code it shows on the Displays page.", href: "/dashboard/displays", action: "Pair a screen" },
  media: { title: "Upload media", body: "Add a photo (JPG, PNG, WebP) or an MP4 video of your menu, offer, or message. No artwork? Type your items and prices into a menu board template.", href: "/dashboard/media", action: "Upload", altHref: "/dashboard/media/menus", altAction: "Make a menu board" },
  playlist: { title: "Create a playlist", body: "Put your images and videos in order and choose how long each one shows.", href: "/dashboard/playlists", action: "Create playlist" },
  publish: { title: "Publish to your screen", body: "Open the playlist, tick your screen, and press Publish. Saving a draft doesn't change the TV.", href: "/dashboard/playlists", action: "Publish" },
  playing: { title: "Check it's playing", body: "Turn the TV on. Within about 30 seconds it shows your content and tells us it's on screen.", href: "/dashboard/analytics", action: "See status" },
};

export function SetupTracker({ fixture, origin }: { fixture?: OnboardingState; origin: string }) {
  const live = useApi<OnboardingState>(fixture ? null : "/api/onboarding", fixture ? undefined : 10_000);
  const [local, setLocal] = useState<OnboardingState | null>(null);
  const state = local ?? fixture ?? live.data;
  useEffect(() => { if (live.data) setLocal(null); }, [live.data]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!state) return null;

  async function setDismissed(dismissed: boolean) {
    if (fixture) return;
    setBusy(true);
    try {
      setLocal(await api<OnboardingState>("/api/onboarding", { method: "POST", body: JSON.stringify({ dismissed }) }));
      if (dismissed) toast.show("Setup hidden. You can resume it from Overview.");
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
          <p className="text-sm"><strong>Setup:</strong> {state.completed} of {state.total} steps done.</p>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDismissed(false)}>Resume setup</button>
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
          <h2 id="setup-heading" className="font-semibold text-lg">Set up your first screen</h2>
          <p className="text-sm text-muted mt-0.5">{state.completed} of {state.total} steps done. You can stop at any time and pick up here later.</p>
        </div>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDismissed(true)}>Hide setup</button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-paper overflow-hidden" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.completed}>
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid gap-2 mt-4">
        {state.steps.map((step, index) => {
          const copy = COPY[step.id];
          const current = state.nextStep === step.id;
          return (
            <li key={step.id} data-step={step.id} className={`rounded-xl border p-3 flex flex-col gap-3 sm:flex-row sm:items-start ${current ? "border-primary bg-paper" : "border-line"}`}>
              <span className={`size-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${step.done ? "bg-live-strong text-white" : current ? "bg-primary text-white" : "bg-paper text-muted border border-line"}`}>
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{copy.title}</h3>
                  {step.done ? <span className="badge badge-live">Done</span> : current ? <span className="badge">Next</span> : null}
                </div>
                <p className="text-sm text-muted mt-1">
                  {step.id === "playing" && step.done
                    ? step.confirmed
                      ? "Your TV confirmed it's showing your content."
                      : "Your screen is online with content published. Waiting for the TV to confirm it's on screen (older player pages can't; reload the TV page to update it)."
                    : copy.body}
                  {step.id === "screen" && origin ? <> TV address: <strong className="break-all text-ink">{origin}/player</strong></> : null}
                </p>
                {current && step.id === "business" ? <BusinessStep disabled={!!fixture} onDone={() => live.reload()} /> : null}
                {current && step.id === "location" ? <LocationStep locationId={state.firstLocationId} disabled={!!fixture} onDone={() => live.reload()} /> : null}
              </div>
              {copy.href && !step.done ? (
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <Link href={copy.href} className={`btn ${current ? "btn-primary" : "btn-quiet"}`}>{copy.action}</Link>
                  {copy.altHref ? <Link href={copy.altHref} className="btn btn-quiet">{copy.altAction}</Link> : null}
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
  useEffect(() => { if (me.data) setValue(me.data.accountName); }, [me.data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = value.trim();
    if (!name) return setError("Enter your business name.");
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
        <label className="form-label" htmlFor="setup-business">Business name</label>
        <input id="setup-business" className="field" maxLength={80} autoComplete="organization" placeholder="e.g. Taqueria Lopez"
          value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy || disabled}>{busy ? "Saving…" : "Save"}</button>
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
  const [name, setName] = useState("Main location");
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
    if (!name.trim()) return setError("Give this location a name.");
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
        <label className="form-label" htmlFor="setup-location">Location name</label>
        <input id="setup-location" className="field" maxLength={60} placeholder="e.g. Downtown store" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="form-label" htmlFor="setup-timezone">Time zone</label>
        <select id="setup-timezone" className="field" value={tz} onChange={(e) => setTz(e.target.value)}>
          {(list.includes(tz) ? list : [tz, ...list]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" disabled={busy || disabled}>{busy ? "Saving…" : "Save location"}</button>
      {error ? <p role="alert" className="note-error sm:col-span-3">{error}</p> : null}
    </form>
  );
}
