"use client";
/** Peek shell additions (approved changes #3 and #18). Display only; both read state the app already has. */
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import type { OnboardingV2State } from "@/lib/onboarding";
import { useT } from "@/lib/i18n/client";
import { StudioGuardedLink } from "@/components/studio-leave";
import { PeekBanner } from "@/components/peek/ui";

/** Whether the sidebar setup card shows: same setup v2 state and visibility rule as the Overview checklist. */
export function setupCardVisible(state: Pick<OnboardingV2State, "show" | "finished"> | null | undefined): boolean {
  return Boolean(state && state.show && !state.finished);
}

/** "Setup: N of 8 done" + progress + "Continue setup" (links to the existing Overview checklist). */
export function SetupProgressCard({ fixture }: { fixture?: Pick<OnboardingV2State, "show" | "finished" | "completed" | "total"> | null }) {
  const t = useT();
  const live = useApi<OnboardingV2State>(fixture === undefined ? "/api/onboarding?v=2" : null);
  const state = fixture === undefined ? live.data : fixture;
  if (!state || !setupCardVisible(state)) return null;
  const pct = state.total ? Math.round((state.completed / state.total) * 100) : 0;
  return (
    <div className="pk-setup-card" data-testid="peek-setup-card">
      <div className="pk-setup-title">{t("peek.shell.setupProgress", { done: state.completed, total: state.total })}</div>
      <div className="pk-progress" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.completed} aria-label={t("peek.shell.setupProgress", { done: state.completed, total: state.total })}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <StudioGuardedLink href="/dashboard">{t("peek.shell.continueSetup")}</StudioGuardedLink>
    </div>
  );
}

/** "You're offline…" from navigator.onLine; hides on reconnect. Nothing is queued offline. */
export function OfflineBanner({ forceOffline = false }: { forceOffline?: boolean }) {
  const t = useT();
  const [offline, setOffline] = useState(forceOffline);
  useEffect(() => {
    if (forceOffline) return;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [forceOffline]);
  if (!offline) return null;
  return <div className="pk-offline" data-testid="peek-offline"><PeekBanner variant="info" peek="asleep" role="status">{t("peek.shell.offline")}</PeekBanner></div>;
}
