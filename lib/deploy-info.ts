/**
 * Short id of the commit this deployment was built from (Vercel system variable), so a release can be verified on
 * the live domain even when it only changes server code. Null outside Vercel. A commit id reveals no account data.
 */
export function deployedCommit(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
}
