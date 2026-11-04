// The flat index behind the command palette: pages, every drill, every path.
import { CATALOG } from "@repo/music-core/content/catalog";
import { LEARNING_PATHS } from "@repo/music-core/progress/paths";
import { INSTRUMENTS } from "@repo/music-core";
import { DRILL_GROUPS } from "./hubs/drills-layout";
import { INSTRUMENT_LABEL } from "./bench.svelte";
export interface SearchItem {
  label: string;
  href: string;
  hint?: string;
  keywords?: string;
  /** Drills rank above pages that match as well. */
  drill?: boolean;
  /** A heading for the empty palette's sections ("Up next", "Recent", "Pages"). */
  group?: string;
  /** Why an item matched when its title does not: the words around the query. */
  match?: string;
  /** A second line under the title: which instruments a drill runs on. */
  detail?: string;
  /** What the row is, for its icon: a page, a drill, a path, or the "show all" row. */
  kind?: "page" | "drill" | "path" | "song" | "all";
}

const PAGES: SearchItem[] = [
  { label: "Start today's plan", href: "/music", hint: "Today", keywords: "routine daily" },
  { label: "All drills", href: "/music?tab=drills", hint: "Drills" },
  { label: "Learning paths", href: "/music?tab=paths", hint: "Paths", keywords: "curriculum" },
  { label: "Library", href: "/music/library", hint: "Songs and imports" },
  {
    label: "Import a score",
    href: "/music/library?tab=import",
    hint: "Library",
    keywords: "midi musicxml mxl transcribe",
  },
  { label: "Chord and scale reference", href: "/music/create/reference", hint: "Create" },
  {
    label: "Beat grid",
    href: "/music/create?mode=beat",
    hint: "Create",
    keywords: "sequencer drums song backing track",
  },
  { label: "Piano roll", href: "/music/create?mode=roll", hint: "Create", keywords: "melody song" },
  {
    label: "Sample kits",
    href: "/music/create/kits",
    hint: "Create",
    keywords: "kit samples pads mpc",
  },
  { label: "Record", href: "/music/record", hint: "Takes", keywords: "audio midi take" },
  { label: "Progress", href: "/music/progress", hint: "What next" },
  { label: "Skills", href: "/music/progress?view=skills", hint: "Progress", keywords: "mastery" },
  { label: "Sessions", href: "/music/progress?view=sessions", hint: "Progress" },
  { label: "Journal", href: "/music/journal", hint: "History", keywords: "notes heatmap" },
  {
    label: "Connect",
    href: "/music/connect",
    hint: "MIDI and microphone",
    keywords: "device mpc aerophone",
  },
  { label: "Tuner", href: "/music/tuner", hint: "Tune", keywords: "pitch" },
  { label: "Intonation", href: "/music/tuner?mode=intonation", hint: "Tuner" },
  { label: "Drone", href: "/music/tuner?mode=drone", hint: "Tuner" },
  {
    label: "Settings",
    href: "/music/settings",
    hint: "Sound, latency, data",
    keywords: "calibration backup",
  },
  { label: "Guide", href: "/music/guide", hint: "How it works", keywords: "help" },
];

/** The Drills tab section a drill sits in, so "Scales" and "Scales and modes" read apart. */
const area = (id: string) => {
  const g = DRILL_GROUPS.find((x) => x.rows.some((r) => r.entry.id === id));
  return g ? (g.section ?? g.title) : undefined;
};
const DRILLS: SearchItem[] = CATALOG.map((e) => {
  const where = area(e.id);
  return {
    label: e.title,
    href: e.route,
    hint: where ? `${where} drill` : "Drill",
    detail:
      e.instruments.length >= INSTRUMENTS.length
        ? "Any instrument"
        : e.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", "),
    keywords: e.blurb,
    drill: true,
    kind: "drill",
  };
});
const PATHS: SearchItem[] = Object.values(LEARNING_PATHS).map((p) => ({
  label: p.title,
  href: "/music?tab=paths",
  hint: "Path",
  keywords: p.subtitle,
  kind: "path",
}));

let extra: SearchItem[] = [];
/** Drills, paths and songs register themselves once their data loads. */
export function registerSearchItems(items: SearchItem[]) {
  const seen = new Set([...PAGES, ...DRILLS].map((p) => p.href));
  extra = [
    ...extra.filter((e) => !items.some((i) => i.href === e.href)),
    ...items.filter((i) => !seen.has(i.href)),
  ];
}

