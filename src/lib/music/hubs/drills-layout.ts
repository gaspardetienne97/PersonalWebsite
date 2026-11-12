// The Drills tab, grouped by what you practise; the instrument filter does the
// narrowing. Most rows are a catalog entry; Pads and the Aerophone are split
// by mode into the groups their modes belong to.
import { CATALOG, type CatalogEntry } from "@repo/music-core/content/catalog";
import { SCALE_PATTERNS } from "@repo/music-core/content/technique";
import type { SkillMastery } from "@repo/music-core";
import { SKILL_GRAPH, aggregateMastery } from "@repo/music-core/progress/graph";
import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";

export interface ModeChip {
  id: string;
  label: string;
  href: string;
}

export interface DrillRow {
  /** Unique within the page. */
  key: string;
  entry: CatalogEntry;
  /** A split row opens on its first mode. */
  href: string;
  title: string;
  blurb: string;
  /** Modes shown as chips, each opening that mode (a subset for a split row). */
  modes: ModeChip[];
  /** What the row trains, for its mastery ring (a split row: its modes' skills). */
  skillIds: string[];
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
  [/^\/music\/ear\/studio/, "exercise"],
  [/^\/music\/ear\//, "answer"],
  [/^\/music\/reading/, "activity"],
  [/^\/music\/changes\/voicings/, "variant"],
  [/^\/music\/changes\/licks/, "category"],
  [/^\/music\/changes\/chord-scales/, "changes"],
  [
    /^\/music\/(rhythm|fretboard|chords|pads|aerophone|circle|accompany|by-ear|call-response)/,
    "mode",
  ],
];
export const modeHref = (e: CatalogEntry, mode: string) => {
  const key = MODE_KEY.find(([r]) => r.test(e.route))?.[1];
  return key
    ? `${e.route}${e.route.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(mode)}`
    : e.route;
};
const chips = (e: CatalogEntry, ids: string[]): ModeChip[] =>
  ids.length < 2
    ? []
    : ids.map((id) => ({
        id,
        label: e.modes.find((m) => m.id === id)?.label ?? id,
        href: modeHref(e, id),
      }));
/** Drills with no catalog modes whose main setup choice still deserves a chip. */
const SETUP_CHIPS: Record<string, ModeChip[]> = {
  scales: SCALE_PATTERNS.map((p) => ({
    id: p.id,
    label: p.label,
    href: `/music/scales?pattern=${p.id}`,
  })),
};

/** The filter's instrument rides along, so the drill opens on the instrument the list was filtered for. */
export const withInstrument = (href: string, instrument?: string) =>
  instrument ? `${href}${href.includes("?") ? "&" : "?"}instrument=${instrument}` : href;

const byId = (id: string) => {
  const e = CATALOG.find((x) => x.id === id);
  if (!e) throw new Error(`No catalog entry ${id}`);
  return e;
};
const row = (id: string): DrillRow => {
  const e = byId(id);
  return {
    key: id,
    entry: e,
    href: e.route,
    title: e.title,
    blurb: e.blurb,
    modes:
      SETUP_CHIPS[id] ??
      chips(
        e,
        e.modes.map((m) => m.id),
      ),
    skillIds: e.skillIds,
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
    modes: chips(e, modes),
    skillIds: [...new Set(e.modes.filter((m) => modes.includes(m.id)).flatMap((m) => m.skillIds))],
  };
};
/**
 * A row's ring: the mean decayed estimate of its skills, untouched ones as zero. Honest
 * evidence: no number until its skills hold the coach's bar of checked attempts.
 */
export function rowMastery(
  r: Pick<DrillRow, "skillIds">,
  state: Record<string, SkillMastery>,
  now: number,
): { checked: number; value?: number } {
  const parts = r.skillIds.map((id) => aggregateMastery(id, state, SKILL_GRAPH, now));
  const checked = parts.reduce((n, p) => n + (p?.observations ?? 0), 0);
  if (checked < COACH_MIN_ATTEMPTS) return { checked };
  return { checked, value: parts.reduce((n, p) => n + (p?.mastery ?? 0), 0) / parts.length };
}

/**
 * The latest scored run of a row's drill (a split row: only its own modes), for "Last: 82%,
 * 2 days ago". Ukulele runs record the guitar ids' twins.
 */
export function lastRun<R extends { exerciseId: string; endedAt: number; score?: number }>(
  r: Pick<DrillRow, "entry" | "modes" | "key">,
  runs: R[],
): R | undefined {
  const split = r.key.includes(":");
  const ids = new Set(
    split
      ? r.entry.modes
          .filter((m) => r.modes.some((c) => c.id === m.id) || r.modes.length === 0)
          .map((m) => m.exerciseId)
      : [r.entry.exerciseId, ...r.entry.modes.map((m) => m.exerciseId)],
  );
  let best: R | undefined;
  for (const run of runs) {
    const id = run.exerciseId.replace(/^technique\.ukulele\./, "technique.guitar.");
    if (run.score !== undefined && ids.has(id) && (!best || run.endedAt > best.endedAt)) best = run;
  }
  return best;
}

const ear = (...slugs: string[]) => slugs.map((s) => row(`ear-${s}`));

const EAR = "Ear training";

export const DRILL_GROUPS: DrillGroup[] = [
  {
    id: "ear-notes",
    section: EAR,
    title: "Notes and melody",
    note: "Answer by choosing, playing it back, singing, from memory or just listening along.",
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
      "song-loops",
      "bass-lines",
    ),
  },
  { id: "ear-review", section: EAR, title: "Review", rows: ear("mixed") },
  {
    id: "reading",
    title: "Reading and rhythm",
    rows: [row("reading"), row("rhythm"), row("ear-feel")],
  },
  {
    id: "technique",
    title: "Technique",
    rows: [
      row("scales"),
      row("two-hand"),
      part(
        "accompany",
        "patterns",
        "Accompaniment patterns",
        "Pop, ballad, boogie, stride and gospel hand patterns over any chord loop, in any key.",
        ["patterns"],
      ),
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
        "A set-up check, Roland's fingering lessons in order, then scales in every key, crossings over the octave and palm keys and trills.",
        ["calibrate", "fingering", "scales", "register", "trills"],
      ),
      part(
        "aerophone",
        "breath",
        "Aerophone breath and tongue",
        "Long tones at a level, a long-tone scale, swells, tonguing patterns, swing articulation, bite vibrato and landing intervals on a drone.",
        [
          "long-tone",
          "long-scale",
          "swell",
          "articulation",
          "tonguing",
          "swing",
          "vibrato",
          "interval-landing",
        ],
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
      part(
        "pads",
        "beats",
        "Beat making on the pads",
        "Chop a loop onto the pads and play the slices, Note Repeat builds and rolls, and song-form pieces in one take.",
        ["chop", "repeat", "song"],
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
      part(
        "accompany",
        "comping",
        "Comping over changes",
        "Shells or rootless voicings on a comping rhythm through the blues, a ii-V-I or any loop.",
        ["comping"],
      ),
      row("chord-scales"),
      row("licks"),
      row("jam"),
      row("call-response"),
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
  {
    id: "play",
    title: "Phrases and songs",
    rows: [
      row("phrases"),
      part(
        "accompany",
        "lead-sheet",
        "Lead sheets",
        "The melody in the right hand, roots, shells or chords in the left, from a lead sheet or your own score.",
        ["lead-sheet"],
      ),
      row("song-studio"),
      row("by-ear"),
      row("lab"),
    ],
  },
];
