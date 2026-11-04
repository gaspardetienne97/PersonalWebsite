// What a drill's link plays, as a picture spec for DrillPreview: the scale on the keys, the chord
// box, the strum's arrows, the groove's first bar. It reads the route and its query, never the
// player's history, so a preview shows the target and nothing else.
import { INSTRUMENTS, type Instrument, noteName, parseNote, pc } from "@repo/music-core";
import { RHYTHM_PATTERNS, MPC_GROOVES, SCALE_DATA, TUNINGS } from "@repo/music-core/data/index";
import { STRUM_PATTERNS } from "@repo/music-core/content/strums";
import { PROGRESSIONS } from "@repo/music-core/content/jam";
import { EAR_CHORD_QUALITIES } from "@repo/music-core/theory/chords";
import { INTERVALS } from "@repo/music-core/theory/intervals";
import { chordShapeById } from "@repo/music-core/theory/fretboard";

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

const name = (m: number) => noteName(m, "flat", false);

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
  const what = `${name(tonic)} ${kind.replace(/-/g, " ")}${chordy ? " arpeggio" : ""}`;
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
      caption: `${what}, open position`,
    };
  }
  const notes = offs.map((o) => tonic + o);
  return keysFor(notes, `${what}, one octave`, { [tonic]: "1" });
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
      caption: caption ?? "A steady pulse, four beats",
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
    caption: caption ?? p.label.replace(/^[A-Z][a-z]+: /, ""),
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
        caption: `Strum ${(chords ?? []).slice(0, 4).join(" ") || "the pattern"}, down and up`,
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
    caption: `${shape.name}, fingers in their colours`,
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
      caption: "One finger a fret: 1 2 3 4",
    };
  }
  if (mode === "bends")
    return {
      kind: "frets",
      strings: n,
      from: 5,
      to: 8,
      dots: [{ string: Math.min(3, n), fret: 7, label: "↑" }],
      caption: "Bend up to the target pitch",
    };
  const string = Math.min(3, n);
  const open = TUNINGS[instrument][0].openStrings[string - 1];
  return {
    kind: "frets",
    strings: n,
    from: 3,
    to: 7,
    dots: [{ string, fret: 5, label: name(open + 5) }],
    caption: `Find ${name(open + 5)} on string ${string}, fret 5`,
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
    caption: `${g.label}, first bar`,
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
  const caption = `${iv.name}: C up to ${top}`;
  if (STRINGED(instrument)) {
    const f = intervalFrets(instrument, iv.semitones);
    return {
      kind: "frets",
      strings: f.strings,
      from: f.from,
      to: f.to,
      dots: [
        { ...f.root, label: "C" },
        { ...f.top, label: top },
      ],
      caption,
    };
  }
  // Both keys named, so the picture says which two notes make the interval.
  return keysFor([60, 60 + iv.semitones], caption, { 60: "C", [60 + iv.semitones]: top });
}

function qualityPreview(q: URLSearchParams): Preview {
  const tokens = (q.get("qualities") ?? "major,minor").split(",");
  const shown = tokens
    .slice(0, 2)
    .flatMap((t) => EAR_CHORD_QUALITIES.find((c) => c.token === t) ?? []);
  const first = shown[0] ?? EAR_CHORD_QUALITIES[0];
  const notes = first.intervals.map((i) => 60 + i);
  return keysFor(notes, `${shown.map((s) => s.label).join(" or ")}: hear the colour`);
}

/**
 * The picture for a drill link. `instrument` is the strip's when the link does not name one.
 * Unknown routes get `{ kind: "icon" }`, and the component draws the area's icon instead.
 */
