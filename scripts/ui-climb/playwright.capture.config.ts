// Screenshot capture for the UI hill climb. Runs against a dev server on its own port
// (default 5180), never the owner's 5173. Every test gets a fresh browser context.
//   UI_CLIMB_ROUND=3 npx playwright test -c scripts/ui-climb/playwright.capture.config.ts
import { defineConfig } from "@playwright/test";

const base = process.env.UI_CLIMB_BASE ?? "http://localhost:5180";

export default defineConfig({
  testDir: "capture",
  outputDir: "../../.ui-climb/pw-results",
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
});
