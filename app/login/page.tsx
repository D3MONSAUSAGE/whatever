"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { LogoMark, WaveBackdrop, Wordmark } from "@/components/brand";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    getSupabase().auth.getSession().then(({ data }) => data.session && router.replace("/dashboard")).catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    if (!supabaseConfigured()) {
      setNote({ text: "Supabase is not configured on this deploy.", error: true });
      return;
    }
    setBusy(true);
    const res = mode === "in"
      ? await getSupabase().auth.signInWithPassword({ email, password })
      : await getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/dashboard` } });
    setBusy(false);
    if (res.error) return setNote({ text: res.error.message, error: true });
    if (res.data.session) return router.replace("/dashboard");
    setNote({ text: "Check your email to confirm your account, then sign in." });
    setMode("in");
  }

  return (
    <main className="wave-surface relative min-h-dvh overflow-hidden grid place-items-center px-5 py-12">
      <WaveBackdrop />
      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <LogoMark className="size-16" />
          <div className="mt-4">
            <Wordmark size="lg" align="center" />
          </div>
          <p className="mt-3 text-sm text-muted">making life simpler every day.</p>
        </div>
        <div className="card p-6 md:p-8">
          <h1 className="text-xl font-semibold tracking-tight mb-5">{mode === "in" ? "Sign in" : "Create your account"}</h1>
          {!supabaseConfigured() && (
            <p className="mb-4 text-sm text-danger">This deploy is missing its Supabase URL or publishable key.</p>
          )}
          <form onSubmit={submit} className="space-y-3">
            <input className="field" type="email" autoComplete="email" placeholder="Email" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"}
              placeholder="Password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-primary w-full capitalize" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
          </form>
          {note && <p className={`mt-4 text-sm ${note.error ? "text-danger" : "text-ink"}`}>{note.text}</p>}
          <button type="button" className="mt-6 text-sm font-semibold text-primary underline underline-offset-4"
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setNote(null); }}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
