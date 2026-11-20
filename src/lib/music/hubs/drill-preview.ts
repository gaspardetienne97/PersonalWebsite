// What a drill's link plays, as a picture spec for DrillPreview: the scale on the keys, the chord
// box, the strum's arrows, the groove's first bar. It reads the route and its query, never the
// player's history, so a preview shows the target and nothing else.
import {
  INSTRUMENTS,
  type Instrument,
  noteName,
  parseNote,
  pc,
  showChord,
  showNote,
} from "@repo/music-core";
import { RHYTHM_PATTERNS, MPC_GROOVES, SCALE_DATA, TUNINGS } from "@repo/music-core/data/index";
import { STRUM_PATTERNS } from "@repo/music-core/content/strums";
import { PROGRESSIONS } from "@repo/music-core/content/jam";
import { EAR_CHORD_QUALITIES } from "@repo/music-core/theory/chords";
import { INTERVALS } from "@repo/music-core/theory/intervals";
import { chordShapeById } from "@repo/music-core/theory/fretboard";
import { formatList } from "@repo/i18n/format";
import { m } from "@repo/i18n/messages.js";

export type Stroke = "down" | "up" | "mute";

export type Preview =
  /** Keys from `low` to `high` (MIDI), `notes` marked; `labels` drawn on marked keys. */
  | {
      kind: "keys";
      low: number;
      high: number;
      notes: number[];
      labels?: Record<number, string>;
      caption: string;
    }
  /** A treble or bass staff with up to eight noteheads. */
  | { kind: "staff"; clef: "treble" | "bass"; notes: number[]; caption: string }
  /** One bar on a grid of `steps`: a hit per step index, with a stroke arrow when strummed. */
  | {
      kind: "rhythm";
      steps: number;
      perBeat: number;
      hits: { step: number; accent: boolean; stroke?: Stroke }[];
      chords?: string[];
      caption: string;
    }
  /** A drum groove's first bar, one lane per voice. */
  | {
      kind: "lanes";
      steps: number;
      perBeat: number;
      lanes: { name: string; hits: number[] }[];
      caption: string;
    }
  /** A chord box (string 1 first, null muted). */
  | {
      kind: "chord";
      frets: (number | null)[];
      fingers: (number | null)[];
      name: string;
      caption: string;
    }
  /** A fretboard window, string 1 at the top. */
  | {
      kind: "frets";
      strings: number;
      from: number;
      to: number;
      dots: { string: number; fret: number; label?: string }[];
      caption: string;
    }
  /** A row of chord names or numerals, played in order. */
  | { kind: "changes"; chords: string[]; caption: string }
  | { kind: "pads"; lit: number[]; caption: string }
  | { kind: "circle"; caption: string }
  | { kind: "eq"; caption: string }
  | { kind: "icon" };

const STRINGED = (i?: string): i is "guitar" | "ukulele" => i === "guitar" || i === "ukulele";
const isInstrument = (v: string | null): v is Instrument =>
  !!v && (INSTRUMENTS as readonly string[]).includes(v);

/** A tonic from the query: a MIDI number ("62") or a note name ("F4", "Bb"). */
function tonicOf(raw: string | null, fallback = 60): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 20 && n < 109) return n;
  const pcName = raw.split(/\s+/)[0];
  const m = parseNote(pcName);
  return m === null ? fallback : 60 + pc(m);
}

/** A note as the player reads names (letters or solfège). */
const name = (m: number) => showNote(noteName(m, "flat", false));
/** Several notes, each as the player reads names. */
const names = (...letters: string[]) => letters.map((l) => showNote(l));

const voicingNames = () => {
  const [d, f, a, c] = names("D", "F", "A", "C");
  return { chord: showChord("Dm7"), d, f, a, c };
};
const lickNames = () => {
  const [d, f, a, c] = names("D", "F", "A", "C");
  return { d, f, a, c };
};
const fingerNames = () => {
  const [g, a, b, c] = names("G", "A", "B", "C");
  return { g, a, b, c };
};
const inversionNames = () => {
  const [e, g, c] = names("E", "G", "C");
  return { e, g, c };
};

/** Keys from the C at or below the lowest note, at least an octave, ending on a white key. */
function keysFor(notes: number[], caption: string, labels?: Record<number, string>): Preview {
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  const low = lo - pc(lo);
  let high = Math.max(low + 12, hi + 2);
  if ([1, 3, 6, 8, 10].includes(pc(high))) high += 1;
  return { kind: "keys", low, high: Math.min(high, low + 35), notes, labels, caption };
}

