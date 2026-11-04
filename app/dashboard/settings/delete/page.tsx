"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { PageHeader, LoadState } from "@/components/ui";
import { getSupabase } from "@/lib/supabase-browser";

type Status = { enabled: boolean; delayDays: number; request: { status: string; scheduled_for: string } | null };

export default function DeleteAccount() {
  const s = useApi<Status>("/api/account/deletion");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(method: "POST" | "DELETE") {
    setBusy(true); setError(null);
    try {
      await api("/api/account/deletion", method === "POST"
        ? { method, body: JSON.stringify({ confirm, password }), headers: { "content-type": "application/json" } }
        : { method });
      setPassword(""); setConfirm("");
      s.reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const data = s.data;
  return (
    <div className="grid gap-6 max-w-xl">
      <PageHeader title="Delete account" lede="Permanently delete your Pekko account and everything in it." />
      {!data ? <LoadState error={s.error} /> : data.request ? (
        <section className="card p-5 grid gap-3" data-testid="deletion-pending">
          <p><strong>Deletion scheduled</strong> for {new Date(data.request.scheduled_for).toLocaleString()}.</p>
          <p className="text-sm text-muted">Until then everything keeps working. Cancel if you changed your mind.</p>
          <button className="btn btn-quiet" disabled={busy} onClick={() => run("DELETE")}>Cancel deletion</button>
          <button className="btn btn-quiet" onClick={() => getSupabase().auth.signOut().then(() => location.assign("/login"))}>Sign out</button>
        </section>
      ) : (
        <form className="card p-5 grid gap-3" onSubmit={(e) => { e.preventDefault(); run("POST"); }}>
          <p className="text-sm">This deletes your screens, uploads, playlists, schedules, locations, alerts and analytics. Deletion happens <strong>{data.delayDays} days</strong> after you confirm; you can cancel until then. It can&apos;t be undone afterwards.</p>
          {!data.enabled ? <p className="note-error" role="note">Self-service deletion isn&apos;t switched on yet. <Link className="underline" href="/support">Contact support</Link> to delete your account.</p> : null}
          <label className="form-label" htmlFor="confirm">Type DELETE to confirm</label>
          <input id="confirm" className="field" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <label className="form-label" htmlFor="pw">Your password</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <p role="alert" className="note-error">{error}</p> : null}
          <button className="btn btn-danger" disabled={busy || !data.enabled || confirm !== "DELETE" || !password}>{busy ? "One moment…" : "Delete my account"}</button>
        </form>
      )}
    </div>
  );
}
