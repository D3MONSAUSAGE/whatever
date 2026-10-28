"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase-browser";

export type MediaItem = { id: string; fileName: string; sizeBytes: number; createdAt: string; url: string | null };
export type DisplayItem = {
  id: string; name: string; connected: boolean; online: boolean; lastSeenAt: string | null;
  media: { id: string; fileName: string; url: string | null } | null;
};

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    window.location.href = "/login";
    throw new Error("Sign in to continue.");
  }
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

/** Fetch a list, optionally refreshing on an interval. */
export function useApi<T>(path: string, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    reload();
    if (!refreshMs) return;
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [reload, refreshMs]);
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
