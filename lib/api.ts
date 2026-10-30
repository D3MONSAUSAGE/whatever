"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase-browser";

export type MediaUse = { id: string; name: string };

export type MediaItem = {
  id: string; fileName: string; sizeBytes: number; createdAt: string; url: string | null;
  kind?: "image" | "video"; durationMs?: number | null; width?: number | null; height?: number | null;
  thumbnailUrl?: string | null;
  usedIn?: MediaUse[];
};
export type DisplayItem = {
  id: string; name: string; connected: boolean; online: boolean; lastSeenAt: string | null;
  media: { id: string; fileName: string; url: string | null } | null;
  playlist: { id: string; name: string; url: string | null } | null;
  playerError?: string | null;
  location?: { id: string; name: string; timezone: string } | null;
  activeSchedules?: ScheduleSummary[];
  currentSchedule?: (ScheduleSummary & { until: string | null }) | null;
};

export type ScheduleSummary = { id: string; name: string; playlistId: string; playlistName: string; target: "display" | "group"; priority: number };

export type LocationItem = { id: string; name: string; timezone: string; displayCount: number };

export type ScreenGroupItem = { id: string; name: string; displayIds: string[]; updatedAt: string };

export type ScheduleItem = {
  id: string; name: string; playlistId: string; playlistName: string;
  displayId: string | null; displayName: string | null; groupId: string | null; groupName: string | null;
  weekdays: number[]; startTime: string; endTime: string;
  startsOn: string | null; endsOn: string | null; priority: number; enabled: boolean; updatedAt: string;
};

export type SchedulePreview = {
  displayId: string; timezone: string; from: string; until: string; resolution: string;
  defaultAssignment: { playlistId: string | null; playlistName: string | null; mediaId: string | null; mediaName: string | null };
  segments: {
    start: string; end: string; date: string; source: "schedule" | "default";
    scheduleId: string | null; scheduleName: string | null;
    playlistId: string | null; playlistName: string | null;
    target: "display" | "group" | null; priority: number | null;
  }[];
};

export type PlaylistSummary = {
  id: string; name: string; defaultDurationMs: number; transition: "none" | "fade";
  slideCount: number; displayCount: number; publishedAt: string | null; updatedAt: string; revision: number;
  displayNames?: string[];
  thumbnailUrl?: string | null;
};

export type PlaylistDetail = {
  id: string; name: string; defaultDurationMs: number; transition: "none" | "fade";
  publishedAt: string | null; publishedTransition: "none" | "fade" | null; revision: number; updatedAt: string;
  items: { id: string; mediaId: string; fileName: string; url: string | null; thumbnailUrl?: string | null; kind?: "image" | "video"; mediaDurationMs?: number | null; durationMs: number | null; position: number }[];
  displays: { id: string; name: string; assigned: boolean }[];
};

export async function authToken() {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    window.location.href = "/login";
    throw new Error("Sign in to continue.");
  }
  return token;
}

export function uploadForm(path: string, form: FormData, token: string, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let body: { error?: string } = {};
      try { body = JSON.parse(xhr.responseText) as { error?: string }; } catch { body = {}; }
      if (xhr.status === 401) {
        window.location.href = "/login";
        reject(new Error("Sign in to continue."));
        return;
      }
      if (xhr.status === 413) {
        reject(new Error("That image is too large to upload."));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(body.error || "Something went wrong. Try again."));
        return;
      }
      onProgress(100);
      resolve();
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(form);
  });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await authToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await getSupabase().auth.signOut();
    window.location.href = "/login";
    throw new Error("Sign in to continue.");
  }
  if (res.status === 413) throw new Error("That image is too large to upload.");
  if (!res.ok) throw new Error(body.error || "Something went wrong. Try again.");
  return body as T;
}

/** Fetch a list, optionally refreshing on an interval. A null path skips the request (preview fixtures). */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++request.current;
    try {
      const next = await api<T>(path);
      if (id !== request.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (id !== request.current) return;
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    if (!path) return;
    reload();
    if (!refreshMs) return;
    // Background tabs stop polling (saves server calls); coming back refreshes at once.
    const t = setInterval(() => { if (!document.hidden) reload(); }, refreshMs);
    const onVisible = () => { if (!document.hidden) reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [reload, refreshMs, path]);
  return { data, error, reload };
}

export function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export const formatSize = (b: number) =>
  b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export type OnboardingStepId = "account" | "business" | "location" | "screen" | "media" | "playlist" | "publish" | "playing";
export type OnboardingState = {
  steps: { id: OnboardingStepId; done: boolean; confirmed?: boolean }[];
  completed: number; total: number; nextStep: OnboardingStepId | null;
  dismissed: boolean; finished: boolean; show: boolean; firstLocationId: string | null;
};

export type AnalyticsSummary = {
  screens: { total: number; online: number; offline: number; neverConnected: number };
  uptime: { pct7: number | null; pct30: number | null; coverageFrom: string | null };
  playback: { confirmed: number; unconfirmed: number; nothingAssigned: number };
  playlists: { total: number; published: number; publishes30d: number };
  schedules: { total: number; enabled: number; changes30d: number };
  media: { count: number; images: number; videos: number; bytes: number; inPlaylists: number; unused: number };
  bandwidth: null;
};
export type UptimeScreen = {
  id: string; name: string; online: boolean; lastSeenAt: string | null;
  uptimePct: number | null; onlineSeconds: number; windowSeconds: number;
  daily: { date: string; uptimePct: number | null }[];
};
export type UptimeReport = { days: number; coverageFrom: string | null; screens: UptimeScreen[]; overall: { uptimePct: number | null } };
export type ScreenAnalytics = {
  id: string; name: string; online: boolean; lastSeenAt: string | null;
  uptime7: number | null; uptime30: number | null; coverageFrom: string | null;
  daily: { date: string; uptimePct: number | null }[];
  offline: { startedAt: string; endedAt: string | null; seconds: number }[];
  playback: {
    status: "confirmed" | "unconfirmed" | "nothing";
    confirmed: { version: number; at: string | null } | null;
    expected: { version: number; source: "schedule" | "playlist" | "image" | "none"; name: string | null };
    match: boolean | null;
    history: { version: number; at: string }[];
  };
};
export type ActivityEvent = { at: string; kind: string; subjectId: string | null; subjectName: string | null; detail: Record<string, unknown> };

export type AlertKind = "screen.offline" | "screen.recovered";
export type AlertItem = {
  id: string; kind: AlertKind; screenId: string | null; screenName: string; at: string;
  offlineSince: string; offlineSeconds: number | null; read: boolean; email: string;
};
export type AlertFeed = { alerts: AlertItem[]; unread: number; nextBefore: string | null };
export type AlertPrefs = {
  enabled: boolean; thresholdMinutes: number;
  email: { enabled: boolean; available: boolean; address: string };
  limits: { minMinutes: number; maxMinutes: number };
};
