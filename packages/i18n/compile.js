// Compiles the messages without Vite, for type-checking and the packages' own
// tests: `pnpm run i18n` at the repo root (also run by `prepare`).
import { compile } from "@inlang/paraglide-js";
import { paraglideOptions } from "./paraglide.config.js";

await compile(paraglideOptions);
