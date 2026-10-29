"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api";
import { getSupabase } from "@/lib/supabase-browser";
import { IconGear } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { friendlyAuthError, MIN_PASSWORD } from "@/components/auth-frame";

const NAME_MAX = 60;

export default function Settings() {
  const me = useApi<{ email: string; accountName: string }>("/api/me");
  const toast = useToast();
  const confirm = useConfirm();
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
    if (value.length > NAME_MAX) return setNameError(`Keep it to ${NAME_MAX} characters.`);
    setNameBusy(true);
    const { error } = await getSupabase().auth.updateUser({ data: { display_name: value } });
    setNameBusy(false);
    if (error) return setNameError(friendlyAuthError(error.message));
    setSavedName(value);
    setName(value);
    toast.show(value ? "Name saved" : "Name cleared");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (next.length < MIN_PASSWORD) return setPwError(`Use at least ${MIN_PASSWORD} characters.`);
    if (next !== again) return setPwError("The new passwords don't match.");
    if (next === current) return setPwError("Choose a password different from your current one.");
    if (!email) return setPwError("Couldn't read your account email. Reload and try again.");
    setPwBusy(true);
    try {
      // Re-check the current password so an unattended, signed-in device can't change it.
      const check = await getSupabase().auth.signInWithPassword({ email, password: current });
      if (check.error) {
        setPwError(check.error.message.toLowerCase().includes("invalid login") ? "Your current password isn't right." : friendlyAuthError(check.error.message));
        return;
      }
      const { error } = await getSupabase().auth.updateUser({ password: next });
      if (error) return setPwError(friendlyAuthError(error.message));
      setCurrent(""); setNext(""); setAgain("");
      toast.show("Password changed. Other devices are signed out.");
    } finally {
      setPwBusy(false);
    }
  }

  async function signOutEverywhere() {
    const ok = await confirm.ask({
      title: "Sign out of all devices?",
      body: "This signs you out here and on every phone, tablet, and computer. Your TVs keep playing; they don't use your sign-in.",
      confirmLabel: "Sign out everywhere",
      danger: true,
    });
    if (!ok) return;
    setSignOutBusy(true);
    const { error } = await getSupabase().auth.signOut({ scope: "global" });
    setSignOutBusy(false);
    if (error) toast.show(friendlyAuthError(error.message), true);
  }

  return (
    <section className="max-w-2xl">
      <PageHeader title="Settings" eyebrow="Account" icon={<IconGear />} lede="Your sign-in, your name, and the address your TVs open." />

      <div className="grid gap-5">
        <div className="card">
          <h2 className="px-5 pt-5 font-semibold">Account</h2>
          {me.error && !me.data ? (
            <div className="m-5 note-error" role="alert">
              Couldn&apos;t load your account. {me.error}{" "}
              <button type="button" className="underline font-semibold" onClick={() => me.reload()}>Try again</button>
            </div>
          ) : (
            <dl className="divide-y divide-line">
              <Row label="Email">{email ?? me.data?.email ?? <span className="skeleton inline-block h-5 w-48 align-middle" />}</Row>
              <Row label="Business">{me.data ? (me.data.accountName || <span className="text-muted">Not set</span>) : <span className="skeleton inline-block h-5 w-32 align-middle" />}</Row>
              <Row label="TV address"><span className="break-all">{origin}/player</span></Row>
            </dl>
          )}
        </div>

        <form className="card p-5" onSubmit={saveName} aria-labelledby="name-heading">
          <h2 id="name-heading" className="font-semibold">Display name</h2>
          <p className="text-sm text-muted mt-1 mb-3">Shown to you in the dashboard and the Seemple app. Leave blank to use your email.</p>
          <label className="form-label" htmlFor="display-name">Name</label>
          <input id="display-name" className="field" maxLength={NAME_MAX} autoComplete="name" placeholder={email ?? ""}
            value={name} onChange={(e) => setName(e.target.value)} />
          {nameError ? <p role="alert" className="note-error mt-3">{nameError}</p> : null}
          <button className="btn btn-primary mt-3" disabled={nameBusy || name.trim() === savedName}>{nameBusy ? "Saving…" : "Save name"}</button>
        </form>

        <form className="card p-5" onSubmit={changePassword} aria-labelledby="pw-heading">
          <h2 id="pw-heading" className="font-semibold">Change password</h2>
          <p className="text-sm text-muted mt-1 mb-3">At least {MIN_PASSWORD} characters. Changing it signs you out on your other phones and computers; this one stays signed in.</p>
          <div className="grid gap-3">
            <div>
              <label className="form-label" htmlFor="current-password">Current password</label>
              <input id="current-password" className="field" type="password" autoComplete="current-password" required
                value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="new-password">New password</label>
              <input id="new-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required
                value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="again-password">Confirm new password</label>
              <input id="again-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required
                value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
          </div>
          {pwError ? <p role="alert" className="note-error mt-3">{pwError}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? "Saving…" : "Change password"}</button>
            <Link href="/forgot-password" className="text-sm font-semibold text-primary underline underline-offset-4">Forgot your current password?</Link>
          </div>
        </form>

        <div className="card p-5">
          <h2 className="font-semibold">Sign out</h2>
          <p className="text-sm text-muted mt-1 mb-3">Lost a phone or shared a computer? Sign out everywhere. Screens keep playing.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => getSupabase().auth.signOut()}>Sign out</button>
            <button type="button" className="btn btn-quiet text-danger" disabled={signOutBusy} onClick={signOutEverywhere}>
              {signOutBusy ? "Signing out…" : "Sign out of all devices"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">
        <a href="/terms" className="hover:underline">Terms of Service</a> · <a href="/privacy" className="hover:underline">Privacy Policy</a>
      </p>
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
