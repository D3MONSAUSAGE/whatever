# Landing page CRO audit (2026-11-18)

Audit and design exploration only. Nothing here changes the production site.

- `CRO_AUDIT.md`: product facts, research with sources, live-site audit, funnel audit, scorecard (59/100), obstacles, recommendations.
- `COMPARISON.md`: Option A vs Option B, projected scores, recommendation, testable hypotheses.
- `ROADMAP.md`: tracking first, then quick wins, medium and higher-effort work.
- `prototypes/option-a.html`, `prototypes/option-b.html`: standalone prototypes. Open them in a browser; they read `prototypes/assets/`. Private previews: A https://claude.ai/artifact/96h3tKCcz3JGm681QGvsXw · B https://claude.ai/artifact/QuySg5xpvjBWuVDnDgeET2
- `evidence/`: live-site screenshots (desktop/mobile) and the Lighthouse mobile summary.
- `prototypes/assets/`: real template boards rendered by Pekko's renderer, and real editor and gallery screenshots from the app's preview harness.

## Refinement (2026-11-19): Option B chosen

- `OPTION_B_PLAN.md`: refinements, compatibility facts, signup findings, prioritised changes, analytics plan, technical plan, risks, change scope.
- `prototypes/b2/index.html`: refined Option B (one responsive page, mobile and desktop). Private preview https://claude.ai/artifact/KjBRAJsdgs2ZPDeCVFdEaN
- `prototypes/b2/signup.html`: proposed signup page with a state switcher. Private preview https://claude.ai/artifact/WAkwjpH4ZoiGbJQhAFYbeR
- `prototypes/b2/build-demo.mjs` + `src/demo-entry.ts`: bundle Pekko's real menu renderer for the live demo (`assets/demo.js`).
- `prototypes/b2/wrap-local.sh`: makes `*.local.html` copies to open from a local web server, e.g. `python3 -m http.server` in that folder.
- Option A (`prototypes/option-a.html`) is kept for future Meta campaigns.
