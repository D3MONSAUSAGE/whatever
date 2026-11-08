"use client";
import { BillingDisclosure } from "@/components/billing-disclosure";
import { PLANS } from "@/lib/plans";
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
  const canBuy = !!checkout.data?.available;
  const [buying, setBuying] = useState<string | null>(null);

  async function buy(plan: string) {
    setBuying(plan);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      window.location.assign(r.url);
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
          <h2 id="plan-heading" className="text-lg font-semibold">{e.plan_name}</h2>
          <p>Screens on: <strong>{e.active_screens}</strong> of <strong>{allowed}</strong> included.</p>
          {e.trial && e.state === "trial" && (
            <p data-testid="trial-countdown">{e.trial.days_left} day{e.trial.days_left === 1 ? "" : "s"} left in your free trial (ends {local(e.trial.ends_at)}).</p>
          )}
          {e.suspend_at && <p>Screens keep playing until {local(e.suspend_at)}.</p>}
          {e.warning && <p className="font-medium" role="status" data-testid="plan-warning">{e.warning.message}</p>}
        </section>
      )}

      <section className="card p-5" aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="text-lg font-semibold mb-3">Plans</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <li key={p.id} className={`rounded-xl border p-4 ${e?.plan === p.id ? "border-primary" : "border-line"}`}>
              <div className="font-semibold">{p.name}</div>
              <div className="text-2xl font-bold">${p.price}<span className="text-sm font-normal text-muted">/month</span></div>
              <div className="text-muted">{p.screens} screen{p.screens === 1 ? "" : "s"}</div>
              {canBuy ? (
                <button className="btn btn-primary mt-3 w-full" data-testid={`buy-${p.id}`} disabled={!!buying || e?.plan === p.id} onClick={() => buy(p.id)}>
                  {e?.plan === p.id ? "Current plan" : buying === p.id ? "Opening checkout…" : `Choose ${p.name}`}
                </button>
              ) : (
                <button className="btn btn-quiet mt-3 w-full" data-testid={`buy-${p.id}`} disabled>Coming soon</button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-muted mt-3 text-sm" data-testid="checkout-note">{canBuy
          ? "You'll finish payment on Stripe's secure checkout. Nothing is charged until you confirm there."
          : "Online checkout is coming soon. Your free trial includes 5 screens and every feature, with no card needed."}</p>
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
