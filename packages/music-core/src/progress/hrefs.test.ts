/// <reference types="vite/client" />
// Every drill link the app ships (path steps and their links, routine steps, each catalog route
// and mode, and every static "/music/..." literal in the app's source: lessons, Today cards,
// search, hub tables) keeps recording the exercise ids it records today, so practice history, stars and
// levels carry over when drills move. A drill that moves adds a row to MOVED, so the snapshot
// stays keyed on the old href; its ids are never updated. Only a new link is a reason for -u.
import { describe, expect, it } from "vitest";
import type { Instrument } from "../types";
import { CATALOG } from "../content/catalog";
import { exercisesForHref } from "./levels";
import { LEARNING_PATHS } from "./paths";
import { STEPS } from "./routine";

/** Old pathname to its new one, for drills that moved (the old route redirects there). */
const MOVED: Record<string, string> = {
  "/music/library": "/music/studio",
  // The seven jazz drills are modes of Play over changes.
  ...Object.fromEntries(
    ["voicings", "comping", "accompany", "licks", "chord-scales", "jam", "call-response"].map(
      (m) => [`/music/${m}`, `/music/changes/${m}`],
    ),
  ),
};
const BACK = Object.fromEntries(Object.entries(MOVED).map(([a, b]) => [b, a]));

const oldHref = (href: string) => {
  const [path, rest = ""] = href.split(/(?=[?#])/);
  return (BACK[path] ?? path) + rest;
};

/** Static drill hrefs written in source (a template literal is read up to its first `${`). */
const SOURCES = import.meta.glob<string>(
  [
    "../../../../src/routes/music/**/*.{svelte,ts}",
    "../../../../src/lib/music/**/*.{svelte,ts}",
    "../**/*.ts",
    "!**/*.{test,spec}.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
const literals = () =>
  Object.values(SOURCES).flatMap((src) =>
    [...src.matchAll(/["'`](\/music\/[a-z0-9/-]+(?:\?[^"'`\s$<>{}]*)?)/g)].map((m) => m[1]),
  );

function linked(): { href: string; instruments: readonly Instrument[] }[] {
  const out = new Map<string, { href: string; instruments: readonly Instrument[] }>();
  const add = (href: string, instruments: readonly Instrument[] = []) =>
    out.set(`${href} ${instruments.join(",")}`, { href, instruments });
  for (const path of Object.values(LEARNING_PATHS))
    for (const step of path.steps)
      for (const href of [step.href, ...step.links.map((l) => l.href)])
        if (href.startsWith("/music")) add(href, step.instruments);
  for (const step of Object.values(STEPS)) add(step.route);
  for (const e of CATALOG) {
    add(e.route);
    for (const m of e.modes) add(`${e.route}?mode=${m.id}`);
  }
  for (const href of literals()) if (exercisesForHref(href).length) add(href);
  return [...out.values()];
}

describe("drill hrefs keep their exercise ids", () => {
  it("records the same ids for every linked href, followed to where it lives now", () => {
    const ids = Object.fromEntries(
      linked()
        .map(({ href, instruments }) => [
          `${oldHref(href)}${instruments.length ? ` [${instruments.join(",")}]` : ""}`,
          exercisesForHref(href, [...instruments]),
        ])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    expect(ids).toMatchSnapshot();
  });
});
