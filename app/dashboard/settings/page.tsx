"use client";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { getSupabase } from "@/lib/supabase-browser";

export default function Settings() {
  const { data, error } = useApi<{ email: string; accountName: string }>("/api/me");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Settings</h1>
      {!data ? <p className="text-muted">{error || "Loading…"}</p> : (
        <dl className="card divide-y divide-line">
          <Row label="Business">{data.accountName}</Row>
          <Row label="Email">{data.email}</Row>
          <Row label="TV address"><span className="break-all">{origin}/player</span></Row>
        </dl>
      )}
      <button className="btn btn-quiet mt-6" onClick={() => getSupabase().auth.signOut()}>Sign out</button>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
