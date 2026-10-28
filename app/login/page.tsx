"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    getSupabase().auth.getSession().then(({ data }) => data.session && router.replace("/dashboard"));
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
    <main className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="tv mb-8 grid place-items-center">
          <span className="text-white text-2xl font-semibold tracking-tight">Pantalla</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">{mode === "in" ? "Sign in" : "Create your account"}</h1>
        <p className="text-muted mb-6">Put your menu on any TV.</p>
        {!supabaseConfigured() && (
          <p className="mb-4 text-sm text-danger">This deploy is missing its Supabase URL or publishable key.</p>
        )}
        <form onSubmit={submit} className="space-y-3">
          <input className="field" type="email" autoComplete="email" placeholder="Email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="field" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder="Password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
        </form>
        {note && <p className={`mt-4 text-sm ${note.error ? "text-danger" : "text-ink"}`}>{note.text}</p>}
        <button type="button" className="mt-6 text-sm underline underline-offset-4"
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setNote(null); }}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
