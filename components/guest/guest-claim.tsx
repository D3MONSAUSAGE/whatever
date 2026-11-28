"use client";
/**
 * /dashboard/claim (signed in, inside the dashboard shell): moves the menu made before sign-up into this account
 * (docs/GUEST_EDITOR_PLAN.md §3.5), then continues what the visitor asked for.
 *
 *  1. Each guest photo is uploaded through the normal POST /api/media (signed in, rate-limited, image checks). Finished
 *     uploads are remembered in the draft, so a retry never uploads the same photo twice.
 *  2. POST /api/guest/claim saves the board as a draft, once per (account, draft id).
 *  3. Only after the server confirms is the browser copy removed. Any failure keeps it and offers "Try again".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase-browser";
import { currentLocale, useT } from "@/lib/i18n/client";
import { clearGuestDraft, getGuestImage, guestIdsIn, loadGuestDraft, saveGuestDraft, swapGuestIds, type GuestAction } from "@/lib/guest-draft";
import { conversion } from "@/lib/conversion-events";

type State = { kind: "working"; text: string } | { kind: "failed"; text: string } | { kind: "blocked" } | { kind: "none" };

const ACTIONS: readonly GuestAction[] = ["save", "display", "share", "download"];

/** Where each action continues once the board is in the account. */
export function resumePath(intent: GuestAction | null, menuId: string): string {
  if (intent === "display") return `/dashboard/screens/add?menu=${menuId}`;
  if (intent === "share" || intent === "download") return `/dashboard/media/menus?board=${menuId}&share=1`;
  return `/dashboard/media/menus?board=${menuId}`;
}

async function token(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export function GuestClaimScreen({ intent: intentParam }: { intent: string | null }) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: "working", text: t("guest.claim.title") });
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const draft = await loadGuestDraft();
      if (!draft) { setState({ kind: "none" }); location.replace("/dashboard"); return; }
      const intent = (ACTIONS as readonly string[]).includes(intentParam ?? "") ? intentParam as GuestAction : draft.intent ?? null;
      const auth = await token();
      if (!auth) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      const headers = { Authorization: `Bearer ${auth}`, "Accept-Language": currentLocale() };

      // 1. Photos
      const ids = guestIdsIn(draft.document);
      const uploaded: Record<string, string> = { ...(draft.uploaded ?? {}) };
      let n = 0;
      for (const id of ids) {
        n++;
        if (uploaded[id]) continue;
        setState({ kind: "working", text: t("guest.claim.photos", { n, total: ids.length }) });
        const img = await getGuestImage(id);
        if (!img) continue; // the photo is gone from this browser: the menu is saved without it
        const form = new FormData();
        const ext = img.type === "image/png" ? "png" : "jpg";
        form.set("file", new File([img.blob], img.name.replace(/\.[^.]+$/, "") + "." + ext, { type: img.type }));
        form.set("name", img.name);
        const res = await fetch("/api/media", { method: "POST", headers, body: form });
        const body = await res.json().catch(() => ({})) as { id?: string; code?: string };
        if (res.status === 403 && body.code === "subscription_inactive") { setState({ kind: "blocked" }); return; }
        if (!res.ok || !body.id) throw new Error("upload");
        uploaded[id] = body.id;
        await saveGuestDraft({ ...draft, uploaded });
      }

      // 2. The board (idempotent)
      setState({ kind: "working", text: t("guest.claim.saving") });
      const document = swapGuestIds(draft.document, uploaded);
      let menuId: string | null = null;
      for (let attempt = 0; attempt < 6 && !menuId; attempt++) {
        const res = await fetch("/api/guest/claim", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json", "X-Pekko-Client-Caps": "orientation" },
          body: JSON.stringify({ draftId: draft.draftId, name: draft.name, document }),
        });
        const body = await res.json().catch(() => ({})) as { menuId?: string; code?: string; pending?: boolean };
        if (res.status === 403 && body.code === "subscription_inactive") { setState({ kind: "blocked" }); return; }
        if (res.status === 409 && body.pending) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        if (!res.ok || !body.menuId) throw new Error("claim");
        menuId = body.menuId;
      }
      if (!menuId) throw new Error("claim");

      // 3. Confirmed: only now remove the browser copy, then continue.
      conversion("guest_draft_migrated", { detail: intent ?? "save" });
      await clearGuestDraft();
      location.replace(resumePath(intent, menuId));
    } catch {
      setState({ kind: "failed", text: t("guest.claim.failed") });
    } finally {
      running.current = false;
    }
  }, [intentParam, t]);

  useEffect(() => { void run(); }, [run]);

  return (
    <div className="mx-auto max-w-lg py-10 px-4 grid gap-4 text-center" data-testid="guest-claim">
      {state.kind === "working" ? (
        <>
          <div className="skeleton h-2 rounded-full" aria-hidden="true" />
          <p role="status" data-testid="guest-claim-status">{state.text}</p>
        </>
      ) : state.kind === "failed" ? (
        <>
          <p className="note-error" role="alert" data-testid="guest-claim-failed">{state.text}</p>
          <div className="flex justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void run()} data-testid="guest-claim-retry">{t("guest.claim.retry")}</button>
            <Link href="/dashboard" className="btn btn-quiet">{t("guest.claim.later")}</Link>
          </div>
        </>
      ) : state.kind === "blocked" ? (
        <>
          <p className="note-warn" role="alert" data-testid="guest-claim-blocked">{t("guest.claim.blocked")}</p>
          <div className="flex justify-center gap-2">
            <Link href="/dashboard/billing" className="btn btn-primary">{t("guest.claim.billing")}</Link>
            <Link href="/dashboard" className="btn btn-quiet">{t("guest.claim.later")}</Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
