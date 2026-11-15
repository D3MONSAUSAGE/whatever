"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { PageHeader, LoadState } from "@/components/ui";
import { getSupabase } from "@/lib/supabase-browser";
import { useLocale } from "@/lib/i18n/client";

type Status = { enabled: boolean; delayDays: number; request: { status: string; scheduled_for: string } | null };

export default function DeleteAccount() {
  const s = useApi<Status>("/api/account/deletion");
  const { t, locale } = useLocale();
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
      <PageHeader title={t("del.title")} lede={t("del.lede")} />
      {!data ? <LoadState error={s.error} /> : data.request ? (
        <section className="card p-5 grid gap-3" data-testid="deletion-pending">
          <p><strong>{t("del.scheduled")}</strong> {t("del.scheduledFor", { when: new Date(data.request.scheduled_for).toLocaleString(locale === "es" ? "es" : undefined) })}</p>
          <p className="text-sm text-muted">{t("del.untilThen")}</p>
          <button className="btn btn-quiet" disabled={busy} onClick={() => run("DELETE")}>{t("del.cancel")}</button>
          <button className="btn btn-quiet" onClick={() => getSupabase().auth.signOut().then(() => location.assign("/login"))}>{t("del.signOut")}</button>
        </section>
      ) : (
        <form className="card p-5 grid gap-3" onSubmit={(e) => { e.preventDefault(); run("POST"); }}>
          <p className="text-sm">{t("del.what")} {t("del.when")} <strong>{t("del.days", { n: data.delayDays })}</strong> {t("del.afterConfirm")}</p>
          {!data.enabled ? <p className="note-error" role="note">{t("del.notEnabled")} <Link className="underline" href="/support">{t("del.contactSupport")}</Link> {t("del.toDelete")}</p> : null}
          <label className="form-label" htmlFor="confirm">{t("del.typeDelete")}</label>
          <input id="confirm" className="field" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <label className="form-label" htmlFor="pw">{t("del.password")}</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <p role="alert" className="note-error">{error}</p> : null}
          <button className="btn btn-danger" disabled={busy || !data.enabled || confirm !== "DELETE" || !password}>{busy ? t("del.oneMoment") : t("del.submit")}</button>
        </form>
      )}
    </div>
  );
}
