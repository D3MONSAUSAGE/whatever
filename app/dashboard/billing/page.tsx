"use client";
import { BillingDisclosure } from "@/components/billing-disclosure";
import { ManageBilling } from "@/components/manage-billing";
import { PLANS } from "@/lib/plans";
import { availabilityOf, checkoutNote, planButton, planChangeMode, planStatus } from "@/lib/billing-view";
import { useEffect, useState } from "react";
import { api, useApi, type DisplayItem } from "@/lib/api";
import { BillingEmailSelfTest } from "@/components/billing-email-selftest";
import { PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";

type Entitlements = {
  state: string; plan: string; plan_name: string; screen_limit: number; active_screens: number; total_screens: number;
  can_add_screen: boolean; playback_allowed: boolean; enforced: boolean;
  trial: { started_at: string; ends_at: string; days_left: number } | null;
  subscription: { status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null;
  suspend_at: string | null;
  warning: { kind: string; message: string; action: string | null } | null;
};

const PLAN_SCREENS: Record<string, number> = { trial: 5, starter: 1, business: 3, multi: 5, grandfathered: 5, comp: 5 };

/** Dates in the viewer's own time zone, with the zone named. */
function local(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export default function Billing() {
  const ent = useApi<Entitlements>("/api/entitlements");
  const screens = useApi<DisplayItem[]>("/api/displays");
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const checkout = useApi<{ available: boolean }>("/api/billing/checkout");
  const selfTest = useApi<{ enabled: boolean }>("/api/billing/notifications/test");
  const [buying, setBuying] = useState<string | null>(null);
  // Neutral until both the plan and the checkout check have answered: never flash "Coming soon".
  const availability = ent.data || ent.error ? availabilityOf(checkout.data, checkout.error) : "loading";
  const mode = planChangeMode(ent.data?.subscription ?? null);

  async function buy(plan: string) {
    setBuying(plan);
    try {
      if (mode === "portal") {
        const p = await api<{ url?: string }>("/api/billing/portal", { method: "POST", body: "{}" });
        if (p.url) { window.location.assign(p.url); return; }
      }
      const r = await api<{ url?: string; updated?: boolean }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      toast.show(r.updated ? "Plan updated. Stripe confirms it in a moment." : "That is already your plan.");
      await ent.reload();
      setBuying(null);
    } catch (err) {
      toast.show((err as Error).message, true);
      setBuying(null);
    }
  }

  useEffect(() => {
    if (screens.data && picked === null) setPicked(new Set(screens.data.filter((d) => d.entitled !== false).map((d) => d.id)));
  }, [screens.data, picked]);

  const e = ent.data;
  const allowed = e ? PLAN_SCREENS[e.plan] ?? 0 : 0;
  const list = screens.data ?? [];
  const over = e ? e.active_screens > allowed : false;

  async function save() {
    if (!picked) return;
    setBusy(true);
    try {
      await api("/api/entitlements/active-screens", { method: "POST", body: JSON.stringify({ displayIds: [...picked] }) });
      toast.show("Saved. Screens you didn't choose are paused; nothing was deleted.");
      await Promise.all([ent.reload(), screens.reload()]);
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Plan & billing" eyebrow="Account" lede="Your plan, trial and which screens are on." />

      {ent.error && <div className="card p-5 text-danger">{ent.error}</div>}
      {e && (
        <section className="card p-5 space-y-2" aria-labelledby="plan-heading" data-testid="plan-status">
          {(() => {
            const st = planStatus({ state: e.state, planName: e.plan_name, subscription: e.subscription });
            return (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="plan-heading" className="text-lg font-semibold">{e.plan_name}</h2>
                  <span data-testid="plan-status-label" className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${st.tone === "ok" ? "bg-live/15 text-live-ink" : st.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-line text-muted"}`}>{st.label}</span>
                </div>
                {st.note && <p className="font-medium" role="status" data-testid="plan-status-note">{st.note}</p>}
              </>
            );
          })()}
          <p>Screens on: <strong>{e.active_screens}</strong> of <strong>{allowed}</strong> included.</p>
          {e.trial && e.state === "trial" && (
            <p data-testid="trial-countdown">{e.trial.days_left} day{e.trial.days_left === 1 ? "" : "s"} left in your free trial (ends {local(e.trial.ends_at)}).</p>
          )}
          {e.suspend_at && <p>Screens keep playing until {local(e.suspend_at)}.</p>}
          {e.warning && <p className="font-medium" role="status" data-testid="plan-warning">{e.warning.message}</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            {e.subscription?.cancel_at_period_end && e.state === "active" && (
              <ManageBilling className="btn-primary" label="Keep my plan" testId="keep-plan" />
            )}
            <ManageBilling className="btn-quiet" />
          </div>
        </section>
      )}

      <section id="plans" className="card p-5" aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="text-lg font-semibold mb-3">Plans</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <li key={p.id} className={`rounded-xl border p-4 ${e?.plan === p.id ? "border-primary" : "border-line"}`}>
              <div className="font-semibold">{p.name}</div>
              <div className="text-2xl font-bold">${p.price}<span className="text-sm font-normal text-muted">/month</span></div>
              <div className="text-muted">{p.screens} screen{p.screens === 1 ? "" : "s"}</div>
              {(() => {
                const b = planButton({ planId: p.id, planName: p.name, currentPlan: e && e.state !== "canceled" && e.state !== "expired" ? e.plan : null, availability, mode, busyPlan: buying });
                return (
                  <button className={`btn ${b.variant === "primary" ? "btn-primary" : "btn-quiet"} mt-3 w-full`} data-testid={`buy-${p.id}`} aria-busy={b.loading || undefined} disabled={b.disabled} onClick={() => buy(p.id)}>
                    {b.label}
                  </button>
                );
              })()}
            </li>
          ))}
        </ul>
        <p className="text-muted mt-3 text-sm min-h-5" data-testid="checkout-note">{checkoutNote(availability, mode)}</p>
        <BillingDisclosure className="mt-4" />
      </section>

      {list.length > 0 && (
        <section id="screens" className="card p-5 space-y-3" aria-labelledby="screens-heading">
          <h2 id="screens-heading" className="text-lg font-semibold">Screens that stay on</h2>
          <p className="text-muted text-sm">
            Your plan includes {allowed} screen{allowed === 1 ? "" : "s"}. Screens you don't choose are paused and show a notice; their content and settings are kept, and you can switch them back on anytime.
            {over && " Until you choose, the most recently active screens stay on."}
          </p>
          <ul className="divide-y divide-line">
            {list.map((d) => (
              <li key={d.id} className="py-2">
                <label className="flex items-center gap-3 min-h-11">
                  <input type="checkbox" className="size-5" checked={!!picked?.has(d.id)}
                    onChange={(ev) => setPicked((prev) => {
                      const next = new Set(prev ?? []);
                      if (ev.target.checked) next.add(d.id); else next.delete(d.id);
                      return next;
                    })} />
                  <span className="flex-1">{d.name}</span>
                  <span className="text-sm text-muted">{d.entitled === false ? "Paused" : "On"}</span>
                </label>
              </li>
            ))}
          </ul>
          {picked && picked.size > allowed && <p className="text-danger text-sm">Choose at most {allowed}.</p>}
          <button className="btn btn-primary w-full sm:w-auto" disabled={busy || !picked || picked.size > allowed} onClick={save}>
            {busy ? "Saving…" : "Save screens"}
          </button>
        </section>
      )}
      <BillingEmailSelfTest enabled={selfTest.data?.enabled === true} />
      {toast.node}
    </div>
  );
}
