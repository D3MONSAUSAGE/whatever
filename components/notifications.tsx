"use client";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, timeAgo, useApi, type AlertFeed, type AlertItem } from "@/lib/api";
import { badgeText, dayLabel, groupAlerts, readBatches, type NotificationGroup } from "@/lib/notifications";
import { useLocale } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import { StudioGuardedLink, useStudioRequestLeave } from "@/components/studio-leave";
import { usePeekWeb } from "@/lib/peek-flag";
import { Peek } from "@/components/peek/ui";
import { IconBell, IconCard, IconCheck, IconInfo, IconScreens, IconTvOff, IconX } from "@/components/icons";

/**
 * Notification center (redesign phase 1). It replaces the alert and billing banners that used to sit on top of
 * every dashboard page. Data comes from the same endpoints as before:
 *   - /api/alerts (screen offline / back online), polled every 60 s while the tab is visible;
 *   - /api/entitlements (billing warning and rollout notice), polled every 60 s.
 * Screen alerts keep their read state on the server (alerts.read_at). Billing and rollout notices have no server
 * read state, so only their badge dot is remembered in this browser; they stay listed while they apply.
 */

export const ALERTS_CHANGED = "seemple-alerts-changed";
const FEED = "/api/alerts?limit=50";
const LOCAL_READ_KEY = "pekko_nc_read";

type Entitlements = { warning: { message: string; action: string | null } | null; rollout_notice: string | null };
export type NoticeItem = { key: string; kind: "billing" | "notice"; message: string; href: string | null; read: boolean };
export type NotificationsFixture = { alerts: AlertItem[]; entitlements?: Entitlements };

type Ctx = {
  groups: NotificationGroup[];
  notices: NoticeItem[];
  billing: NoticeItem | null;
  unread: number;
  attention: number;
  loaded: boolean;
  error: string | null;
  markGroup: (group: NotificationGroup) => Promise<void>;
  markNotice: (notice: NoticeItem) => void;
  markAll: () => Promise<void>;
};

const NotificationsContext = createContext<Ctx | null>(null);

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}
function readLocal(): string[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_READ_KEY) || "[]") as string[]; } catch { return []; }
}
function writeLocal(keys: string[]) {
  try { localStorage.setItem(LOCAL_READ_KEY, JSON.stringify(keys.slice(-50))); } catch { /* private window */ }
}

