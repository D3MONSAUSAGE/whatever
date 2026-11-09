/** Customer-facing origin. A Vercel hostname is never returned. */
export function publicAppOrigin(env: NodeJS.ProcessEnv = process.env) {
  const candidates = [env.PUBLIC_APP_URL, env.NEXT_PUBLIC_APP_URL, "https://pekkotv.com"];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
      if (url.protocol !== "https:") continue;
      if (url.hostname.endsWith(".vercel.app")) continue;
      return url.origin;
    } catch {
      /* try the next candidate */
    }
  }
  return "https://pekkotv.com";
}

export function publicUrls(env: NodeJS.ProcessEnv = process.env) {
  const appUrl = publicAppOrigin(env);
  return {
    appUrl,
    pairUrl: `${appUrl}/pair`,
    tvUrl: `${appUrl}/tv`,
  };
}
