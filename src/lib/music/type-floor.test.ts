// The type floor (contract S4): no visible text in /music under 13 px. Reads every Svelte and CSS file under
// src/lib/music and src/routes/music and lists each offender as file:line, grouped by file, so each owner can
// clear their own: Tailwind text-xs and text-[...] under 13 px (or 0.8125rem), CSS font-size under the same,
// and SVG font-size attributes under 13.
import { describe, expect, it } from "vite-plus/test";

const files = {
  ...import.meta.glob<string>("/src/lib/music/**/*.svelte", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("/src/routes/music/**/*.svelte", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>(["/src/lib/music/**/*.css", "/src/routes/music/**/*.css"], {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

/** Size in px of a CSS length (rem on a 16 px base). Em sizes follow their parent, so they are not judged here. */
function px(value: string, unit = "px"): number {
  return unit === "px" ? +value : +value * 16;
}

const RULES: [RegExp, (m: RegExpExecArray) => boolean][] = [
  [/(?<![\w-])text-xs(?![\w-])/g, () => true],
  [/(?<![\w-])text-\[(\d*\.?\d+)(px|rem)\]/g, (m) => px(m[1], m[2]) < 13],
  [/font-size:\s*(\d*\.?\d+)(px|rem)\b/g, (m) => px(m[1], m[2]) < 13],
  [/font-size=["{]?(\d*\.?\d+)(?:px)?["}]/g, (m) => +m[1] < 13],
  [/style:font-size=["{]["']?(\d*\.?\d+)(px|rem)/g, (m) => px(m[1], m[2]) < 13],
];

/** Every offender as "path:line  match". */
function offenders(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [path, src] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    const lineAt = (i: number) => src.slice(0, i).split("\n").length;
    const hits: [number, string][] = [];
    for (const [re, bad] of RULES)
      for (const m of src.matchAll(re))
        if (bad(m as RegExpExecArray)) hits.push([lineAt(m.index!), m[0]]);
    for (const [line, text] of hits.sort((a, b) => a[0] - b[0]))
      out.push(`${path.slice(1)}:${line}  ${text}`);
  }
  return out;
}

describe("type floor", () => {
  it("catches each kind of small type", () => {
    const src = [
      '<p class="text-xs sm:text-sm">a</p>',
      '<p class="text-[12px] text-[13px] text-[0.75rem] text-[0.8125rem]">b</p>',
      "<style>.a { font-size: 11px } .b { font-size: 0.8125rem } .c { font-size: 0.7rem }</style>",
      '<text font-size="10">c</text><text font-size={14}>d</text>',
      '<p class="text-xsm text-xs-foo">e</p>',
    ].join("\n");
    expect(offenders({ "/x.svelte": src }).map((l) => l.split("  ")[1])).toEqual([
      "text-xs",
      "text-[12px]",
      "text-[0.75rem]",
      "font-size: 11px",
      "font-size: 0.7rem",
      'font-size="10"',
    ]);
  });

  it("finds the Svelte files", () => {
    expect(Object.keys(files).length).toBeGreaterThan(100);
  });

  it("has no visible text under 13 px in /music", () => {
    // Grouped by file: each work package clears the files it owns.
    const list = offenders(files);
    expect(list.length, `${list.length} under 13 px:\n${list.join("\n")}\n`).toBe(0);
  });
});
