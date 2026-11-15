"use client";
import { useEffect } from "react";
import { timeAgo, type DisplayItem } from "@/lib/api";
import { ONLINE_MS } from "@/lib/server/limits";
import { useT } from "@/lib/i18n/client";
import { makeT, type T } from "@/lib/i18n";

const EN: T = makeT("en");

export const ONLINE_HINT = `A screen is online when its player has sent a heartbeat in the last ${Math.round(ONLINE_MS / 1000)} seconds.`;

/** ONLINE_HINT in the UI language (I18N-2). */
export function onlineHint(t: T = EN) {
  return t("tv.onlineHint", { seconds: Math.round(ONLINE_MS / 1000) });
}

/** File or playlist name as the customer wrote it (never translated); otherwise a status in the UI language. */
export function contentLabel(display: DisplayItem, t: T = EN) {
  if (display.media) return display.media.fileName;
  if (display.playlist) return display.playlist.name;
  if (!display.connected) return t("tv.waitingPairing");
  return t("tv.noContent");
}

/** True when contentLabel is a status, not customer content. */
export function hasNoContent(display: DisplayItem) {
  return !display.media && !display.playlist;
}

/**
 * E5-F2: a screen with no TV (never paired, or just unpaired) never claims a recent heartbeat or
 * playback. The previous TV's last heartbeat is not this screen's status.
 */
export function heartbeatText(display: Pick<DisplayItem, "connected" | "lastSeenAt">, t: T) {
  return display.connected ? heartbeatLabel(display.lastSeenAt, t) : t("screen.noTv");
}

export function heartbeatLabel(iso: string | null, t: T = EN) {
  if (!iso) return t("tv.noHeartbeat");
  return t("tv.lastHeartbeat", { ago: timeAgo(iso, t) });
}

export function Tv({ display, onClick }: { display: DisplayItem; onClick?: () => void }) {
  const t = useT();
  const url = display.media?.url || display.playlist?.url || null;
  return (
    <button type="button" onClick={onClick} disabled={!url || !onClick}
      aria-label={url ? t("tv.previewWhat", { name: display.name }) : undefined}
      className="tv w-full grid place-items-center text-sm text-white/60">
      {url ? <img src={url} alt="" /> : <span className="px-4 text-center">{display.connected ? t("tv.noContent") : t("tv.waitingTv")}</span>}
    </button>
  );
}

export function Status({ display }: { display: DisplayItem }) {
  const t = useT();
  const hint = onlineHint(t);
  if (!display.connected) return <span className="badge">{t("tv.waiting")}</span>;
  if (display.online) {
    return (
      <span className="badge badge-live" title={hint}>
        <span className="size-1.5 rounded-full bg-live" aria-hidden />
        {t("tv.online")}
      </span>
    );
  }
  return (
    <span className="badge badge-danger" title={hint}>
      <span className="size-1.5 rounded-full bg-danger" aria-hidden />
      {t("tv.offline")}{display.lastSeenAt ? ` · ${offlineFor(display.lastSeenAt, t)}` : ""}
    </span>
  );
}

export function ScreenCard({
  display,
  actions,
}: {
  display: DisplayItem;
  actions?: React.ReactNode;
}) {
  const t = useT();
  return (
    <article id={display.id} className="card overflow-hidden scroll-mt-20 flex flex-col">
      <div className="p-3 pb-0">
        <Tv display={display} onClick={() => displayPreview(display)} />
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold truncate">{display.name}</h2>
          <Status display={display} />
        </div>
        <p className="text-sm truncate">{contentLabel(display, t)}</p>
        {display.location ? <p className="text-xs text-muted truncate">{display.location.name} · {display.location.timezone}</p> : null}
        <p className="text-xs text-muted">
          <time dateTime={display.connected ? display.lastSeenAt ?? undefined : undefined}>{heartbeatText(display, t)}</time>
        </p>
        {display.playerError ? <p className="text-sm text-danger" role="alert">{display.playerError}</p> : null}
        {actions ? <div className="mt-auto pt-2 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </article>
  );
}

function displayPreview(display: DisplayItem) {
  const url = display.media?.url || display.playlist?.url;
  if (url) window.open(url, "_blank", "noopener");
}

/** "19 h", "3 min", "2 days": how long since the last heartbeat. */
export function offlineFor(iso: string, t: T = EN) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return t("tv.min", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t("tv.hours", { n: Math.round(s / 3600) });
  const d = Math.round(s / 86400);
  return t(d === 1 ? "tv.day" : "tv.days", { n: d });
}

/** Paired screens that stopped sending heartbeats. Unpaired screens are not counted. */
export function offlineScreens(displays: DisplayItem[]) {
  return displays.filter((d) => d.connected && !d.online);
}

/** Shows which screens are offline, and puts the count in the browser tab title. */
export function OfflineAlert({ displays, linkToDisplays = false }: { displays: DisplayItem[]; linkToDisplays?: boolean }) {
  const t = useT();
  const offline = offlineScreens(displays);
  const titleTag = (n: number) => t("tv.titleOffline", { n });
  useEffect(() => {
    const apply = () => {
      const base = stripOfflineTag(document.title);
      const next = offline.length ? `${titleTag(offline.length)} ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Next.js can set the page title after this effect on first load; re-apply when it does.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => { observer.disconnect(); document.title = stripOfflineTag(document.title); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- titleTag only changes with the language, which re-renders anyway
  }, [offline.length, t]);
  if (offline.length === 0) return null;
  const names = offline.slice(0, 4);
  const snippets = names.map((d) => {
    const dur = d.lastSeenAt ? offlineFor(d.lastSeenAt, t) : t("tv.noHeartbeatYetShort");
    return `${d.name}, ${dur}`;
  });
  const extra = offline.length > names.length ? t("tv.moreCount", { n: offline.length - names.length }) : "";
  const headline = offline.length === 1
    ? t("tv.oneOffline", { detail: snippets[0] })
    : t("tv.manyOffline", { n: offline.length, detail: snippets.join("; "), extra });
  return (
    <details data-testid="offline-alert" className="group note-error mb-3 py-1.5">
      <summary className="flex items-center justify-between gap-3 min-h-10 cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0" role="status">{headline}.</span>
        <span className="text-sm font-medium underline underline-offset-4 shrink-0">
          <span className="group-open:hidden">{t("tv.view")}</span>
          <span className="hidden group-open:inline">{t("tv.hide")}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-1.5 pt-2">
        <ul className="text-sm">
          {names.map((d) => (
            <li key={d.id}>
              <a href={`/dashboard/displays#${d.id}`} className="underline">{d.name}</a>
              {d.lastSeenAt ? t("tv.noHeartbeatFor", { dur: offlineFor(d.lastSeenAt, t) }) : t("tv.neverHeartbeat")}
            </li>
          ))}
          {offline.length > names.length ? <li>{t("tv.andMore", { n: offline.length - names.length })}</li> : null}
        </ul>
        <p className="text-sm text-ink/80">
          {t("tv.checkTv")}
          {linkToDisplays ? <> <a href="/dashboard/displays" className="underline">{t("tv.checkScreens")}</a>.</> : null}
          {" "}{t("tv.refreshes")}
        </p>
      </div>
    </details>
  );
}

/** Removes the "(N offline)" tab-title tag in either language. */
export function stripOfflineTag(title: string) {
  return title.replace(/^\(\d+ (offline|sin conexión)\) /, "");
}
