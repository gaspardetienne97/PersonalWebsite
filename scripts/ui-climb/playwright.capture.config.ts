// Screenshot capture for the UI hill climb. Runs against a dev server on its own port
// (default 5180), never the owner's 5173. Every test gets a fresh browser context.
//   UI_CLIMB_ROUND=3 npx playwright test -c scripts/ui-climb/playwright.capture.config.ts
import { defineConfig } from "@playwright/test";

const base = process.env.UI_CLIMB_BASE ?? "http://localhost:5180";

export default defineConfig({
  testDir: "capture",
  // Per round, so a scratch run does not wipe a real round's results mid-run.
  outputDir: `../../.ui-climb/pw-results/${process.env.UI_CLIMB_ROUND ?? "0"}`,
  timeout: 240_000,
  workers: Number(process.env.UI_CLIMB_WORKERS ?? 4),
  retries: 1,
  reporter: [["line"]],
  use: {
    baseURL: base,
    storageState: { cookies: [], origins: [] },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
    },
  },
  // Tablet tests (titles ending "tablet") get a touch context; setViewportSize cannot add touch.
  projects: [
    { name: "pointer", grepInvert: / tablet$/ },
    { name: "touch", grep: / tablet$/, use: { hasTouch: true } },
  ],
});
