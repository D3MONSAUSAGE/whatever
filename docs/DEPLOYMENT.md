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
   For server-only changes, `https://pekkotv.com/api/health` returns `commit` (the short id the live deployment was built from); it must equal the merge commit.
4. Check the feature itself where access allows (signed-out pages, API status codes, flags), and that nothing else regressed.
5. Only then move the working branch to `main` (`git checkout -B <branch> origin/main` + `--force-with-lease`). **Never push the working branch to the merge commit before production is verified** (see the incident below).

## Incident 2026-11-18: PR #151 reported "deployed" but never reached production

Evidence (GitHub statuses, local reflog, live chunks):

| Merge | Merged | Branch pushed to same commit | Vercel deployments started |
| --- | --- | --- | --- |
| PR #150 `b269f2e` | 05:52:49 | 05:52:55 | 05:52:52 (main, +3 s) and 05:52:59 (branch, +3 s): two |
| PR #151 `57deac3` | 16:54:35 | 16:54:44 | 16:54:49 only (+4 s after the branch push): **one** |
| PR #152 `4f948bd` | 18:50:5x | not pushed | 18:51:02: one; live on both domains about 90 s later |

- For `57deac3` no build started for the `main` push. The only build started right after the working branch was pushed to the same commit, so it was that branch's preview. Vercel posts its status per commit, so the preview's "success" appeared on the `main` commit.
- Both production domains kept serving PR #150's chunks (`page-60503b0c…`), with dynamic, uncached responses. So it wasn't a stale cache, and it wasn't a pinned rollback: the next merge was promoted automatically.
- Fix: a new normal merge to `main` (PR #152), with the working branch left untouched until production was verified.
- Why Vercel didn't start the `main` build isn't visible from GitHub. Earlier merges with the same branch routine deployed fine. The rule in step 5 removes the condition entirely.

## If production doesn't move

- Compare the merge commit's `Vercel` statuses with the previous release (`gh api repos/<owner>/<repo>/commits/<sha>/statuses`). A normal release shows a pending → success pair for the production build.
- The safe, normal re-trigger is a new commit merged to `main` through a PR. Never force-push `main` or rewrite history.
- What can't be seen from here without Vercel API access: which deployment a domain is aliased to, whether a build was created as Production or Preview, and whether production is pinned after an Instant Rollback. Those are visible in the Vercel dashboard (Deployments, "Current" badge).

## Rollout flags (menu designer)

Set in Vercel → Environment Variables, read at request time by `GET /api/menu-templates`:

- `MENU_TEMPLATES`: template gallery and guided editor.
- `UNIFIED_MENU_EDITOR`: one editor for every board.

Both take: unset (released to everyone) · `developers` (developer accounts only) · a list of emails or account ids · `all` · `off` (kill switch). Since 2026-11-18 both are released: code default "unset = everyone". `LAYOUT_STUDIO=1` is required. A browser can opt out with `?templates=off` / `?unified=off`.
