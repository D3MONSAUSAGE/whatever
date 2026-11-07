export const SLIDE_SRC_KEY = "pekko-slide-src";

export type SlideSrcScope = { userId: string; orgId: string };

type Entry = { url: string; exp: number };

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Object path, without the signed query, so a replaced file does not reuse an old URL. */
export function assetPathFromUrl(url: string) {
  try {
    return new URL(url, "https://pekko.local").pathname;
  } catch {
    return url.split("?")[0];
  }
}

export function slideSrcKey(scope: SlideSrcScope, assetPath: string, kind: "full" | "thumb") {
  return `${scope.userId}:${scope.orgId}:${assetPath}:${kind}`;
}

function readAll(): Record<string, Entry> {
  const store = storage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(SLIDE_SRC_KEY) || "{}") as Record<string, Entry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Reuse a signed URL until it is close to expiry. The key is this user, this org,
 * and the asset path, so another account in the same tab cannot read it.
 */
export function rememberSlideSrc(scope: SlideSrcScope, assetPath: string, kind: "full" | "thumb", fresh: string | null) {
  if (!fresh || !scope.userId || !scope.orgId || !assetPath) return fresh;
  const store = storage();
  if (!store) return fresh;
  try {
    const all = readAll();
    const key = slideSrcKey(scope, assetPath, kind);
    const hit = all[key];
    if (hit && hit.exp > Date.now() + 30_000) return hit.url;
    all[key] = { url: fresh, exp: Date.now() + 23 * 60 * 60 * 1000 };
    store.setItem(SLIDE_SRC_KEY, JSON.stringify(all));
  } catch {
    return fresh;
  }
  return fresh;
}

/** Drop every cached signed URL. Called on sign-out and on every auth change. */
export function clearSlideSrcCache() {
  try {
    storage()?.removeItem(SLIDE_SRC_KEY);
  } catch {
    /* private mode */
  }
}

export function onDashboardAuthChange() {
  clearSlideSrcCache();
}