export function NotificationsProvider({ children, preview = false, fixture }: { children: ReactNode; preview?: boolean; fixture?: NotificationsFixture }) {
  const live = !preview && !fixture;
  const feed = useApi<AlertFeed>(live ? FEED : null, 60_000);
  const ent = useApi<Entitlements>(live ? "/api/entitlements" : null, 60_000);
  const { t } = useLocale();
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [localRead, setLocalRead] = useState<string[]>([]);
  const { reload } = feed;

  useEffect(() => { setLocalRead(readLocal()); }, []);
  useEffect(() => {
    const onChange = () => { void reload(); };
    window.addEventListener(ALERTS_CHANGED, onChange);
    return () => window.removeEventListener(ALERTS_CHANGED, onChange);
  }, [reload]);

  const alerts = useMemo(() => {
    const raw = fixture ? fixture.alerts : feed.data?.alerts ?? [];
    return raw.map((a) => (readIds.has(a.id) ? { ...a, read: true } : a));
  }, [fixture, feed.data, readIds]);
  const groups = useMemo(() => groupAlerts(alerts), [alerts]);

  const entData = fixture ? fixture.entitlements ?? null : ent.data;
  const notices = useMemo<NoticeItem[]>(() => {
    const out: NoticeItem[] = [];
    const w = entData?.warning;
    if (w?.message) {
      const key = `billing:${hash(w.message)}`;
      out.push({ key, kind: "billing", message: w.message, href: w.action === "select_screens" ? "/dashboard/billing#screens" : "/dashboard/billing", read: localRead.includes(key) });
    }
    if (entData?.rollout_notice) {
      const key = `notice:${hash(entData.rollout_notice)}`;
      out.push({ key, kind: "notice", message: entData.rollout_notice, href: null, read: localRead.includes(key) });
    }
    return out;
  }, [entData, localRead]);

  const markLocal = useCallback((keys: string[]) => {
    setLocalRead((cur) => {
      const next = [...new Set([...cur, ...keys])];
      writeLocal(next);
      return next;
    });
  }, []);

  const markGroup = useCallback(async (group: NotificationGroup) => {
    if (group.read) return;
    setReadIds((cur) => new Set([...cur, ...group.ids]));
    if (!live) return;
    try {
      for (const ids of readBatches(group.ids)) await api("/api/alerts/read", { method: "POST", body: JSON.stringify({ ids }) });
    } finally {
      window.dispatchEvent(new Event(ALERTS_CHANGED));
    }
  }, [live]);

  const markNotice = useCallback((notice: NoticeItem) => markLocal([notice.key]), [markLocal]);

  const markAll = useCallback(async () => {
    setReadIds((cur) => new Set([...cur, ...alerts.map((a) => a.id)]));
    markLocal(notices.map((n) => n.key));
    if (!live) return;
    try {
      await api("/api/alerts/read", { method: "POST", body: JSON.stringify({ all: true }) });
    } finally {
      window.dispatchEvent(new Event(ALERTS_CHANGED));
    }
  }, [alerts, notices, live, markLocal]);

  const unread = groups.filter((g) => !g.read).length + notices.filter((n) => !n.read).length;
  const billing = notices.find((n) => n.kind === "billing") ?? null;
  const attention = groups.filter((g) => g.attention).length + (billing ? 1 : 0);

  // One polite announcement when new notifications arrive after the first load (not on every poll).
  const [announce, setAnnounce] = useState("");
  const seen = useRef<number | null>(null);
  const loaded = Boolean(fixture) || feed.data !== null;
  useEffect(() => {
    if (!loaded) return;
    if (seen.current !== null && unread > seen.current) {
      const n = unread - seen.current;
      setAnnounce(n === 1 ? t("nc.newOne") : t("nc.newMany", { n }));
    }
    seen.current = unread;
  }, [unread, loaded, t]);

  const value: Ctx = { groups, notices, billing, unread, attention, loaded, error: feed.error, markGroup, markNotice, markAll };
  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <span className="sr-only" role="status" aria-live="polite" data-testid="nc-live">{announce}</span>
    </NotificationsContext.Provider>
  );
}

/** For pages that may render outside the shell (tests, harness): null when there is no provider. */
export function useOptionalNotifications(): Ctx | null {
  return useContext(NotificationsContext);
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications needs NotificationsProvider");
  return ctx;
}

/* ---------------- Text and time ---------------- */

export function minutesText(seconds: number | null): string {
  const m = Math.max(1, Math.round((seconds ?? 0) / 60));
  return m < 120 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
}
function clock(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale === "es" ? "es" : "en-US", { hour: "numeric", minute: "2-digit" });
}
function fullDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === "es" ? "es" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
/** Relative under 24 hours ("12 min ago"), otherwise a short date and time. */
export function stamp(iso: string, locale: string, t: T) {
  const age = Date.now() - new Date(iso).getTime();
  return age < 86_400_000 ? timeAgo(iso, t) : fullDate(iso, locale);
}

export function groupText(g: NotificationGroup, t: T, locale: string): { title: string; body: string; tone: "bad" | "ok" | "info" } {
  if (g.kind === "burst") {
    const still = g.members.filter((m) => !m.resolved).length;
    return {
      title: t("nc.burstTitle", { n: g.count, time: clock(g.offlineSince, locale) }),
      body: still ? t("nc.burstOff", { n: still }) : t("nc.burstBack", { time: g.backAt ? clock(g.backAt, locale) : "" }),
      tone: still ? "bad" : "info",
    };
  }
  if (g.kind === "flap") {
    return {
      title: t("nc.flapTitle", { name: g.screenName, n: g.count }),
      body: g.attention ? t("nc.flapOff", { when: fullDate(g.offlineSince, locale) }) : t("nc.flapBack", { time: g.backAt ? clock(g.backAt, locale) : "" }),
      tone: g.attention ? "bad" : "ok",
    };
  }
  if (g.kind === "recovered") {
    return { title: t("nc.backTitle", { name: g.screenName }), body: t("nc.backText", { dur: minutesText(g.offlineSeconds), time: g.backAt ? clock(g.backAt, locale) : "" }), tone: "ok" };
  }
  return { title: t("nc.offlineTitle", { name: g.screenName }), body: t("nc.offlineText", { when: fullDate(g.offlineSince, locale) }), tone: g.attention ? "bad" : "info" };
}

