"use client";

import { useState } from "react";
import { api, useApi, type DisplayItem, type PlaylistSummary } from "@/lib/api";
import { groupPreviewCopy, groupPublishIds } from "@/lib/now-playing";

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

function names(items: { name: string }[]) {
  return items.length ? items.map((item) => item.name).join(", ") : "None";
}

function GroupPreview({ impact, memberIds }: { impact: Impact; memberIds: string[] }) {
  const copy = groupPreviewCopy(impact, memberIds, false);
  return (
    <div className="grid gap-2 text-sm">
      <p><span className="font-semibold">Affected.</span> {names(copy.affected)}</p>
      {copy.unchanged.length ? <p><span className="font-semibold">Also showing this (unchanged).</span> {names(copy.unchanged)}</p> : null}
      {copy.kept.length ? <p><span className="font-semibold">Kept.</span> {names(copy.kept)}</p> : null}
      <p><span className="font-semibold">Overridden by schedule.</span> {copy.overriddenBySchedule.length ? copy.overriddenBySchedule.map((item) => `${item.name} (${item.scheduleName})`).join(", ") : "None"}</p>
      <p className="text-muted">Replace is not offered here. Screens outside this group keep what they have.</p>
      {copy.othersLeftAlone ? <p>{copy.othersLeftAlone === 1 ? "1 other screen is left alone." : `${copy.othersLeftAlone} other screens are left alone.`}</p> : null}
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

  if (seen !== memberKey) {
    setSeen(memberKey);
    setChosen(Object.fromEntries(members.map((item) => [item.id, true])));
    setPreview(null);
  }

  const selected = groupPublishIds(members.map((item) => item.id), chosen);

  async function run(commit: boolean) {
    if (!playlistId) { setFailed(true); setMessage("Choose a playlist."); return; }
    if (!selected.length) { setFailed(true); setMessage("Choose at least one screen in this group."); return; }
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
        setMessage("Published to the screens you checked. TVs update within about 30 seconds.");
        onChanged();
      } else {
        setPreview(body);
      }
    } catch (err) {
      if (timedOut(err) && commit) {
        setFailed(false);
        setMessage("Still publishing; check the screens in a moment.");
        onChanged();
      } else {
        setFailed(true);
        setMessage(timedOut(err) ? "The preview took too long. Try again." : (err as Error).message);
      }
    } finally {
      setPhase("idle");
    }
  }

  return (
    <form className="card p-4 mb-4 grid gap-3 min-w-0" onSubmit={(event) => { event.preventDefault(); void run(preview ? true : false); }}>
      <h2 className="font-semibold">Publish to this group</h2>
      <p className="text-sm text-muted">Only these screens are included. A screen that is not in the group cannot be selected, and this publish does not take content off anyone else.</p>
      <label className="text-sm">Playlist
        <select className="field mt-1 w-full" aria-label="Playlist for this group" value={playlistId} onChange={(event) => { setPlaylistId(event.target.value); setPreview(null); setMessage(null); }}>
          <option value="">Choose a playlist</option>
          {(playlists.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <ul className="grid gap-2">
        {members.map((display) => (
          <li key={display.id}>
            <label className="flex items-center gap-3 min-h-11">
              <input type="checkbox" className="size-5" checked={chosen[display.id] !== false} aria-label={`Publish to ${display.name}`}
                onChange={(event) => { setChosen({ ...chosen, [display.id]: event.target.checked }); setPreview(null); }} />
              <span className="min-w-0 truncate">{display.name}{display.online ? "" : " · offline"}</span>
            </label>
          </li>
        ))}
      </ul>
      {preview ? <GroupPreview impact={preview} memberIds={members.map((item) => item.id)} /> : null}
      {message ? <p role="status" className={`text-sm ${failed ? "text-danger" : ""}`}>{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn min-h-11" disabled={phase !== "idle"} onClick={() => void run(false)}>{phase === "preview" ? "Checking…" : "Preview"}</button>
        <button type="submit" className="btn btn-primary min-h-11" disabled={phase !== "idle" || !preview}>{phase === "commit" ? "Publishing…" : "Publish to these screens"}</button>
      </div>
    </form>
  );
}
