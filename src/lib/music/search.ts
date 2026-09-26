// The flat index behind the command palette: pages, every drill, every path.
import { CATALOG } from "@repo/music-core/content/catalog";
import { LEARNING_PATHS } from "@repo/music-core/progress/paths";
export interface SearchItem {
  label: string;
  href: string;
  hint?: string;
  keywords?: string;
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

const DRILLS: SearchItem[] = CATALOG.map((e) => ({
  label: e.title,
  href: e.route,
  hint: "Drill",
  keywords: e.blurb,
}));
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