export function groupHref(g: NotificationGroup): string {
  return g.kind !== "burst" && g.screenId ? `/dashboard/screens/${g.screenId}` : "/dashboard/screens";
}

/* ---------------- Rows ---------------- */

export function GroupRow({ group, onOpen }: { group: NotificationGroup; onOpen: (g: NotificationGroup) => void }) {
  const { t, locale } = useLocale();
  const text = groupText(group, t, locale);
  const peek = usePeekWeb();
  const icon = group.kind === "burst" ? <IconScreens />
    : peek ? <Peek mood={text.tone === "ok" ? "happy" : "asleep"} size={28} />
    : text.tone === "ok" ? <IconCheck /> : <IconTvOff />;
  return (
    <li>
      <button type="button" className={`nc-row${group.read ? " is-read" : ""}`} data-testid="nc-row" data-kind={group.kind} onClick={() => onOpen(group)}>
        <span className={`nc-icon nc-${text.tone}${peek && group.kind !== "burst" ? " nc-peek" : ""}`}>{icon}</span>
        <span className="min-w-0">
          <span className="nc-row-title">{text.title}</span>
          <span className="nc-row-body">{text.body}</span>
          {group.kind === "burst" ? (
            <span className="nc-members">
              {group.members.map((m) => (
                <span key={m.key}>{m.screenName} · {m.resolved && m.backAt ? t("nc.memberBack", { time: clock(m.backAt, locale) }) : t("nc.memberOff")}</span>
              ))}
            </span>
          ) : null}
          <time className="nc-time" dateTime={group.at} title={fullDate(group.at, locale)}>
            {stamp(group.at, locale, t)}{group.ids.length > 1 ? ` · ${t("nc.grouped", { n: group.ids.length })}` : ""}
          </time>
        </span>
        <span className="nc-dot" aria-hidden="true" />
        {group.read ? null : <span className="sr-only">{t("nc.unreadSr")}</span>}
      </button>
    </li>
  );
}

export function NoticeRow({ notice, onOpen }: { notice: NoticeItem; onOpen: (n: NoticeItem) => void }) {
  const { t } = useLocale();
  return (
    <li>
      <button type="button" className={`nc-row${notice.read ? " is-read" : ""}`} data-testid="nc-row" data-kind={notice.kind} onClick={() => onOpen(notice)}>
        <span className={`nc-icon ${notice.kind === "billing" ? "nc-warn" : "nc-info"}`}>{notice.kind === "billing" ? <IconCard /> : <IconInfo />}</span>
        <span className="min-w-0">
          <span className="nc-row-title">{notice.kind === "billing" ? t("nc.billingTitle") : t("nc.noticeTitle")}</span>
          <span className="nc-row-body">{notice.message}</span>
        </span>
        <span className="nc-dot" aria-hidden="true" />
        {notice.read ? null : <span className="sr-only">{t("nc.unreadSr")}</span>}
      </button>
    </li>
  );
}

/** Day headings for "All" lists (panel and history). */
export function groupByDay<T extends { at: string }>(items: T[], locale: string, t: (k: "nc.today" | "nc.yesterday") => string): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  const now = new Date();
  for (const item of items) {
    const label = dayLabel(item.at, now, locale, { today: t("nc.today"), yesterday: t("nc.yesterday") });
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}

/** "All" lists: one list item per day, with its heading and the day's rows in a nested list. */
export function DayGroups({ groups, onOpen }: { groups: NotificationGroup[]; onOpen: (g: NotificationGroup) => void }) {
  const { t, locale } = useLocale();
  return (
    <>
      {groupByDay(groups, locale, t).map((day) => (
        <li key={day.label} className="nc-daygroup">
          <h3 className="nc-day">{day.label}</h3>
          <ul className="nc-sublist">{day.items.map((g) => <GroupRow key={g.key} group={g} onOpen={onOpen} />)}</ul>
        </li>
      ))}
    </>
  );
}

