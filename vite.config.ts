import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { pwaOptions } from "./pwa.config";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), SvelteKitPWA(pwaOptions)],
  optimizeDeps: {
    include: [
      "lucide-svelte/icons/moon",
      "lucide-svelte/icons/sun",
      "lucide-svelte/icons/bookmark",
      "lucide-svelte/icons/bookmark-check",
      "lucide-svelte/icons/ear",
      "lucide-svelte/icons/play",
      "lucide-svelte/icons/search",
      "svguitar",
      "tone",
      "@repo/music-core > webmidi",
    ],
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,js}", "packages/**/*.{test,spec}.{ts,js}"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: [
      ".direnv/**",
      ".claude/**",
      ".codex/**",
      ".superpowers/**",
      ".svelte-kit/**",
      "apps/*/.svelte-kit/**",
      "packages/*/.svelte-kit/**",
      "build/**",
      "domain/**",
      "apps/*/build/**",
      "node_modules/**",
      "project.inlang/**",
      "src/lib/paraglide/**",
      "static/pdfjs/**",
      "apps/*/static/pdfjs/**",
      "**/*.md",
    ],
  },
  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/.claude/**",
      "**/.codex/**",
      "**/.superpowers/**",
      "**/.svelte-kit/**",
      "domain/**",
      "apps/*/.svelte-kit/**",
      "packages/*/.svelte-kit/**",
      "**/src/lib/paraglide/**",
      "**/dist/**",
      "**/build/**",
      "apps/*/build/**",
      "**/static/pdfjs/**",
    ],
    options: { typeAware: false, typeCheck: false },
  },
  run: {
    cache: true,
  },
});
