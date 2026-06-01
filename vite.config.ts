import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,js}"],
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
      ".svelte-kit/**",
      "apps/*/.svelte-kit/**",
      "build/**",
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
      "**/.svelte-kit/**",
      "apps/*/.svelte-kit/**",
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