/* ---------------- Bell and panel ---------------- */

function moveFocus(container: HTMLElement | null, dir: 1 | -1) {
  if (!container) return;
  const rows = Array.from(container.querySelectorAll<HTMLButtonElement>(".nc-row"));
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  const next = rows[(i + dir + rows.length) % rows.length] ?? rows[0];
  next?.focus();
}

export function NotificationBell() {
  const nc = useNotifications();
  const { t } = useLocale();
  const router = useRouter();
  const requestLeave = useStudioRequestLeave();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"attention" | "all">("attention");
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const panelId = useId();
  const titleId = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  // G then N opens the panel from anywhere outside a text field.
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) { g = Date.now(); return; }
      if (e.key === "n" && Date.now() - g < 900) { g = 0; setOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => { close(false); requestLeave(() => router.push(href)); };
  const openGroup = (g: NotificationGroup) => { void nc.markGroup(g); go(groupHref(g)); };
  const openNotice = (n: NoticeItem) => { nc.markNotice(n); if (n.href) go(n.href); };

  const attentionGroups = nc.groups.filter((g) => g.attention);
  const showGroups = tab === "attention" ? attentionGroups : nc.groups.slice(0, 20);
  const showNotices = tab === "attention" ? nc.notices.filter((n) => n.kind === "billing") : nc.notices;
  const badge = badgeText(nc.unread);

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="ps-icon-btn"
        data-testid="nc-bell"
        aria-label={nc.unread ? t("nc.bellUnread", { n: nc.unread }) : t("nc.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <IconBell />
        {badge ? <span className="ps-badge" aria-hidden="true" data-testid="nc-badge">{badge}</span> : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="nc-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-testid="nc-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); close(); }
            if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(list.current, 1); }
            if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(list.current, -1); }
          }}
        >
          <div className="nc-head">
            <h2 id={titleId} ref={heading} tabIndex={-1}>{t("nc.title")}</h2>
            <span className="flex items-center gap-1">
              <button type="button" className="ps-link" disabled={!nc.unread} onClick={() => { void nc.markAll(); }}>{t("alerts.markAll")}</button>
              <button type="button" className="ps-icon-btn md:hidden" aria-label={t("shell.close")} onClick={() => close()}><IconX /></button>
            </span>
          </div>
          <div className="nc-tabs" role="tablist" aria-label={t("nc.filterAria")}>
            <button type="button" role="tab" aria-selected={tab === "attention"} onClick={() => setTab("attention")}>{t("nc.attentionN", { n: nc.attention })}</button>
            <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>{t("nc.all")}</button>
          </div>
          <ul className="nc-list" ref={list}>
            {showNotices.map((n) => <NoticeRow key={n.key} notice={n} onOpen={openNotice} />)}
            {tab === "all"
              ? <DayGroups groups={showGroups} onOpen={openGroup} />
              : showGroups.map((g) => <GroupRow key={g.key} group={g} onOpen={openGroup} />)}
            {!showGroups.length && !showNotices.length ? (
              <li className="nc-empty">{nc.error && !nc.loaded ? t("nc.loadError") : tab === "attention" ? t("nc.empty") : t("nc.emptyAll")}</li>
            ) : null}
          </ul>
          <div className="nc-foot">
            <StudioGuardedLink href="/dashboard/notifications" className="ps-link" onClick={() => close(false)}>{t("nc.viewAll")}</StudioGuardedLink>
            <StudioGuardedLink href="/dashboard/settings#alerts" className="ps-link" onClick={() => close(false)}>{t("nc.settings")}</StudioGuardedLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Small top-bar chip while billing needs action. It replaces the full-width billing banner. */
export function BillingChip() {
  const { billing } = useNotifications();
  const { t } = useLocale();
  if (!billing) return null;
  return (
    <StudioGuardedLink href={billing.href ?? "/dashboard/billing"} className="ps-chip" data-testid="billing-chip" title={billing.message}>
      <IconCard />
      <span className="hidden sm:inline">{t("shell.billingChip")}</span>
      <span className="sm:hidden">{t("shell.billingChipShort")}</span>
    </StudioGuardedLink>
  );
}