export function drillPreview(href: string, strip?: Instrument): Preview {
  const u = new URL(href, "http://x");
  const q = u.searchParams;
  const route = u.pathname.replace(/^\/music/, "");
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
        `${name(t)}: left hand chord, right hand line`,
      );
    }
    case "/voicings":
      return keysFor([62, 65, 69, 72], "Dm7: D F A C, the ii of C", {
        62: "R",
        65: "3",
        69: "5",
        72: "7",
      });
    case "/comping":
    case "/accompany":
      return keysFor([48, 52, 58], "C7 shell: root, 3rd and 7th", { 48: "R", 52: "3", 58: "7" });
    case "/pedal":
      return keysFor([48, 60, 64, 67], "Hold C, change the pedal with the chord");
    case "/chord-scales":
      return keysFor([62, 64, 65, 67, 69, 71, 72, 74], "D dorian over Dm7", { 62: "1" });
    case "/licks":
    case "/call-response":
    case "/jam":
      if (route === "/jam" && q.get("progression")) {
        const p = PROGRESSIONS.find((x) => x.id === q.get("progression"));
        if (p)
          return {
            kind: "changes",
            chords: p.chords.slice(0, 4).map((c) => c.symbol),
            caption: `${p.name}, ${p.key}`,
          };
      }
      return {
        kind: "staff",
        clef: "treble",
        notes: [62, 65, 69, 72, 71, 67],
        caption:
          route === "/licks" ? "A ii-V line: D F A C into the V" : "Hear a phrase, play an answer",
      };
    case "/phrases":
      return {
        kind: "staff",
        clef: "treble",
        notes: [60, 60, 67, 67, 69, 69, 67],
        caption: "A short phrase, read and played",
      };
    case "/reading": {
      const bass = q.get("clefs") === "bass";
      return bass
        ? {
            kind: "staff",
            clef: "bass",
            notes: [48, 50, 52, 55],
            caption: "Name each note on the bass staff",
          }
        : {
            kind: "staff",
            clef: "treble",
            notes: [60, 62, 64, 67],
            caption: "Name each note on the staff",
          };
    }
    case "/aerophone": {
      const mode = q.get("mode") ?? "";
      if (/long|swell|vibrato|interval/.test(mode))
        return { kind: "staff", clef: "treble", notes: [67], caption: "One long, steady tone" };
      return {
        kind: "staff",
        clef: "treble",
        notes: [67, 69, 71, 72],
        caption: "G A B C under the fingers",
      };
    }
    case "/rhythm":
      if (q.get("mode") === "dictation")
        return {
          ...(rhythmPreview("eighths") as Extract<Preview, { kind: "rhythm" }>),
          caption: "Hear a bar, write its rhythm",
        };
      return rhythmPreview(
        q.get("pattern"),
        q.get("pattern") ? undefined : "Tap with a steady pulse",
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
        caption:
          mode === "chop" ? "A loop chopped onto the pads" : "Sixteen pads, the ones to play lit",
      };
    }
    case "/circle":
      return { kind: "circle", caption: "Keys a fifth apart, round the circle" };
    case "/listening":
      return { kind: "eq", caption: "One band boosted: hear where it is" };
    case "/ear/intervals":
    case "/ear/interval-compare":
      return intervalPreview(q, instrument);
    case "/ear/chord-qualities":
      return qualityPreview(q);
    case "/ear/inversions":
      return keysFor([64, 67, 72], "First inversion: E G C, the 3rd in the bass", { 64: "3" });
    case "/ear/scales":
      return keysFor(
        SCALE_DATA.semitonesByKind.major.map((s) => 60 + s),
        "Major or minor: hear the scale",
        { 60: "1" },
      );
    case "/ear/mixed":
      return keysFor([60, 64, 67, 72], "A mixed review of what you hear: notes against home", {
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
        steps.length === 2
          ? "The home note (do, 1) and 5"
          : "Each note heard against the home note (do, 1)",
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
      return { kind: "changes", chords, caption: "Name the chords by number" };
    }
    case "/ear/bass-lines":
      return {
        kind: "staff",
        clef: "bass",
        notes: [48, 45, 41, 43],
        caption: "Hear the bass line, write it",
      };
    case "/ear/melody-dictation":
    case "/ear/wrong-note":
    case "/ear/repertoire-transfer":
      return {
        kind: "staff",
        clef: "treble",
        notes: [64, 62, 60, 62, 64, 64, 64],
        caption: "Hear a melody, find its notes",
      };
    default:
      return { kind: "icon" };
  }
}
