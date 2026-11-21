// Screenshot capture for the UI hill climb. Runs against a dev server on its own port
// (default 5180 for Woodshed, 5181 for the site and Narrator), never the owner's 5173. Every
// test gets a fresh browser context.
//   UI_CLIMB_ROUND=3 npx playwright test -c scripts/ui-climb/playwright.capture.config.ts
//   UI_CLIMB_PROJECT=site UI_CLIMB_ROUND=0 npx playwright test -c scripts/ui-climb/playwright.capture.config.ts
// UI_CLIMB_PROJECT (woodshed, site or narrator; see projects.mjs) picks the spec folder, the
// work dir the shots land in and the default port. With none it is Woodshed.
import { defineConfig } from "@playwright/test";
import { projectFrom } from "./projects.mjs";

const project = projectFrom();
const base = process.env.UI_CLIMB_BASE ?? `http://localhost:${project.port}`;
const round = process.env.UI_CLIMB_ROUND ?? "0";

export default defineConfig({
  testDir: project.capture,
  // Per round, so a scratch run does not wipe a real round's results mid-run. Woodshed keeps
  // its first path; the site and Narrator share a work dir, so each gets its own folder.
  outputDir:
    project.key === "woodshed"
      ? `../../.ui-climb/pw-results/${round}`
      : `../../${project.work}/pw-results/${project.key}-${round}`,
  timeout: project.key === "woodshed" ? 240_000 : 150_000,
  workers: Number(process.env.UI_CLIMB_WORKERS ?? 4),
  retries: 1,
  reporter: [["line"]],
  use: {
    baseURL: base,
    storageState: { cookies: [], origins: [] },
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        // Narrator plays real audio with the natural voice: keep the capture silent.
        ...(project.key === "woodshed" ? [] : ["--mute-audio"]),
      ],
    },
  },
  // Tablet tests (titles ending "tablet") get a touch context; setViewportSize cannot add touch.
  projects: [
    { name: "pointer", grepInvert: / tablet$/ },
    { name: "touch", grep: / tablet$/, use: { hasTouch: true } },
  ],
});
