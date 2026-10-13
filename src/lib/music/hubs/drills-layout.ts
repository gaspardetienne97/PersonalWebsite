// The Drills tab, grouped by what you practise; the instrument filter does the
// narrowing. Most rows are a catalog entry; Pads and the Aerophone are split
// by mode into the groups their modes belong to.
import { CATALOG, type CatalogEntry } from "@repo/music-core/content/catalog";

export interface DrillRow {
  /** Unique within the page. */
  key: string;
  entry: CatalogEntry;
  /** A split row opens on its first mode. */
  href: string;
  title: string;
  blurb: string;
  /** Mode ids shown as chips (a subset for a split row); none for the ear drills. */
  modes: string[];
}

export interface DrillGroup {
  id: string;
  title: string;
  /** Ear training's three groups sit under one heading. */
  section?: string;
  note?: string;
  rows: DrillRow[];
}

/** Which setup key picks a drill's mode, so a mode chip opens that mode directly. */
const MODE_KEY: [RegExp, string][] = [
  [/^\/music\/ear\//, "answer"],
  [/^\/music\/reading/, "activity"],
  [/^\/music\/voicings/, "variant"],
  [/^\/music\/licks/, "category"],
  [/^\/music\/chord-scales/, "changes"],
  [/^\/music\/listening/, "exercise"],
  [/^\/music\/(rhythm|fretboard|chords|pads|aerophone|circle)/, "mode"],
];
export const modeHref = (e: CatalogEntry, mode: string) => {
  const key = MODE_KEY.find(([r]) => r.test(e.route))?.[1];
  return key
    ? `${e.route}${e.route.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(mode)}`
    : e.route;
};

const byId = (id: string) => {
  const e = CATALOG.find((x) => x.id === id);
  if (!e) throw new Error(`No catalog entry ${id}`);
  return e;
};
const row = (id: string, opts: { chips?: boolean } = {}): DrillRow => {
  const e = byId(id);
  return {
    key: id,
    entry: e,
    href: e.route,
    title: e.title,
    blurb: e.blurb,
    modes: opts.chips === false || e.modes.length < 2 ? [] : e.modes.map((m) => m.id),
  };
};
const part = (id: string, key: string, title: string, blurb: string, modes: string[]): DrillRow => {
  const e = byId(id);
  return {
    key: `${id}:${key}`,
    entry: e,
    href: modeHref(e, modes[0]),
    title,
    blurb,
    modes: modes.length > 1 ? modes : [],
  };
};
const ear = (...slugs: string[]) => slugs.map((s) => row(`ear-${s}`, { chips: false }));

const EAR = "Ear training";

export const DRILL_GROUPS: DrillGroup[] = [
  {
    id: "ear-notes",
    section: EAR,
    title: "Notes and melody",
    note: "Answer by choosing, playing it back, singing, from memory (pocket recall) or just listening along: pick inside each drill.",
    rows: ear(
      "intervals",
      "interval-compare",
      "fine-pitch",
      "scale-degrees",
      "melody-dictation",
      "wrong-note",
      "repertoire-transfer",
    ),
  },
  {
    id: "ear-chords",
    section: EAR,
    title: "Chords, scales and keys",
    rows: ear(
      "chord-qualities",
      "inversions",
      "scales",
      "cadences",
      "chord-functions",
      "progressions",
      "bass-lines",
    ),
  },
  { id: "ear-review", section: EAR, title: "Review", rows: ear("mixed") },
  { id: "reading", title: "Reading and rhythm", rows: [row("reading"), row("rhythm")] },
  {
    id: "technique",
    title: "Technique",
    rows: [
      row("scales"),
      row("two-hand"),
      row("pedal"),
      row("fretboard"),
      row("chords"),
      part(
        "pads",
        "technique",
        "Pad technique",
        "Strokes, rolls, accents and ghosts on the click, at a level you choose, and rudiments spread across the kit.",
        ["rudiment", "orchestrate", "dynamics"],
      ),
      part(
        "aerophone",
        "fingers",
        "Aerophone fingers",
        "Roland's fingering lessons in order, then scales in every key, crossings over the octave keys and trills.",
        ["fingering", "scales", "register", "trills"],
      ),
      part(
        "aerophone",
        "breath",
        "Aerophone breath and tongue",
        "Long tones at a level, swells, tonguing patterns, bite vibrato and landing intervals on a drone.",
        ["long-tone", "swell", "articulation", "tonguing", "vibrato", "interval-landing"],
      ),
    ],
  },
  {
    id: "grooves",
    title: "Grooves and time",
    rows: [
      part(
        "pads",
        "grooves",
        "Pad grooves",
        "A repertoire of grooves in six levels, fills that land on the one, playing a bar back, an ostinato under a line, and holding the tempo alone.",
        ["groove", "fills", "echo", "ostinato", "steady"],
      ),
      row("strum"),
    ],
  },
  {
    id: "jazz",
    title: "Jazz and improvising",
    rows: [
      row("voicings"),
      row("comping"),
      row("chord-scales"),
      row("licks"),
      row("jam"),
      part(
        "pads",
        "improvise",
        "Improvise on the pads",
        "Play anything over the band; hear the take back as played and nudged to the grid.",
        ["improvise"],
      ),
    ],
  },
  { id: "theory", title: "Theory", rows: [row("circle")] },
  { id: "studio", title: "Studio ears", rows: [row("listening")] },
  { id: "play", title: "Play and record", rows: [row("song-studio"), row("lab")] },
];
