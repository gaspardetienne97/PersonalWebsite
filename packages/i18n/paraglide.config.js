// The one set of Paraglide compiler options, shared by the Vite plugin
// (vite.config.ts) and `pnpm run i18n` (packages/i18n/compile.js), so both
// write the same output.
/** @type {import("@inlang/paraglide-js").CompilerOptions} */
export const paraglideOptions = {
  project: "./project.inlang",
  outdir: "./packages/i18n/paraglide",
  outputStructure: "message-modules",
  // About 10,000 messages: one module each would mean 10,000 requests in dev and
  // in the browser test runner, so they're grouped here. The production build
  // (vite.config.ts) sets this back to 1, so each page ships only its messages.
  messageModuleSize: 250,
  // The language comes from a cookie the language menus set, then the
  // browser's preference, then English. URLs stay the same.
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
  // The Vite plugin would write `import.meta.env.SSR` here, which the packages'
  // plain TypeScript checks don't know. This means the same thing everywhere.
  isServer: "typeof window === 'undefined'",
};
