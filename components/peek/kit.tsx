"use client";
/**
 * Peek primitives sheet for the screenshot harness (/preview?screen=peek-kit&peek=1), matching board
 * 29-R-States-desktop. Sample data only; nothing here calls an API.
 */
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { IconPlus, IconCopy } from "@/components/icons";
import {
  ActionBar, BottomSheet, CodeInput, EmptyState, ErrorState, Fab, OverflowMenu, Peek, PeekBanner, PeekButton, PeekCard, PeekDialog,
  PeekField, PeekSwitch, PeekToast, SegmentedFilter, Skeleton, SkeletonRegion, StatusPill, TvBezel,
} from "@/components/peek/ui";
import { OfflineBanner } from "@/components/peek/shell-extras";

const BOARD = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect fill='#1c3d32' width='100%' height='100%'/><text x='50%' y='54%' fill='white' font-family='sans-serif' font-size='36' text-anchor='middle'>Lunch menu</text></svg>")}`;

export function PeekKit({ dialog = false, sheet = false }: { dialog?: boolean; sheet?: boolean }) {
  const t = useT();
  const [filter, setFilter] = useState<"all" | "live" | "asleep" | "waiting">("all");
  const [code, setCode] = useState("4839");
  const [on, setOn] = useState(true);
  const [showDialog, setShowDialog] = useState(dialog);
  const [showSheet, setShowSheet] = useState(sheet);
  return (
    <div className="grid gap-6 [&>*]:min-w-0" data-testid="peek-kit">
      <PeekCard>
        <div className="flex flex-wrap items-center gap-4">
          <Peek mood="open" size={56} />
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: "var(--pk-font-display)", fontWeight: 900, fontSize: 28, lineHeight: 1.05 }}>{t("peek.screens.summary", { awake: 4, total: 6 })}</div>
            <div className="text-sm text-muted mt-1">Buttons, pills, filters and fields</div>
          </div>
          <PeekButton variant="accent"><IconPlus />{t("screens.add")}</PeekButton>
        </div>
      </PeekCard>

      <PeekCard>
        <div className="flex flex-wrap gap-3 items-center">
          <PeekButton variant="primary">{t("tpl.publishN")}</PeekButton>
          <PeekButton variant="accent"><IconPlus />{t("screens.add")}</PeekButton>
          <PeekButton variant="tint">Change content</PeekButton>
          <PeekButton variant="line">Save draft</PeekButton>
          <PeekButton variant="quiet">{t("common.cancel")}</PeekButton>
          <PeekButton variant="danger">{t("ed.delete")}</PeekButton>
          <PeekButton variant="danger-line">{t("screens.remove")}</PeekButton>
          <PeekButton variant="primary" disabled>{t("tpl.publishN")}</PeekButton>
          <PeekButton variant="primary" busy busyLabel="Publishing…">{t("tpl.publishN")}</PeekButton>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <StatusPill variant="live">{t("peek.status.live")}</StatusPill>
          <StatusPill variant="asleep">{t("peek.status.asleep")}</StatusPill>
          <StatusPill variant="wait">{t("peek.status.waiting")}</StatusPill>
          <StatusPill variant="neutral">Draft</StatusPill>
          <StatusPill variant="bad">Failed</StatusPill>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <SegmentedFilter label="Filter screens" value={filter} onChange={setFilter} options={[
            { id: "all", label: t("peek.screens.filterAll", { count: 6 }) },
            { id: "live", label: t("peek.screens.filterLive", { count: 4 }) },
            { id: "asleep", label: t("peek.screens.filterAsleep", { count: 1 }) },
            { id: "waiting", label: t("peek.screens.filterWaiting", { count: 1 }) },
          ]} />
          <PeekSwitch checked={on} label="Weekday lunch" onChange={setOn} />
          <OverflowMenu label="More for Front counter" items={[
            { id: "show", label: "Show an image here" },
            { id: "rename", label: "Rename" },
            { id: "remove", label: t("screens.remove"), danger: true },
          ]} />
        </div>
        <div className="grid gap-4 mt-4 md:grid-cols-2">
          <PeekField label="TV name" help="For example, Front counter.">
            {({ id, describedBy }) => <input id={id} className="pk-input" aria-describedby={describedBy} defaultValue="Front counter" />}
          </PeekField>
          <PeekField label="Code on the TV" error="That code isn't valid. Check the 6 digits on the TV.">
            {({ id, describedBy, invalid }) => <CodeInput id={id} label="Code on the TV" value={code} onChange={setCode} invalid={invalid} describedBy={describedBy} />}
          </PeekField>
        </div>
      </PeekCard>

      <div className="grid gap-3">
        <OfflineBanner forceOffline />
        <PeekBanner variant="asleep" peek="asleep" lead={t("peek.screens.fellAsleep", { name: "Bar TV", ago: "25 days ago" })} action={<PeekButton variant="tint" size="compact">{t("peek.screens.reconnect")}</PeekButton>} />
        <PeekBanner variant="warn" lead="Billing needs attention." action={<PeekButton variant="tint" size="compact">{t("billing.title")}</PeekButton>}>Update your payment method.</PeekBanner>
        <PeekBanner variant="err" lead="Couldn't publish.">Check your connection and try again.</PeekBanner>
        <PeekBanner variant="ok" peek="happy" lead="Connected.">Front counter is showing your menu.</PeekBanner>
        <PeekBanner variant="info" peek="open" lead="Connecting…">Keep the TV on.</PeekBanner>
      </div>

      <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <PeekCard><EmptyState title="No screens match" body="Try a different filter." action={<PeekButton variant="tint">{t("screens.add")}</PeekButton>} /></PeekCard>
        <PeekCard><ErrorState message="Couldn't load your screens." retryLabel={t("common.tryAgain")} onRetry={() => undefined} /></PeekCard>
        <PeekCard>
          <SkeletonRegion label={t("common.loading")}>
            <Skeleton style={{ aspectRatio: "16 / 9", width: "100%" }} />
            <Skeleton className="mt-3" style={{ height: 16, width: "60%" }} />
            <Skeleton className="mt-2" style={{ height: 12, width: "40%" }} />
          </SkeletonRegion>
        </PeekCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3 items-start [&>*]:min-w-0">
        <TvBezel src={BOARD} alt="Lunch menu on Front counter" />
        <div className="max-w-[160px]"><TvBezel portrait><span className="text-xs" style={{ color: "#FBF4E8" }}>9:16</span></TvBezel></div>
        <div className="grid gap-3">
          <PeekToast>Saved.</PeekToast>
          <PeekToast error>Couldn&apos;t save. Try again.</PeekToast>
          <div className="flex flex-wrap gap-2">
            <PeekButton variant="line" onClick={() => setShowDialog(true)}>Open dialog</PeekButton>
            <PeekButton variant="line" onClick={() => setShowSheet(true)}><IconCopy />Open sheet</PeekButton>
          </div>
        </div>
      </div>

      <ActionBar help={t("ed2.upToDate")}>
        <PeekButton variant="line">Save draft</PeekButton>
        <PeekButton variant="primary">{t("tpl.publishN")}</PeekButton>
      </ActionBar>
      <Fab label={t("screens.add")} href="/dashboard/screens/add" />

      <PeekDialog open={showDialog} destructive title={t("screens.removeTitle")} onClose={() => setShowDialog(false)} actions={<>
        <PeekButton variant="line" onClick={() => setShowDialog(false)}>{t("common.cancel")}</PeekButton>
        <PeekButton variant="danger" onClick={() => setShowDialog(false)}>{t("screens.remove")}</PeekButton>
      </>}>{t("screens.removeBody", { name: "Bar TV" })}</PeekDialog>
      <BottomSheet open={showSheet} title="Bar TV" onClose={() => setShowSheet(false)}>
        <button type="button" className="pk-menu-item" onClick={() => setShowSheet(false)}>Rename</button>
        <button type="button" className="pk-menu-item is-danger" onClick={() => setShowSheet(false)}>{t("screens.remove")}</button>
      </BottomSheet>
    </div>
  );
}