/** Pitch classes on the first frets of a stringed instrument: string 1 first. */
function fretDots(instrument: "guitar" | "ukulele", pcs: number[], from = 0, to = 4) {
  const open = TUNINGS[instrument][0].openStrings;
  const dots: { string: number; fret: number }[] = [];
  open.forEach((o, i) => {
    for (let f = from; f <= to; f++)
      if (pcs.includes(pc(o + f))) dots.push({ string: i + 1, fret: f });
  });
  return { strings: open.length, dots };
}

const CHORD_TONES: Record<string, number[]> = { major: [0, 4, 7], minor: [0, 3, 7] };

/** A scale kind as the captions name it ("natural minor"). */
const SCALE_NAME: Record<string, () => string> = {
  major: m.music_hubs_preview_scale_major,
  "natural-minor": m.music_hubs_preview_scale_natural_minor,
  "harmonic-minor": m.music_hubs_preview_scale_harmonic_minor,
  dorian: m.music_hubs_preview_scale_dorian,
  phrygian: m.music_hubs_preview_scale_phrygian,
  lydian: m.music_hubs_preview_scale_lydian,
  mixolydian: m.music_hubs_preview_scale_mixolydian,
  locrian: m.music_hubs_preview_scale_locrian,
  "melodic-minor": m.music_hubs_preview_scale_melodic_minor,
  "major-pentatonic": m.music_hubs_preview_scale_major_pentatonic,
  "minor-pentatonic": m.music_hubs_preview_scale_minor_pentatonic,
  blues: m.music_hubs_preview_scale_blues,
  altered: m.music_hubs_preview_scale_altered,
  "bebop-major": m.music_hubs_preview_scale_bebop_major,
  "bebop-dominant": m.music_hubs_preview_scale_bebop_dominant,
  "whole-tone": m.music_hubs_preview_scale_whole_tone,
  diminished: m.music_hubs_preview_scale_diminished,
};
/** A scale kind ("natural-minor") named in words: "natural minor". */
export const scaleKindName = (kind: string) => SCALE_NAME[kind]?.() ?? kind.replace(/-/g, " ");

function scalePreview(q: URLSearchParams, instrument: Instrument | undefined): Preview {
  const kind = q.get("kind") ?? "major";
  const steps =
    (SCALE_DATA.semitonesByKind as Record<string, number[]>)[kind] ??
    SCALE_DATA.semitonesByKind.major;
  const tonic = tonicOf(q.get("tonic"));
  const pattern = q.get("pattern");
  const chordy = pattern === "arpeggio" || pattern === "triad-pairs" || pattern === "broken-chords";
  const minor = kind.includes("minor") || q.get("chord") === "minor";
  const offs = chordy ? [...CHORD_TONES[minor ? "minor" : "major"], 12] : steps;
  const what = { tonic: name(tonic), kind: scaleKindName(kind) };
  if (STRINGED(instrument)) {
    const { strings, dots } = fretDots(
      instrument,
      offs.map((o) => pc(tonic + o)),
    );
    return {
      kind: "frets",
      strings,
      from: 0,
      to: 4,
      dots: dots.map((d) => ({ ...d, label: undefined })),
      caption: chordy
        ? m.music_hubs_preview_arpeggio_open(what)
        : m.music_hubs_preview_scale_open(what),
    };
  }
  const notes = offs.map((o) => tonic + o);
  return keysFor(
    notes,
    chordy ? m.music_hubs_preview_arpeggio_octave(what) : m.music_hubs_preview_scale_octave(what),
    { [tonic]: "1" },
  );
}

function rhythmPreview(id: string | null, caption?: string): Preview {
  const all = [...RHYTHM_PATTERNS, ...STRUM_PATTERNS];
  const p = all.find((x) => x.id === id);
  if (!p) {
    return {
      kind: "rhythm",
      steps: 4,
      perBeat: 1,
      hits: [0, 1, 2, 3].map((s) => ({ step: s, accent: s === 0 })),
      caption: caption ?? m.music_hubs_preview_steady_pulse(),
    };
  }
  const beats = p.meter.beats;
  // The finest grid the bar needs, up to sixteenths.
  const first = p.events.filter((e) => e.beat < beats);
  const perBeat = first.some((e) => Math.abs(e.beat * 4 - Math.round(e.beat * 4)) > 1e-6)
    ? 3
    : first.some((e) => Math.abs(e.beat * 2 - Math.round(e.beat * 2)) > 1e-6)
      ? 4
      : first.some((e) => e.beat % 1)
        ? 2
        : 1;
  const hits = first.map((e) => ({
    step: Math.round(e.beat * perBeat),
    accent: e.accent === "accent",
    stroke: e.stroke,
  }));
  const chords = p.chords?.filter((c) => c.startBeat < beats * 4).map((c) => c.symbol);
  return {
    kind: "rhythm",
    steps: beats * perBeat,
    perBeat,
    hits,
    chords,
    // Without the instrument prefix ("Guitar: ", French "Guitare : ").
    caption: caption ?? p.label.replace(/^\p{Lu}\p{Ll}+\s?: /u, ""),
  };
}

