// The Drills tab, grouped by what you practise; the instrument filter does the
// narrowing. Most rows are a catalog entry; Pads and the Aerophone are split
// by mode into the groups their modes belong to.
import { CATALOG, type CatalogEntry } from "@repo/music-core/content/catalog";
import { SCALE_PATTERNS } from "@repo/music-core/content/technique";
import type { SkillMastery } from "@repo/music-core";
import { SKILL_GRAPH, aggregateMastery } from "@repo/music-core/progress/graph";
import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
import { m } from "@repo/i18n/messages.js";

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

const EAR = m.music_hubs_layout_ear();

export const DRILL_GROUPS: DrillGroup[] = [
  {
    id: "ear-notes",
    section: EAR,
    title: m.music_hubs_layout_notes(),
    note: m.music_hubs_layout_notes_note(),
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
    title: m.music_hubs_layout_chords(),
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
  { id: "ear-review", section: EAR, title: m.music_hubs_layout_review(), rows: ear("mixed") },
  {
    id: "reading",
    title: m.music_hubs_layout_reading(),
    rows: [row("reading"), row("rhythm"), row("ear-feel")],
  },
  {
    id: "technique",
    title: m.music_hubs_layout_technique(),
    rows: [
      row("scales"),
      row("two-hand"),
      part(
        "accompany",
        "patterns",
        m.music_hubs_layout_patterns(),
        m.music_hubs_layout_patterns_blurb(),
        ["patterns"],
      ),
      row("pedal"),
      row("fretboard"),
      row("chords"),
      part(
        "pads",
        "technique",
        m.music_hubs_layout_pad_technique(),
        m.music_hubs_layout_pad_technique_blurb(),
        ["rudiment", "orchestrate", "dynamics"],
      ),
      part(
        "aerophone",
        "fingers",
        m.music_hubs_layout_aero_fingers(),
        m.music_hubs_layout_aero_fingers_blurb(),
        ["calibrate", "fingering", "scales", "register", "trills"],
      ),
      part(
        "aerophone",
        "breath",
        m.music_hubs_layout_aero_breath(),
        m.music_hubs_layout_aero_breath_blurb(),
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
    title: m.music_hubs_layout_grooves(),
    rows: [
      part(
        "pads",
        "grooves",
        m.music_hubs_layout_pad_grooves(),
        m.music_hubs_layout_pad_grooves_blurb(),
        ["groove", "fills", "echo", "ostinato", "steady"],
      ),
      part("pads", "beats", m.music_hubs_layout_beats(), m.music_hubs_layout_beats_blurb(), [
        "chop",
        "repeat",
        "song",
      ]),
      row("strum"),
    ],
  },
  {
    id: "jazz",
    title: m.music_hubs_layout_jazz(),
    rows: [
      row("voicings"),
      row("comping"),
      part(
        "accompany",
        "comping",
        m.music_hubs_layout_comping(),
        m.music_hubs_layout_comping_blurb(),
        ["comping"],
      ),
      row("chord-scales"),
      row("licks"),
      row("jam"),
      row("call-response"),
      part(
        "pads",
        "improvise",
        m.music_hubs_layout_improvise(),
        m.music_hubs_layout_improvise_blurb(),
        ["improvise"],
      ),
    ],
  },
  { id: "theory", title: m.music_hubs_layout_theory(), rows: [row("circle")] },
  { id: "studio", title: m.music_hubs_layout_studio(), rows: [row("listening")] },
  {
    id: "play",
    title: m.music_hubs_layout_play(),
    rows: [
      row("phrases"),
      part(
        "accompany",
        "lead-sheet",
        m.music_hubs_layout_lead_sheets(),
        m.music_hubs_layout_lead_sheets_blurb(),
        ["lead-sheet"],
      ),
      row("song-studio"),
      row("by-ear"),
      row("lab"),
    ],
  },
];
