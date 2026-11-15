"use client";

import { useState } from "react";
import { api, useApi, type DisplayItem, type PlaylistSummary } from "@/lib/api";
import { groupPreviewCopy, groupPublishIds } from "@/lib/now-playing";
import { publishSavedCopyForTargets } from "@/lib/screen-actions-ui";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";

type Impact = {
  affected: { id: string; name: string }[];
  kept: { id: string; name: string }[];
  willBeCleared: { id: string; name: string }[];
  overriddenBySchedule: { id: string; name: string; scheduleName: string }[];
  offline: { id: string; name: string }[];
};

const PUBLISH_MS = 20_000;

function timedOut(err: unknown) {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

function names(items: { name: string }[], t: T) {
  return items.length ? items.map((item) => item.name).join(", ") : t("gp.none");
}

function GroupPreview({ impact, memberIds }: { impact: Impact; memberIds: string[] }) {
  const t = useT();
  const copy = groupPreviewCopy(impact, memberIds, false, t);
  return (
    <div className="grid gap-2 text-sm">
      <p><span className="font-semibold">{t("gp.affected")}</span> {names(copy.affected, t)}</p>
      {copy.unchanged.length ? <p><span className="font-semibold">{t("gp.unchanged")}</span> {names(copy.unchanged, t)}</p> : null}
      {copy.kept.length ? <p><span className="font-semibold">{t("gp.kept")}</span> {names(copy.kept, t)}</p> : null}
      <p><span className="font-semibold">{t("gp.overridden")}</span> {copy.overriddenBySchedule.length ? copy.overriddenBySchedule.map((item) => `${item.name} (${item.scheduleName})`).join(", ") : t("gp.none")}</p>
      <p className="text-muted">{t("gp.noReplace")}</p>
      {copy.othersLeftAlone ? <p>{copy.othersLeftAlone === 1 ? t("gp.oneLeftAlone") : t("gp.manyLeftAlone", { n: copy.othersLeftAlone })}</p> : null}
    </div>
  );
}

export function GroupPublish({ groupId, members, onChanged }: { groupId: string; members: DisplayItem[]; onChanged: () => void }) {
  const playlists = useApi<PlaylistSummary[]>("/api/playlists");
  const memberKey = members.map((item) => item.id).sort().join();
  const [seen, setSeen] = useState(memberKey);
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => Object.fromEntries(members.map((item) => [item.id, true])));
  const [playlistId, setPlaylistId] = useState("");
  const [preview, setPreview] = useState<Impact | null>(null);
  const [phase, setPhase] = useState<"idle" | "preview" | "commit">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const t = useT();

  if (seen !== memberKey) {
    setSeen(memberKey);
    setChosen(Object.fromEntries(members.map((item) => [item.id, true])));
    setPreview(null);
  }

  const selected = groupPublishIds(members.map((item) => item.id), chosen);

  async function run(commit: boolean) {
    if (!playlistId) { setFailed(true); setMessage(t("disp.choosePlaylist")); return; }
    if (!selected.length) { setFailed(true); setMessage(t("gp.chooseScreen")); return; }
    setPhase(commit ? "commit" : "preview");
    setFailed(false);
    setMessage(null);
    try {
      const body = await api<Impact & { commit: boolean }>("/api/displays/publish", {
        method: "POST",
        signal: AbortSignal.timeout(PUBLISH_MS),
        body: JSON.stringify({ playlistId, displayIds: selected, groupId, commit, replace: false }),
      });
      if (commit) {
        const offlineIds = new Set((body.offline ?? []).map((item) => item.id));
        const targets = members.filter((item) => selected.includes(item.id)).map((item) => ({
          online: item.online && !offlineIds.has(item.id),
          connected: item.connected,
        }));
        setMessage(publishSavedCopyForTargets(targets, t));
        onChanged();
      } else {
        setPreview(body);
      }
    } catch (err) {
      if (timedOut(err) && commit) {
        setFailed(false);
        setMessage(t("disp.stillPublishing"));
        onChanged();
      } else {
        setFailed(true);
        setMessage(timedOut(err) ? t("disp.previewSlow") : (err as Error).message);
      }
    } finally {
      setPhase("idle");
    }
  }

  return (
    <form className="card p-4 mb-4 grid gap-3 min-w-0" onSubmit={(event) => { event.preventDefault(); void run(preview ? true : false); }}>
      <h2 className="font-semibold">{t("gp.title")}</h2>
      <p className="text-sm text-muted">{t("gp.help")}</p>
      <label className="text-sm">{t("disp.playlist")}
        <select className="field mt-1 w-full" aria-label={t("gp.playlistFor")} value={playlistId} onChange={(event) => { setPlaylistId(event.target.value); setPreview(null); setMessage(null); }}>
          <option value="">{t("disp.choosePlaylistOption")}</option>
          {(playlists.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <ul className="grid gap-2">
        {members.map((display) => (
          <li key={display.id}>
            <label className="flex items-center gap-3 min-h-11">
              <input type="checkbox" className="size-5" checked={chosen[display.id] !== false} aria-label={t("gp.publishTo", { name: display.name })}
                onChange={(event) => { setChosen({ ...chosen, [display.id]: event.target.checked }); setPreview(null); }} />
              <span className="min-w-0 truncate">{display.name}{display.online ? "" : t("gp.offlineSuffix")}</span>
            </label>
          </li>
        ))}
      </ul>
      {preview ? <GroupPreview impact={preview} memberIds={members.map((item) => item.id)} /> : null}
      {message ? <p role="status" className={`text-sm ${failed ? "text-danger" : ""}`}>{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn min-h-11" disabled={phase !== "idle"} onClick={() => void run(false)}>{phase === "preview" ? t("disp.checking") : t("gp.preview")}</button>
        <button type="submit" className="btn btn-primary min-h-11" disabled={phase !== "idle" || !preview}>{phase === "commit" ? t("disp.publishing") : t("gp.publish")}</button>
      </div>
    </form>
  );
}
