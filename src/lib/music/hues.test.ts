// Contrast of the Woodshed tokens, measured from woodshed.css (WCAG 2 ratios,
// oklch converted to sRGB), so a colour change that drops text under 4.5:1 fails here.
import { describe, expect, it } from "vite-plus/test";
import css from "../../routes/music/woodshed.css?raw";

type Oklch = [number, number, number];
/** The oklch tokens declared in the first rule whose selector is exactly `selector`. */
function tokens(selector: string): Record<string, Oklch> {
  const at = css.search(new RegExp(`(^|\\n)${selector.replace(/[.[\]()*:"]/g, "\\$&")} \\{`));
  if (at < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(at, css.indexOf("}", at));
  const out: Record<string, Oklch> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g))
    out[m[1]] = [+m[2], +m[3], +m[4]];
  return out;
}

function luminance([L, C, h]: Oklch): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
const contrast = (x: Oklch, y: Oklch) => {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};

const light = tokens(".woodshed");
const dark = { ...light, ...tokens(".dark .woodshed") };
const stage = { ...dark, ...tokens(".woodshed .stage") };
const stageLight = { ...light, ...tokens(".woodshed .stage") };
const HUES = Object.keys(light)
  .filter((k) => /^--hue-[a-z]+$/.test(k))
  .map((k) => k.slice(6));

describe("woodshed contrast", () => {
  it("finds the palette", () => {
    expect(HUES.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps soft text at 4.5:1 on the page, its surfaces and the stage, in both themes", () => {
    for (const t of [light, dark]) {
      for (const bg of ["--ws-bg", "--ws-surface", "--ws-raised"])
        expect(contrast(t["--ws-soft"], t[bg])).toBeGreaterThanOrEqual(4.5);
      for (const bg of ["--ws-stage", "--ws-stage-2"])
        expect(contrast(t["--ws-stage-soft"], t[bg])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives every hue's primary button a 4.5:1 label, both themes", () => {
    for (const h of HUES) {
      // Light theme: the deep fill and white where the CSS switches the hue; else the hue and dark ink.
      const strong = light[`--hue-${h}-strong`];
      const lightPair = strong
        ? [strong, light["--on-strong"]]
        : [light[`--hue-${h}`], light["--on-instr"]];
      expect(contrast(lightPair[0], lightPair[1]), `${h} light`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark[`--hue-${h}`], dark["--on-instr"]), `${h} dark`).toBeGreaterThanOrEqual(
        4.5,
      );
      if (strong) expect(css).toContain(`var(--hue-${h}-strong)`);
    }
  });

  it("keeps judgement tones legible on the dark stage in either theme", () => {
    for (const t of [stage, stageLight])
      for (const k of ["--success", "--warn", "--destructive", "--early", "--late"])
        for (const bg of ["--ws-stage", "--ws-stage-2"])
          expect(contrast(t[k], t[bg]), `${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(stage["--success"], stage["--success-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(stage["--warn"], stage["--warn-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(stage["--destructive"], stage["--on-destructive"])).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps early and late legible as text and as fills, on the page and on the stage", () => {
    for (const [name, t] of [
      ["light", light],
      ["dark", dark],
      ["stage", stage],
    ] as const) {
      const bgs =
        name === "stage"
          ? ["--ws-stage", "--ws-stage-2"]
          : ["--ws-bg", "--ws-surface", "--ws-raised"];
      for (const k of ["early", "late"]) {
        for (const bg of bgs)
          expect(contrast(t[`--${k}`], t[bg]), `${k} on ${bg}, ${name}`).toBeGreaterThanOrEqual(
            4.5,
          );
        expect(contrast(t[`--${k}`], t[`--on-${k}`]), `${k} fill, ${name}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });
});
