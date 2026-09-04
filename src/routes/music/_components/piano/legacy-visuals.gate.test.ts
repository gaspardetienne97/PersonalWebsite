import { describe, expect, test } from "vite-plus/test";

/**
 * Positive source gate for the piano convergence: PianoSurface is the only
 * piano visual. The four legacy visuals (OnScreenKeyboard, reading PianoInput,
 * theory PianoKeyboard, the hand-built ProgressionChartStage geometry) and the
 * `piano-chart` dependency were deleted; nothing may import, reference, or
 * re-create them.
 *
 * Matches file paths and distinctive identifiers, never bare words: the
 * `PianoInput` holder-registry class in `piano-input.ts` and the live
 * "Piano input" aria-label are legitimate.
 */
const sources = import.meta.glob(
  [
    "/src/**/*.{ts,svelte,js,mjs,json,yaml}",
    "/packages/**/*.{ts,svelte,js,mjs,json,yaml}",
    "/scripts/**/*.{ts,svelte,js,mjs,json,yaml}",
    "/package.json",
    "/pnpm-workspace.yaml",
    "/vite.config.ts",
    "!**/node_modules/**",
    "!**/build/**",
    "!**/.svelte-kit/**",
    "!**/legacy-visuals.gate.test.ts",
  ],
  { eager: true, import: "default", query: "?raw" },
) as Record<string, string>;

const forbidden: { name: string; pattern: RegExp }[] = [
  // Deleted visual files, matched as paths so the bare identifiers stay usable.
  { name: "OnScreenKeyboard.svelte", pattern: /OnScreenKeyboard\.svelte/ },
  { name: "PianoInput.svelte", pattern: /PianoInput\.svelte/ },
  { name: "PianoKeyboard.svelte", pattern: /PianoKeyboard\.svelte/ },
  // Deleted geometry module and the third-party SVG keyboard it drove.
  { name: "piano-visual", pattern: /piano-visual/ },
  { name: "piano-chart", pattern: /piano-chart/ },
  { name: "INoteValue (piano-chart type)", pattern: /\bINoteValue\b/ },
  // Distinctive identifiers from the deleted percent-positioning geometry.
  { name: "pianoFingerMarkers", pattern: /\bpianoFingerMarkers\b/ },
  { name: "PianoFingerMarker", pattern: /\bPianoFingerMarker\b/ },
  { name: "pianoOctaveRange", pattern: /\bpianoOctaveRange\b/ },
  { name: "midiOctaveRange", pattern: /\bmidiOctaveRange\b/ },
  { name: "pianoKeyLeftPercent", pattern: /\bpianoKeyLeftPercent\b/ },
  { name: "leftPercent", pattern: /\bleftPercent\b/ },
  { name: "BLACK_KEY_BASE", pattern: /\bBLACK_KEY_BASE\b/ },
  { name: "NATURAL_INDEX", pattern: /\bNATURAL_INDEX\b/ },
];

function violations(source: string): string[] {
  return forbidden.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

describe("piano legacy visuals gate", () => {
  test("walks the intended roots", () => {
    const paths = Object.keys(sources);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain("/package.json");
    expect(paths).toContain("/pnpm-workspace.yaml");
    expect(paths).toContain("/vite.config.ts");
    expect(paths).toContain("/src/routes/music/_components/piano/PianoSurface.svelte");
    expect(paths).toContain("/scripts/assert-music-piano-precache.mjs");
    expect(paths.some((path) => path.startsWith("/packages/music-core/src/"))).toBe(true);
    expect(paths.some((path) => path.includes("/node_modules/"))).toBe(false);
  });

  test("no source references a deleted piano visual, piano-chart, or its geometry", () => {
    const offenders = Object.entries(sources)
      .map(([path, source]) => [path, violations(source)] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([path, hits]) => `${path}: ${hits.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  test("negative control: the matcher bites on forbidden references", () => {
    expect(violations('import OnScreenKeyboard from "./OnScreenKeyboard.svelte";')).toEqual([
      "OnScreenKeyboard.svelte",
    ]);
    expect(violations('import PianoInput from "./PianoInput.svelte";')).toEqual([
      "PianoInput.svelte",
    ]);
    expect(violations('const { Instrument } = await import("piano-chart");')).toEqual([
      "piano-chart",
    ]);
    expect(violations('import { pianoOctaveRange } from "../piano-visual";')).toEqual([
      "piano-visual",
      "pianoOctaveRange",
    ]);
    expect(violations("style:left={`${marker.leftPercent}%`}")).toEqual(["leftPercent"]);
  });

  test("negative control: legitimate PianoInput class and aria-label pass", () => {
    expect(violations('import { PianoInput } from "./piano-input";')).toEqual([]);
    expect(violations("const input = new PianoInput({ pointerMode });")).toEqual([]);
    expect(violations('<div role="group" aria-label="Piano input">')).toEqual([]);
  });
});