function strumPreview(q: URLSearchParams, instrument: "guitar" | "ukulele"): Preview {
  const all = [...RHYTHM_PATTERNS, ...STRUM_PATTERNS];
  const id =
    q.get("pattern") ||
    all.find((p) => p.id.startsWith(`${instrument}-`) && p.meter.beats === 4)?.id ||
    null;
  const r = rhythmPreview(id);
  const prog = PROGRESSIONS.find((p) => p.id === q.get("progression"));
  const chords = prog
    ? prog.chords.slice(0, 4).map((c) => c.symbol)
    : r.kind === "rhythm"
      ? r.chords
      : undefined;
  return r.kind === "rhythm"
    ? {
        ...r,
        chords: chords?.slice(0, 4),
        caption: chords?.length
          ? m.music_hubs_preview_strum_chords({
              chords: chords
                .slice(0, 4)
                .map((c) => showChord(c))
                .join(" "),
            })
          : m.music_hubs_preview_strum_pattern(),
      }
    : r;
}

function chordsPreview(q: URLSearchParams, instrument: "guitar" | "ukulele"): Preview {
  const shape = chordShapeById(
    q.get("shape") ?? `${instrument}.${instrument === "ukulele" ? "c" : "g"}-major`,
  );
  if (!shape) return { kind: "icon" };
  return {
    kind: "chord",
    frets: shape.frets,
    fingers: shape.fingers,
    name: shape.name,
    caption: m.music_hubs_preview_chord_fingers({ name: showChord(shape.name) }),
  };
}

function fretboardPreview(q: URLSearchParams, instrument: "guitar" | "ukulele"): Preview {
  const n = TUNINGS[instrument][0].openStrings.length;
  const mode = q.get("mode") ?? "find";
  if (mode === "spider") {
    const s = n;
    return {
      kind: "frets",
      strings: n,
      from: 1,
      to: 4,
      dots: [1, 2, 3, 4].map((f) => ({ string: s, fret: f, label: String(f) })),
      caption: m.music_hubs_preview_spider(),
    };
  }
  if (mode === "bends")
    return {
      kind: "frets",
      strings: n,
      from: 5,
      to: 8,
      dots: [{ string: Math.min(3, n), fret: 7, label: "↑" }],
      caption: m.music_hubs_preview_bend(),
    };
  const string = Math.min(3, n);
  const open = TUNINGS[instrument][0].openStrings[string - 1];
  return {
    kind: "frets",
    strings: n,
    from: 3,
    to: 7,
    dots: [{ string, fret: 5, label: name(open + 5) }],
    caption: m.music_hubs_preview_find({ note: name(open + 5), string }),
  };
}

function grooveLanes(id: string | null): Preview {
  const g = MPC_GROOVES.catalog.find((x) => x.value === id) ?? MPC_GROOVES.catalog[0];
  const beats = g.beatsPerBar ?? 4;
  const perBeat = 2;
  const voices = [...new Set(g.targets.map((t) => t.voice))];
  const lanes = voices.map((v) => ({
    name: MPC_GROOVES.voices.find((x) => x.id === v)?.name ?? v,
    hits: g.targets
      .filter((t) => t.voice === v && t.beat < beats)
      .map((t) => Math.round(t.beat * perBeat)),
  }));
  return {
    kind: "lanes",
    steps: beats * perBeat,
    perBeat,
    lanes,
    caption: m.music_hubs_preview_first_bar({ groove: g.label }),
  };
}

/**
 * Two notes `semis` apart from a C on a stringed instrument's lower strings: the C on the lowest
 * string that has one by fret 5, the top note on the nearest string within a five-fret window.
 */
