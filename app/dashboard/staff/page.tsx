"use client";
import { useApi } from "@/lib/api";
import { PageHeader, LoadState, Stat } from "@/components/ui";

type Overview = { days: number; generated_at: string; accounts_by_plan: Record<string, number>; events: Record<string, number>;
  screens_during_trial: { accounts: number; avg: number | null; zero: number } };
const EVENTS = ["trial_started", "first_screen_paired", "first_publish", "converted", "plan_changed", "trial_expired", "canceled"];

export default function Staff() {
  const o = useApi<Overview>("/api/admin/overview?days=30");
  if (!o.data) return <LoadState error={o.error} />;
  const d = o.data, started = d.events.trial_started ?? 0;
  const pct = (n: number) => (started ? `${Math.round((n / started) * 100)}%` : "–");
  return (
    <div className="grid gap-6" data-testid="staff-overview">
      <PageHeader title="Staff overview" eyebrow="Staff only" lede={`Aggregate counts, last ${d.days} days. No customer details.`} />
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {Object.entries(d.accounts_by_plan).map(([k, v]) => <Stat key={k} label={`Accounts: ${k}`} value={v} />)}
      </section>
      <section className="card p-5">
        <h2 className="font-semibold mb-3">Funnel (accounts with the event)</h2>
        <table className="w-full text-sm"><tbody>
          {EVENTS.map((k) => <tr key={k} className="border-t border-line"><td className="py-1.5">{k}</td><td className="text-right">{d.events[k] ?? 0}</td><td className="text-right text-muted w-16">{k === "trial_started" ? "" : pct(d.events[k] ?? 0)}</td></tr>)}
        </tbody></table>
        <p className="text-sm text-muted mt-3">Screens during trial: avg {d.screens_during_trial.avg ?? "–"} over {d.screens_during_trial.accounts} ended trials ({d.screens_during_trial.zero} with none).</p>
      </section>
    </div>
  );
}
