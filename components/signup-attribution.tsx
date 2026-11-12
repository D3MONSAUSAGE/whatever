"use client";

import { useEffect } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  STORAGE_KEY,
  captureFirstTouch,
  parseStored,
  sanitizeAttribution,
  serializeStored,
  type Attribution,
} from "@/lib/signup-attribution";
import { startAttributionPersist } from "@/lib/signup-attribution-persist";

const SENT_KEY = "pekko_ft_sent";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
}

function writeCookie(value: string) {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function readStored(): Attribution | null {
  try {
    const local = parseStored(localStorage.getItem(STORAGE_KEY));
    if (local) return local;
  } catch {
    /* private mode */
  }
  return parseStored(readCookie(COOKIE_NAME));
}

function writeStored(values: Attribution) {
  const raw = serializeStored(values);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* private mode */
  }
  try {
    writeCookie(raw);
  } catch {
    /* cookie blocked */
  }
}

async function postAttribution(token: string, values: Attribution): Promise<boolean> {
  const body = sanitizeAttribution(values);
  if (!body) return false;
  const res = await fetch("/api/me/attribution", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/** Capture first-touch UTMs on any public landing, and persist them after signup. */
export function SignupAttribution() {
  useEffect(() => {
    const existing = readStored();
    const next = captureFirstTouch(
      window.location.search,
      typeof document !== "undefined" ? document.referrer : "",
      existing,
    );
    if (next && !existing) writeStored(next);
    const values = next ?? existing;
    if (!values || !supabaseConfigured()) return;

    return startAttributionPersist(values, {
      getToken: () =>
        getSupabase()
          .auth.getSession()
          .then(({ data }) => data.session?.access_token ?? null)
          .catch(() => null),
      onAuth: (cb) => {
        const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
          cb(session?.access_token ?? null, event);
        });
        return () => data.subscription.unsubscribe();
      },
      post: postAttribution,
      isSent: () => {
        try {
          return sessionStorage.getItem(SENT_KEY) === "1";
        } catch {
          return false;
        }
      },
      markSent: () => {
        try {
          sessionStorage.setItem(SENT_KEY, "1");
        } catch {
          /* private mode */
        }
      },
      clearSent: () => {
        try {
          sessionStorage.removeItem(SENT_KEY);
        } catch {
          /* private mode */
        }
      },
    });
  }, []);

  return null;
}
