# UI hill climb harness

Screenshot-judged UI improvement rounds. Each round captures every flow of an app at
1280x800 and 390x844 in both themes, puts our screens beside the strongest competitor
screens for the same job, and asks judge models (who see screenshots only, unlabelled and
shuffled) to score each candidate from 1 to 10 on a fixed rubric and list concrete flaws.
Implementers fix the top flaws, and the next round measures again.

It has run on Woodshed (`/music`), the personal site and Narrator (`/pdf`). What the site
climb taught about design is in
[src/lib/components/site/AGENTS.md](../../src/lib/components/site/AGENTS.md); Narrator's
rules are in [src/routes/pdf/AGENTS.md](../../src/routes/pdf/AGENTS.md).

## Projects and files

Every script takes `--project woodshed|site|narrator` (or `UI_CLIMB_PROJECT`); with none it
is Woodshed. [projects.mjs](projects.mjs) holds each project's work dir, rubric, scored
dimensions, flows and capture folder.

| Project | Work dir (git-ignored) | Flows | Captures |
| --- | --- | --- | --- |
| woodshed | `.ui-climb/` | `flows.mjs` | `capture/` |
| site | `.ui-climb-site/` | `flows-site.mjs` | `capture-site/` |
| narrator | `.ui-climb-site/` | `flows-narrator.mjs` | `capture-narrator/` |

The work dir holds the rubric, the competitor library (`competitors/flows.json` and its
screens), the shots per round, and per round the plan, briefs, judge verdicts, flaw digests
and bugs list. It is local only: never commit it.

## One round

```sh
export PATH=/opt/homebrew/bin:$HOME/.local/bin:$PATH
P=site N=1   # project and round

# 1. Capture, against a dev server you start on the project's port (5180 Woodshed,
#    5181 site and Narrator; UI_CLIMB_BASE overrides). Never the owner's 5173.
vp dev --port 5181 --strictPort &
UI_CLIMB_PROJECT=$P UI_CLIMB_ROUND=$N ./node_modules/.bin/playwright test -c scripts/ui-climb/playwright.capture.config.ts
node scripts/ui-climb/sheet.mjs --project $P --round $N   # contact sheets for a quick look

# 2. Panels: our screens beside the competitors', one JSON per flow
node scripts/ui-climb/panels.mjs --project $P --round $N

# 3. Judge (astra = GPT via Codex, opus and fable = Claude). Pass panels by flow id:
#    site and Narrator share rounds/<n>/panels/.
node scripts/ui-climb/judge.mjs --project $P --round $N --only opus,astra --jobs 3 \
  .ui-climb-site/rounds/$N/panels/{home,about,studio}.json

# 4. Scores, flaw digests for implementers, and the before and after gallery
node scripts/ui-climb/scoreboard.mjs --project $P
node scripts/ui-climb/report.mjs --project $P
```

## Notes

- zsh doesn't split `$VAR` into words, so list panel files with brace expansion, not a
  variable.
- A closed laptop lid stalls Chromium's audio clock. Launch capture and test browsers with
  `--disable-audio-output` when the lid is closed, or audio states hang.
- The site's sign-in button only renders when the server has sign-in configured. Run a
  second server with placeholder `DATABASE_URL`, `AUTHENTIK_ISSUER` and
  `AUTHENTIK_CLIENT_ID` and point `UI_CLIMB_SIGNIN_BASE` at it for those shots. Never press
  the button.
- Codex has a small quota (about 30 calls a window). When it runs out, `judge.mjs` prints the
  real `ERROR` line; rerun later with `--only astra --skip-done`.
- Captures must not change what the app does. When a capture shows a state the app never
  shows together (two download sizes, a scrolled heading half under the header), fix the
  capture, not the app. Each plan lists the flaws that came from the capture.
- Judges see stills. Never change motion or timing to make a still frame look better: judge
  animation by watching it or measuring per-frame movement.
- Gains shrink fast: on the site and Narrator about +1.2, then +0.2, then +0.1 per round.
  Stop when half the top flaws are owner decisions or owner content, and ask the owner.
