"use client";
import type { DisplayItem } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { peekScreenStatus, type PeekScreenStatus } from "@/lib/peek-screens";
import { StatusPill, type PillVariant } from "@/components/peek/ui";

const PILL: Record<PeekScreenStatus, PillVariant> = { live: "live", asleep: "asleep", waiting: "wait" };
const KEY = { live: "peek.status.live", asleep: "peek.status.asleep", waiting: "peek.status.waiting" } as const;

/** Approved change 1: Live / Asleep / Waiting to pair labels on the same online check. */
export function PeekScreenPill({ display, title }: { display: Pick<DisplayItem, "connected" | "online">; title?: string }) {
  const t = useT();
  const status = peekScreenStatus(display);
  return <span title={title} className="contents"><StatusPill variant={PILL[status]}>{t(KEY[status])}</StatusPill></span>;
}
