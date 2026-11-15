import { execSync } from "node:child_process";

/**
 * Runs once, before any test worker starts. The git-history scope guards (i18n-3, legal-es, legal-es-deletion)
 * need full history, but CI's actions/checkout is shallow (depth 1). Unshallow here, once, so no guard has to
 * fetch mid-suite (no race between workers) and no guard skips. If the clone is shallow and the fetch fails,
 * the whole run fails with a clear message instead of guards silently passing. Full local clones do nothing here.
 */
export default function setup(): void {
  const git = (args: string) => execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let shallow: string;
  try {
    shallow = git("rev-parse --is-shallow-repository");
  } catch {
    return; // not a git checkout: the guards themselves fail when they run git, they never skip
  }
  if (shallow !== "true") return;
  try {
    git("fetch --unshallow --quiet --no-tags origin");
  } catch (e) {
    throw new Error(`Shallow clone and 'git fetch --unshallow origin' failed; the scope guards need full git history. ${(e as Error).message}`);
  }
  if (git("rev-parse --is-shallow-repository") !== "false") throw new Error("Clone is still shallow after unshallow; scope guards need full git history.");
}
