"use client";
import { api } from "@/lib/api";
import type { OnboardingV2State, RecordableStep } from "@/lib/onboarding";

/** Onboarding v2: note a lightweight step (preview, customize, explore). Fire-and-forget; never shows an error. */
export function recordOnboardingStep(step: RecordableStep): Promise<OnboardingV2State | null> {
  return api<OnboardingV2State>("/api/onboarding?v=2", { method: "POST", body: JSON.stringify({ recordStep: step }) }).catch(() => null);
}
