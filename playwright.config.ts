import { defineConfig } from "@playwright/test";

// PW_BASE_URL points the suite at an already running server (e.g. a dev server
// on its own port); otherwise it builds and serves the production output.
const external = process.env.PW_BASE_URL;

export default defineConfig({
  webServer: external
    ? undefined
    : {
        command: "vp build && vp preview",
        port: 4173,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
  testDir: "e2e",
  use: {
    baseURL: external ?? "http://localhost:4173",
    // Intro lessons are off for the existing suites; lessons.spec.ts turns them back on.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(external ?? "http://localhost:4173").origin,
          localStorage: [{ name: "woodshed.lessons", value: "off" }],
        },
      ],
    },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
    },
  },
});