export function intervalFrets(instrument: "guitar" | "ukulele", semis: number) {
  const open = TUNINGS[instrument][0].openStrings;
  const n = open.length;
  // String numbers count from 1 at the top; search from the lowest string up.
  let rs = n;
  let rf = 0;
  for (let s = n; s >= 1; s--) {
    const f = (((0 - pc(open[s - 1])) % 12) + 12) % 12;
    if (f <= 5) {
      rs = s;
      rf = f;
      break;
    }
  }
  const root = open[rs - 1] + rf;
  const from = Math.max(0, rf - 1);
  for (let s = rs; s >= 1; s--) {
    const f = root + semis - open[s - 1];
    if (f >= from && f <= from + 4)
      return {
        strings: n,
        from,
        to: from + 4,
        root: { string: rs, fret: rf },
        top: { string: s, fret: f },
      };
  }
  return {
    strings: n,
    from: rf,
    to: rf + semis,
    root: { string: rs, fret: rf },
    top: { string: rs, fret: rf + semis },
  };
}

function intervalPreview(q: URLSearchParams, instrument: Instrument | undefined): Preview {
  const tokens = (q.get("intervals") ?? "P5").split(",");
  const iv = INTERVALS.find((i) => i.token === tokens.at(-1)) ?? INTERVALS[6];
  const top = name(60 + iv.semitones);
  const caption = m.music_hubs_preview_interval({ interval: iv.name, from: name(60), top });
  if (STRINGED(instrument)) {
    const f = intervalFrets(instrument, iv.semitones);
    return {
      kind: "frets",
      strings: f.strings,
      from: f.from,
      to: f.to,
      dots: [
        { ...f.root, label: name(60) },
        { ...f.top, label: top },
      ],
      caption,
    };
  }
  // Both keys named, so the picture says which two notes make the interval.
  return keysFor([60, 60 + iv.semitones], caption, { 60: name(60), [60 + iv.semitones]: top });
}

function qualityPreview(q: URLSearchParams): Preview {
  const tokens = (q.get("qualities") ?? "major,minor").split(",");
  const shown = tokens
    .slice(0, 2)
    .flatMap((t) => EAR_CHORD_QUALITIES.find((c) => c.token === t) ?? []);
  const first = shown[0] ?? EAR_CHORD_QUALITIES[0];
  const notes = first.intervals.map((i) => 60 + i);
  return keysFor(
    notes,
    m.music_hubs_preview_quality({
      qualities: formatList(
        shown.map((s) => s.label),
        "disjunction",
      ),
    }),
  );
}

/**
 * The picture for a drill link. `instrument` is the strip's when the link does not name one.
 * Unknown routes get `{ kind: "icon" }`, and the component draws the area's icon instead.
 */
