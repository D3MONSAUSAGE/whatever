"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertSettings } from "@/components/alerts";
import { ManageBilling } from "@/components/manage-billing";
import { api, useApi } from "@/lib/api";
import { getSupabase } from "@/lib/supabase-browser";
import { IconGear } from "@/components/icons";
import { PageHeader, useRequiredMessage } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { friendlyAuthError, MIN_PASSWORD } from "@/components/auth-frame";
import { useLocale, useT } from "@/lib/i18n/client";
import { LanguageSelect } from "@/components/i18n/language-select";

const NAME_MAX = 60;

export default function Settings() {
  const me = useApi<{ email: string; accountName: string }>("/api/me");
  const toast = useToast();
  const confirm = useConfirm();
  const { locale, t } = useLocale();
  const requiredMsg = useRequiredMessage();
  const [origin, setOrigin] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");
  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    setOrigin(location.origin);
    getSupabase().auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const value = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
      setSavedName(value);
      setName(value);
    }).catch(() => setEmail(""));
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    const value = name.trim().replace(/\s+/g, " ");
    if (value.length > NAME_MAX) return setNameError(t("settings.nameTooLong", { max: NAME_MAX }));
    setNameBusy(true);
    const { error } = await getSupabase().auth.updateUser({ data: { display_name: value } });
    setNameBusy(false);
    if (error) return setNameError(friendlyAuthError(error.message, t));
    setSavedName(value);
    setName(value);
    toast.show(value ? t("settings.nameSaved") : t("settings.nameCleared"));
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (next.length < MIN_PASSWORD) return setPwError(t("settings.pwShort", { min: MIN_PASSWORD }));
    if (next !== again) return setPwError(t("settings.pwMismatch"));
    if (next === current) return setPwError(t("settings.pwSame"));
    if (!email) return setPwError(t("settings.pwNoEmail"));
    setPwBusy(true);
    try {
      // Re-check the current password so an unattended, signed-in device can't change it.
      const check = await getSupabase().auth.signInWithPassword({ email, password: current });
      if (check.error) {
        setPwError(check.error.message.toLowerCase().includes("invalid login") ? t("settings.pwWrongCurrent") : friendlyAuthError(check.error.message, t));
        return;
      }
      const { error } = await getSupabase().auth.updateUser({ password: next });
      if (error) return setPwError(friendlyAuthError(error.message, t));
      setCurrent(""); setNext(""); setAgain("");
      toast.show(t("settings.pwChanged"));
    } finally {
      setPwBusy(false);
    }
  }

  async function signOutEverywhere() {
    const ok = await confirm.ask({
      title: t("settings.signOutAllTitle"),
      body: t("settings.signOutAllBody"),
      confirmLabel: t("settings.signOutAllConfirm"),
      danger: true,
    });
    if (!ok) return;
    setSignOutBusy(true);
    // Remove this login's phone push tokens while the session is still valid. Never blocks the sign-out.
    await api("/api/session/sign-out", { method: "POST", body: JSON.stringify({ scope: "global" }) }).catch(() => undefined);
    const { error } = await getSupabase().auth.signOut({ scope: "global" });
    setSignOutBusy(false);
    if (error) toast.show(friendlyAuthError(error.message, t), true);
  }

  return (
    <section className="max-w-2xl">
      <PageHeader title={t("settings.title")} eyebrow={t("settings.eyebrow")} icon={<IconGear />} lede={t("settings.lede")} />

      {/* Parity Phase 1 (t353u, W4) order: account, business, language, alerts, security (name, password,
          sign out), plan, help, legal, and Delete account last. Brand Kit lives on the Account hub and in the nav. */}
      <div className="grid gap-5">
        <div className="card">
          <h2 className="px-5 pt-5 font-semibold">{t("settings.account")}</h2>
          {me.error && !me.data ? (
            <div className="m-5 note-error" role="alert">
              {t("settings.loadFailed")} {me.error}{" "}
              <button type="button" className="underline font-semibold" onClick={() => me.reload()}>{t("settings.tryAgain")}</button>
            </div>
          ) : (
            <dl className="divide-y divide-line">
              <Row label={t("settings.email")}>{email ?? me.data?.email ?? <span className="skeleton inline-block h-5 w-48 align-middle" />}</Row>
              <Row label={t("settings.business")}>{me.data ? (me.data.accountName || <span className="text-muted">{t("settings.notSet")}</span>) : <span className="skeleton inline-block h-5 w-32 align-middle" />}</Row>
              {/* Parity Phase 1: one address. /pair and /tv open the same player (next.config.ts). */}
              <Row label={t("settings.tvAddress")}><span className="break-all" data-testid="settings-tv-address">{origin}/tv</span></Row>
            </dl>
          )}
        </div>
        <BusinessForm current={me.data?.accountName ?? null} onSaved={() => me.reload()} />
        {/* Parity Phase 1 (W4): language was only on the Account hub. Saved to the account by AccountLocaleSync. */}
        <div className="card p-5" data-testid="settings-language">
          <h2 className="font-semibold">{t("lang.accountTitle")}</h2>
          <p className="text-sm text-muted mt-1 mb-3">{t("lang.accountBody")}</p>
          <LanguageSelect refresh={false} />
        </div>
        <AlertSettings />
        <form className="card p-5" onSubmit={saveName} aria-labelledby="name-heading">
          <h2 id="name-heading" className="font-semibold">{t("settings.displayName")}</h2>
          <p className="text-sm text-muted mt-1 mb-3">{t("settings.displayNameHelp")}</p>
          <label className="form-label" htmlFor="display-name">{t("settings.name")}</label>
          <input id="display-name" className="field" maxLength={NAME_MAX} autoComplete="name" placeholder={email ?? ""}
            value={name} onChange={(e) => setName(e.target.value)} />
          {nameError ? <p role="alert" className="note-error mt-3">{nameError}</p> : null}
          <button className="btn btn-primary mt-3" disabled={nameBusy || name.trim() === savedName}>{nameBusy ? t("settings.saving") : t("settings.saveName")}</button>
        </form>
        <form className="card p-5" onSubmit={changePassword} aria-labelledby="pw-heading">
          <h2 id="pw-heading" className="font-semibold">{t("settings.changePassword")}</h2>
          <p className="text-sm text-muted mt-1 mb-3">{t("settings.changePasswordHelp", { min: MIN_PASSWORD })}</p>
          <div className="grid gap-3">
            <div>
              <label className="form-label" htmlFor="current-password">{t("settings.currentPassword")}</label>
              <input id="current-password" className="field" type="password" autoComplete="current-password" required {...requiredMsg}
                value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="new-password">{t("settings.newPassword")}</label>
              <input id="new-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required {...requiredMsg}
                value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="again-password">{t("settings.confirmPassword")}</label>
              <input id="again-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required {...requiredMsg}
                value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
          </div>
          {pwError ? <p role="alert" className="note-error mt-3">{pwError}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? t("settings.saving") : t("settings.changePassword")}</button>
            <Link href="/forgot-password" className="text-sm font-semibold text-primary underline underline-offset-4">{t("settings.forgotCurrent")}</Link>
          </div>
        </form>
        <div className="card p-5">
          <h2 className="font-semibold">{t("settings.signOutTitle")}</h2>
          <p className="text-sm text-muted mt-1 mb-3">{t("settings.signOutBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => getSupabase().auth.signOut()}>{t("settings.signOut")}</button>
            <button type="button" className="btn btn-quiet text-danger" disabled={signOutBusy} onClick={signOutEverywhere}>
              {signOutBusy ? t("settings.signingOut") : t("settings.signOutAll")}
            </button>
          </div>
        </div>
        <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard/billing" className="font-semibold" data-testid="billing-link">{t("settings.planBilling")}</Link>
          <ManageBilling className="btn-quiet" />
          {locale !== "en" ? <p className="text-sm text-muted w-full" lang={locale} data-testid="english-only-note">{t("common.englishOnlyNote")}</p> : null}
        </div>
        <Link href="/support" className="card p-5 block font-semibold" data-testid="support-link">{t("settings.help")}</Link>
        <p className="text-xs text-muted px-1" data-testid="settings-legal">
          <a href="/terms" className="hover:underline">{t("settings.terms")}</a> · <a href="/terms#billing" className="hover:underline">{t("settings.billingTerms")}</a> · <a href="/privacy" className="hover:underline">{t("settings.privacy")}</a>
        </p>
        <Link href="/dashboard/settings/delete" className="card p-5 block font-semibold text-danger" data-testid="delete-account-link">{t("settings.deleteLink")}</Link>
      </div>
      {confirm.node}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function BusinessForm({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (current !== null) setValue(current); }, [current]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = value.trim().replace(/\s+/g, " ");
    if (!name) return setError(t("settings.businessRequired"));
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ accountName: name }) });
      toast.show(t("settings.businessSaved"));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card p-5" onSubmit={save} aria-labelledby="business-heading">
      <h2 id="business-heading" className="font-semibold">{t("settings.businessName")}</h2>
      <p className="text-sm text-muted mt-1 mb-3">{t("settings.businessHelp")}</p>
      <label className="form-label" htmlFor="business-name">{t("settings.businessName")}</label>
      <input id="business-name" className="field" maxLength={80} autoComplete="organization"
        value={value} onChange={(e) => setValue(e.target.value)} />
      {error ? <p role="alert" className="note-error mt-3">{error}</p> : null}
      <button className="btn btn-primary mt-3" disabled={busy || current === null || value.trim() === current}>{busy ? t("settings.saving") : t("settings.saveBusiness")}</button>
    </form>
  );
}
