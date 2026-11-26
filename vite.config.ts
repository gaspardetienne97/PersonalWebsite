import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { paraglideOptions } from "./packages/i18n/paraglide.config.js";
import { mdsvex } from "mdsvex";
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { withPwa } from "@vite-pwa/sveltekit";
import { defineConfig, type UserConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { pwaOptions } from "./pwa.config";

function buildOptions(isSsrBuild?: boolean): UserConfig["build"] {
  // One rolldownOptions for everything: when both it and rollupOptions are set,
  // Vite+ keeps rolldownOptions and silently drops rollupOptions.
  return {
    rolldownOptions: {
      checks: { bundlerTimings: false },
      onLog(level, log, handler) {
        if (isIgnoredBuildLog(log)) return;
        handler(level, log);
      },
      ...(isSsrBuild
        ? {}
        : {
            output: {
              // Keep the in-browser neural-TTS runtime (Kokoro + transformers.js +
              // onnxruntime) in one named, lazily-loaded chunk that only downloads
              // when a reader opts into neural TTS.
              codeSplitting: {
                groups: [
                  {
                    name: "kokoro-tts",
                    test: /[\\/]node_modules[\\/](@huggingface[\\/]transformers|kokoro-js|onnxruntime[^\\/]*|phonemizer)[\\/]/,
                  },
                ],
              },
            },
          }),
    },
  };
}

function isIgnoredBuildLog(log: { code?: string; id?: string }): boolean {
  const id = log.id ?? "";
  return (
    (log.code === "INVALID_ANNOTATION" && id.includes("@huggingface/transformers")) ||
    (log.code === "CIRCULAR_DEPENDENCY" && (id.includes("readable-stream") || id.includes("jszip")))
  );
}

// Code blocks keep a language-* class for styling. mdsvex 1.0 escapes Svelte's
// braces itself; the highlighter only has to escape HTML.
const escapeHtml = (code: string) =>
  code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Each block sits in a frame with a header naming its language. The article page
// adds the Copy button to that header in the browser, in the reader's language.
const CODE_LANGUAGES: Record<string, string> = {
  bash: "Shell",
  css: "CSS",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  md: "Markdown",
  nix: "Nix",
  py: "Python",
  python: "Python",
  sh: "Shell",
  sql: "SQL",
  svelte: "Svelte",
  ts: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};
const highlightCodeBlock = (code: string, { lang = "" }: { lang?: string | null }) => {
  const language = (lang ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const className = language ? ` class="language-${language}"` : "";
  const label = CODE_LANGUAGES[language] ?? language;
  return (
    `<div class="gm-code"><div class="gm-code-head"><span class="gm-code-lang">${label}</span></div>` +
    `<pre${className}><code${className}>${escapeHtml(code)}</code></pre></div>`
  );
};

export default defineConfig(({ command, isSsrBuild }): UserConfig => ({
  plugins: [
    tailwindcss(),
    // Translations: compiles project.inlang and messages/ into @repo/i18n (so the
    // workspace packages can use them too) on every dev start and build. A
    // production build gives each message its own module so a page ships only
    // the messages it uses; dev and tests keep them grouped (see the config).
    paraglideVitePlugin(
      command === "build" ? { ...paraglideOptions, messageModuleSize: 1 } : paraglideOptions,
    ),
    // mdsvex 1.0 is a Vite plugin of its own, ahead of SvelteKit.
    mdsvex({
      extensions: [".md", ".mdx", ".svx"],
      smart_punctuation: true,
      highlight: highlightCodeBlock,
    }),
    // The PWA plugin wraps SvelteKit's own plugin and passes these options to it.
    withPwa({ preprocess: [vitePreprocess()], adapter: adapter() }, pwaOptions),
  ],
  build: buildOptions(isSsrBuild),
  ssr: {
    // svelte-sonner ships raw .svelte files; Vite must compile them for SSR
    // instead of letting Node import the .svelte extension directly.
    noExternal: ["svelte-sonner"],
  },
  optimizeDeps: {
    include: [
      // The transcription worker's heavy deps: pre-bundled at start, or the
      // first transcription makes Vite re-optimise and reload the page mid-run.
      "@spotify/basic-pitch",
      "@tensorflow/tfjs",
      "@lucide/svelte/icons/moon",
      "@lucide/svelte/icons/sun",
      "@lucide/svelte/icons/play",
      "@lucide/svelte/icons/search",
      // Narrator (/pdf) icons
      "@lucide/svelte/icons/align-left",
      "@lucide/svelte/icons/arrow-left",
      "@lucide/svelte/icons/arrow-right",
      "@lucide/svelte/icons/audio-waveform",
      "@lucide/svelte/icons/book-open",
      "@lucide/svelte/icons/check",
      "@lucide/svelte/icons/chevron-down",
      "@lucide/svelte/icons/clock",
      "@lucide/svelte/icons/cpu",
      "@lucide/svelte/icons/download",
      "@lucide/svelte/icons/file-text",
      "@lucide/svelte/icons/gauge",
      "@lucide/svelte/icons/headphones",
      "@lucide/svelte/icons/list",
      "@lucide/svelte/icons/mic",
      "@lucide/svelte/icons/mic-off",
      "@lucide/svelte/icons/pause",
      "@lucide/svelte/icons/plus",
      "@lucide/svelte/icons/quote",
      "@lucide/svelte/icons/skip-back",
      "@lucide/svelte/icons/skip-forward",
      "@lucide/svelte/icons/sliders-horizontal",
      "@lucide/svelte/icons/sparkles",
      "@lucide/svelte/icons/trash-2",
      "@lucide/svelte/icons/type",
      "@lucide/svelte/icons/upload",
      "@lucide/svelte/icons/x",
      "@lucide/svelte/icons/zap",
    ],
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,js}", "packages/**/*.{test,spec}.{ts,js}"],
    browser: {
      enabled: true,
      // One fixed zone, and not UTC, so day keys behave the same on every machine
      // and a slip back to UTC days fails a test.
      provider: playwright({ contextOptions: { timezoneId: "America/New_York" } }),
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
      "packages/i18n/paraglide/**",
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
      "**/packages/i18n/paraglide/**",
      "**/dist/**",
      "**/build/**",
      "apps/*/build/**",
    ],
    options: { typeAware: false, typeCheck: false },
  },
  run: {
    cache: true,
  },
}));
