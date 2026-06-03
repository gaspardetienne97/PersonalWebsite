import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  optimizeDeps: {
    include: ["lucide-svelte/icons/moon", "lucide-svelte/icons/sun"],
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
