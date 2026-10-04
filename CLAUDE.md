# SmartChiro
This is a project focus on chiropractor patient management system. The main selling point is to able to draw and annotate on digital X-ray and calculate the distance.

## Context Files
Read the following to get the full context of the project:
- @context/project-overview.md
- @context/coding-standard.md
- @context/ai-interaction.md
- @context/current-feature.md
- @context/owner-actions.md (owner's to-do list — remind the user of open items and tick them off when done)

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — run ESLint (flat config, `eslint.config.mjs`)

## Coding Mode
Use the `ponytail` skill (full) for every coding task: YAGNI, reuse existing code, stdlib/native before new deps, shortest working diff.

## Proof & Shipping
These override the ask-before-commit/merge rules in `context/ai-interaction.md`.
- **Always show screenshots as proof.** For any UI or behaviour change, capture a screenshot of it working and show it to the user. Don't claim something works without one.
- **Merge when confident.** If the build, lint and tests pass and you are confident in the change, merge it to `main` straight away without asking.
- **Prove it in production.** After the merge deploys, show proof from production, such as a screenshot of the live page.

## Production Test Login
- **Doctor login on https://smartchiro.org:** `claude-test@claude-test.com` / `claude-test` (Doctor at SmartChiro KLCC). Use it for production screenshots and checks. It is not a super admin, so it can't open `/dashboard/admin`.
- Headless Chromium in Claude's cloud sandbox doesn't trust the proxy's CA on its own: launch it with `--ignore-certificate-errors-spki-list=<SHA-256 SPKI hashes of every cert in /root/.ccr/ca-bundle.crt>`. That trusts the bundle every other tool uses; never turn certificate checks off.

## Blockers
- Always tell the user what you need and what is blocking you (missing access, credentials, keys, decisions) as soon as you hit it, instead of quietly working around it or stopping.


