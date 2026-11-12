// Task metrics for the next pass (taps to the first note, verdict paint, clipping and cover,
// results contradictions). One worker, against a running server (default the 5180 dev server;
// the preview build for verdict paint numbers worth comparing).
//   UI_CLIMB_ROUND=10 npx playwright test -c scripts/ui-climb/metrics/playwright.metrics.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: `../../../.ui-climb/pw-results/metrics-${process.env.UI_CLIMB_ROUND ?? "0"}`,
  timeout: 600_000,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:5180",
    actionTimeout: 15_000,
    storageState: { cookies: [], origins: [] },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
    },
  },
});
