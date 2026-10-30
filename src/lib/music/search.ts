// The flat index behind the command palette: pages, every drill, every path.
import { CATALOG } from "@repo/music-core/content/catalog";
import { LEARNING_PATHS } from "@repo/music-core/progress/paths";
import { DRILL_GROUPS } from "./hubs/drills-layout";
export interface SearchItem {
  label: string;
  href: string;
  hint?: string;
  keywords?: string;
  /** Drills rank above pages that match as well. */
  drill?: boolean;
}

const PAGES: SearchItem[] = [
  { label: "Start today's plan", href: "/music", hint: "Today", keywords: "routine daily" },
  { label: "All drills", href: "/music?tab=drills", hint: "Today" },
  { label: "Learning paths", href: "/music?tab=paths", hint: "Today", keywords: "curriculum" },
  { label: "Library", href: "/music/library", hint: "Songs and reference" },
  {
    label: "Import a score",
    href: "/music/library?tab=import",
    hint: "Library",
    keywords: "midi musicxml mxl transcribe",
  },
  { label: "Chord and scale reference", href: "/music/library?tab=reference", hint: "Library" },
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
    keywords: e.blurb,
    drill: true,
  };
});
const PATHS: SearchItem[] = Object.values(LEARNING_PATHS).map((p) => ({
  label: p.title,
  href: "/music?tab=paths",
  hint: "Path",
  keywords: p.subtitle,
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

/**
 * The palette's results: label matches before keyword-only ones, an exact label first, then
 * drills before pages, then a label that starts with the query before a word in it.
 */
export function searchItems(query: string, all = searchIndex()): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 12);
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
  return all
    .map((item) => ({ item, s: score(item) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, 20)
    .map((r) => r.item);
}
