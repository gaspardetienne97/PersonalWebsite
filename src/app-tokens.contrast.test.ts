import { describe, expect, test } from "vitest";

import css from "./app.css?raw";

/**
 * Every text-on-surface token pair the music app relies on clears WCAG AA in
 * both themes, computed from the OKLCH values in app.css. The music scope
 * cascades over the site root, so each theme is resolved as root + overrides.
 */

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open + 1, close);
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[match[1]!] = match[2]!.trim();
  return vars;
}

const root = block(":root {");
const dark = block(".dark {");
const musicLight = block('[data-app="music"],');
const musicDark = block('.dark [data-app="music"],');
const themes = {
  light: { ...root, ...musicLight },
  dark: { ...root, ...dark, ...musicDark },
};

function oklchToLuminance(value: string, vars: Record<string, string>): number {
  const resolved = value.replace(/var\(--([\w-]+)\)/g, (_, name) => vars[name] ?? "");
  const match = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(resolved);
  if (!match) throw new Error(`not an oklch colour: ${value}`);
  const [L, C, h] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(bl);
}

function ratio(fg: string, bg: string, vars: Record<string, string>): number {
  const a = oklchToLuminance(vars[fg]!, vars) + 0.05;
  const b = oklchToLuminance(vars[bg]!, vars) + 0.05;
  return a > b ? a / b : b / a;
}

const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  // Links, ring percentages and HUD values are set in text-primary on cards.
  ["primary", "card"],
  ["primary", "background"],
  ["stage-foreground", "stage"],
  ["stage-foreground", "stage-2"],
  ["stage-muted", "stage"],
  ["stage-muted", "stage-2"],
  ["practice-accent-foreground", "practice-accent"],
  ["success-foreground", "success"],
  ["warn-foreground", "warn"],
  ["info-foreground", "info"],
  ["hand-left-foreground", "hand-left"],
  ["hand-right-foreground", "hand-right"],
  ["degree-foreground", "degree-1"],
  ["degree-foreground", "degree-b2"],
  ["degree-foreground", "degree-2"],
  ["degree-foreground", "degree-b3"],
  ["degree-foreground", "degree-3"],
  ["degree-foreground", "degree-4"],
  ["degree-foreground", "degree-s4"],
  ["degree-foreground", "degree-5"],
  ["degree-foreground", "degree-b6"],
  ["degree-foreground", "degree-6"],
  ["degree-foreground", "degree-b7"],
  ["degree-foreground", "degree-7"],
  ["tone-foreground", "tone-chord"],
  ["tone-foreground", "tone-scale"],
  ["tone-foreground", "tone-avoid"],
];

describe.each(Object.entries(themes))("music tokens · %s", (_name, vars) => {
  test.each(TEXT_PAIRS)("%s on %s reads at 4.5:1", (fg, bg) => {
    expect(ratio(fg, bg, vars)).toBeGreaterThanOrEqual(4.5);
  });
});
