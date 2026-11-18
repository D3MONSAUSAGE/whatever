# Deployment: GitHub → Vercel → pekkotv.com

## How it works (verified from the repository and GitHub)

- **No deploy workflow in the repo.** `.github/workflows/ci.yml` only runs lint, typecheck, tests and a build. Deployments come from Vercel's GitHub integration on the `pantalla` project (team `teamtegrate`): every push builds a deployment and Vercel reports it as the `Vercel` commit status.
- **`main` is production.** A merge to `main` builds a production deployment and Vercel moves the production domains to it: `pekkotv.com` (and `www.pekkotv.com` → 308 to it) and `pantalla-chi.vercel.app`. PR branches get preview deployments (`pantalla-git-<branch>-teamtegrate.vercel.app`, behind Vercel authentication) and a Vercel bot comment on the PR.
- `vercel.json` sets the region, a cron and function settings. It has no ignored-build step, so every push is built.
- Production pages under `/dashboard` are dynamic (`cache-control: private, no-store`, `x-vercel-cache: MISS`): what a domain serves is whatever deployment it is aliased to, not a CDN copy.

## Release checklist (a task is done only when all of these hold)

1. CI is green on the PR head; merge (squash, `expectedHeadSha`).
2. Wait for the `Vercel` status on the **merge commit** to be `success`.
3. **Verify the live domains, not the status.** Fetch `https://pekkotv.com/<page>` and `https://pantalla-chi.vercel.app/<page>`, download every `/_next/static/**.js` the HTML references, and check for strings that only the new commit contains (and that the previous commit's strings are still there). Both domains must serve the same page chunk hashes. A `success` status alone is not proof: on 2026-11-18 the merge of PR #151 (`57deac3`) reported success while both domains kept serving PR #150's build.
4. Check the feature itself where access allows (signed-out pages, API status codes, flags), and that nothing else regressed.
5. Only then move the working branch to `main` (`git checkout -B <branch> origin/main` + `--force-with-lease`). Don't move it while production is unconfirmed, so a branch build of the same commit can't be mistaken for the production build.

## If production doesn't move

- Compare the merge commit's `Vercel` statuses with the previous release (`gh api repos/<owner>/<repo>/commits/<sha>/statuses`). A normal release shows a pending → success pair for the production build.
- The safe, normal re-trigger is a new commit merged to `main` through a PR. Never force-push `main` or rewrite history.
- What can't be seen from here without Vercel API access: which deployment a domain is aliased to, whether a build was created as Production or Preview, and whether production is pinned after an Instant Rollback. Those are visible in the Vercel dashboard (Deployments, "Current" badge).

## Rollout flags (menu designer)

Set in Vercel → Environment Variables, read at request time by `GET /api/menu-templates`:

- `MENU_TEMPLATES`: template gallery and guided editor.
- `UNIFIED_MENU_EDITOR`: one editor for every board.

Both take: unset (developers only) · a list of emails or account ids · `all` · `off` (kill switch). `LAYOUT_STUDIO=1` is required. A browser can opt out with `?templates=off` / `?unified=off`.