export function drillPreview(href: string, strip?: Instrument): Preview {
  const u = new URL(href, "http://x");
  const q = u.searchParams;
  const route = u.pathname.replace(/^\/music(\/changes)?/, "");
  const instrument = isInstrument(q.get("instrument"))
    ? (q.get("instrument") as Instrument)
    : strip;
  const strings = STRINGED(instrument) ? instrument : "guitar";

  switch (route) {
    case "/scales":
      return scalePreview(q, instrument);
    case "/two-hand": {
      const t = tonicOf(q.get("tonic"));
      return keysFor(
        [t - 12, t - 8, t - 5, t, t + 2, t + 4, t + 5, t + 7],
        m.music_hubs_preview_two_hand({ tonic: name(t) }),
      );
    }
    case "/voicings":
      return keysFor([62, 65, 69, 72], m.music_hubs_preview_voicing(voicingNames()), {
        62: "R",
        65: "3",
        69: "5",
        72: "7",
      });
    case "/comping":
    case "/accompany":
      return keysFor([48, 52, 58], m.music_hubs_preview_shell(), { 48: "R", 52: "3", 58: "7" });
    case "/pedal":
      return keysFor([48, 60, 64, 67], m.music_hubs_preview_pedal({ c: name(60) }));
    case "/chord-scales":
      return keysFor(
        [62, 64, 65, 67, 69, 71, 72, 74],
        m.music_hubs_preview_chord_scale({ d: name(62), chord: showChord("Dm7") }),
        {
          62: "1",
        },
      );
    case "/licks":
    case "/call-response":
    case "/jam":
      if (route === "/jam" && q.get("progression")) {
        const p = PROGRESSIONS.find((x) => x.id === q.get("progression"));
        if (p)
          return {
            kind: "changes",
            chords: p.chords.slice(0, 4).map((c) => c.symbol),
            caption: `${p.name}, ${showChord(p.key)}`,
          };
      }
      return {
        kind: "staff",
        clef: "treble",
        notes: [62, 65, 69, 72, 71, 67],
        caption:
          route === "/licks" ? m.music_hubs_preview_lick(lickNames()) : m.music_hubs_preview_call(),
      };
    case "/phrases":
      return {
        kind: "staff",
        clef: "treble",
        notes: [60, 60, 67, 67, 69, 69, 67],
        caption: m.music_hubs_preview_phrase(),
      };
    case "/reading": {
      const bass = q.get("clefs") === "bass";
      return bass
        ? {
            kind: "staff",
            clef: "bass",
            notes: [48, 50, 52, 55],
            caption: m.music_hubs_preview_bass_staff(),
          }
        : {
            kind: "staff",
            clef: "treble",
            notes: [60, 62, 64, 67],
            caption: m.music_hubs_preview_staff(),
          };
    }
    case "/aerophone": {
      const mode = q.get("mode") ?? "";
      if (/long|swell|vibrato|interval/.test(mode))
        return {
          kind: "staff",
          clef: "treble",
          notes: [67],
          caption: m.music_hubs_preview_long_tone(),
        };
      return {
        kind: "staff",
        clef: "treble",
        notes: [67, 69, 71, 72],
        caption: m.music_hubs_preview_fingers(fingerNames()),
      };
    }
    case "/rhythm":
      if (q.get("mode") === "dictation")
        return {
          ...(rhythmPreview("eighths") as Extract<Preview, { kind: "rhythm" }>),
          caption: m.music_hubs_preview_dictation(),
        };
      return rhythmPreview(
        q.get("pattern"),
        q.get("pattern") ? undefined : m.music_hubs_preview_tap(),
      );
    case "/strum":
      return strumPreview(q, strings);
    case "/chords":
      return chordsPreview(q, strings);
    case "/fretboard":
      return fretboardPreview(q, strings);
    case "/pads": {
      const mode = q.get("mode") ?? "groove";
      if (["groove", "fills", "echo", "ostinato", "steady"].includes(mode))
        return grooveLanes(q.get("groove") ?? q.get("steady"));
      return {
        kind: "pads",
        lit: [0, 2, 5, 10],
        caption: mode === "chop" ? m.music_hubs_preview_chop() : m.music_hubs_preview_pads(),
      };
    }
    case "/circle":
      return { kind: "circle", caption: m.music_hubs_preview_circle() };
    case "/ear/studio":
      return { kind: "eq", caption: m.music_hubs_preview_eq() };
    case "/ear/intervals":
    case "/ear/interval-compare":
      return intervalPreview(q, instrument);
    case "/ear/chord-qualities":
      return qualityPreview(q);
    case "/ear/inversions":
      return keysFor([64, 67, 72], m.music_hubs_preview_inversion(inversionNames()), { 64: "3" });
    case "/ear/scales":
      return keysFor(
        SCALE_DATA.semitonesByKind.major.map((s) => 60 + s),
        m.music_hubs_preview_ear_scales(),
        { 60: "1" },
      );
    case "/ear/mixed":
      return keysFor([60, 64, 67, 72], m.music_hubs_preview_mixed(), {
        60: "1",
        64: "3",
        67: "5",
      });
    case "/ear/scale-degrees": {
      // The degrees on the keys of C, home numbered 1; the anchor level asks only 1 and 5.
      const major = SCALE_DATA.semitonesByKind.major.filter((x) => x < 12);
      const level = q.get("level");
      const steps =
        level === "anchor" ? [0, 7] : level?.includes("pentachord") ? major.slice(0, 5) : major;
      const notes = steps.map((s) => 60 + s);
      const labels = Object.fromEntries(notes.map((m) => [m, String(major.indexOf(m - 60) + 1)]));
      return keysFor(
        notes,
        steps.length === 2 ? m.music_hubs_preview_anchor() : m.music_hubs_preview_degrees(),
        labels,
      );
    }
    case "/ear/cadences":
    case "/ear/chord-functions":
    case "/ear/progressions":
    case "/ear/song-loops": {
      const fns = q.get("functions")?.split(",").filter(Boolean);
      const chords = fns?.length
        ? fns.slice(0, 4)
        : route === "/ear/cadences"
          ? ["IV", "V", "I"]
          : ["I", "IV", "V", "I"];
      return { kind: "changes", chords, caption: m.music_hubs_preview_numbers() };
    }
    case "/ear/bass-lines":
      return {
        kind: "staff",
        clef: "bass",
        notes: [48, 45, 41, 43],
        caption: m.music_hubs_preview_bass_line(),
      };
    case "/ear/melody-dictation":
    case "/ear/wrong-note":
    case "/ear/repertoire-transfer":
      return {
        kind: "staff",
        clef: "treble",
        notes: [64, 62, 60, 62, 64, 64, 64],
        caption: m.music_hubs_preview_melody(),
      };
    default:
      return { kind: "icon" };
  }
}