export const searchIndex = (): SearchItem[] => [...PAGES, ...DRILLS, ...PATHS, ...extra];

const norm = (id: string) => id.replace(/^technique\.ukulele\./, "technique.guitar.");

/** The drills behind the latest runs, newest first, each once. */
export function recentDrills(
  runs: { exerciseId: string; startedAt: number }[],
  n = 3,
): SearchItem[] {
  const out: SearchItem[] = [];
  for (const r of [...runs].sort((a, b) => b.startedAt - a.startedAt)) {
    const id = norm(r.exerciseId);
    const e = CATALOG.find((x) => x.exerciseId === id || x.modes.some((m) => m.exerciseId === id));
    const item = e && DRILLS.find((d) => d.href === e.route);
    if (item && !out.some((o) => o.href === item.href)) out.push(item);
    if (out.length === n) break;
  }
  return out;
}

/** The first `n` drills for an instrument, in catalogue order: the empty palette's start before any history. */
export const drillsFor = (instrument: string, n = 3): SearchItem[] =>
  CATALOG.filter((e) => (e.instruments as string[]).includes(instrument))
    .slice(0, n)
    .flatMap((e) => DRILLS.filter((d) => d.href === e.route).slice(0, 1));

/** The words around the first place `q` appears in `text`, for a result that matched there. */
function excerpt(text: string, q: string): string {
  const at = text.toLowerCase().indexOf(q);
  const from = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 24)) + 1);
  const to = text.indexOf(" ", at + q.length + 24);
  return `${from > 0 ? "…" : ""}${text.slice(from, to < 0 ? undefined : to)}${to < 0 ? "" : "…"}`;
}

const path = (href: string) => href.split(/[?#]/)[0];

/** A label split around the first place `q` appears, so the palette can set the match in bold. */
export function splitMatch(label: string, q: string): [string, string, string] {
  const at = q.trim() ? label.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  if (at < 0) return [label, "", ""];
  const end = at + q.trim().length;
  return [label.slice(0, at), label.slice(at, end), label.slice(end)];
}

/**
 * The palette's results: label matches before keyword-only ones, an exact label first, then
 * drills before pages, then a label that starts with the query before a word in it. A
 * keyword-only match is left out once two titles match, and otherwise says what it matched.
 * With no query: `lead` (today's next block, recent drills) first, then pages.
 */
export function searchItems(
  query: string,
  all = searchIndex(),
  lead: SearchItem[] = [],
): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // A drill that is also the next block is listed once.
    const first = lead.filter((i, n) => lead.findIndex((j) => path(j.href) === path(i.href)) === n);
    const rest = all
      .filter((i) => !i.drill && !first.some((f) => f.href === i.href))
      .map((i) => (lead.length ? { ...i, group: "Pages" } : i));
    return [...first, ...rest].slice(0, 12);
  }
  const score = (item: SearchItem) => {
    const label = item.label.toLowerCase();
    const at = label.startsWith(q)
      ? 0
      : label.split(/\s+/).some((w) => w.startsWith(q))
        ? 1
        : label.includes(q)
          ? 2
          : `${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase().includes(q)
            ? 1000
            : -1;
    return at < 0 ? -1 : at + (label === q ? 0 : 100) + (item.drill ? 0 : 10);
  };
  // The sort is stable, so equal scores keep the index order.
  const hits = all
    .map((item) => ({ item, s: score(item) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s);
  const strong = hits.filter((r) => r.s < 1000).length;
  const shown = hits
    .filter((r) => r.s < 1000 || strong < 2)
    .slice(0, 20)
    .map(({ item, s }) =>
      // A hint match needs no note: the hint is shown beside the title.
      s >= 1000 && item.keywords?.toLowerCase().includes(q)
        ? { ...item, match: excerpt(item.keywords, q) }
        : item,
    );
  // The Drills tab, filtered to the same words, as the last row whenever a drill matched.
  const drills = shown.filter((i) => i.drill).length;
  return drills
    ? [
        ...shown,
        {
          label: `Show ${drills === 1 ? "it" : `all ${drills}`} in Drills`,
          href: `/music?tab=drills&q=${encodeURIComponent(query.trim())}`,
          hint: "Drills",
          kind: "all" as const,
        },
      ]
    : shown;
}
