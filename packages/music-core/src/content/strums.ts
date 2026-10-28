// Strum patterns beside the verified ones in data/rhythm-patterns.json: the
// ukulele path's strums (curriculum-2026-10 paths/ukulele.md, rec 3) and the
// guitar's backbeat chuck. Each bar is written as a row of strokes, one
// character a grid step, and expanded to the same events the JSON holds.
import type { RhythmPatternDef } from "../data";
import { parseChordSymbol } from "../theory/chords";

/**
 * A bar of strokes, one character a grid step: D down, U up, X a muted chuck
 * (capitals accented), "-" lets the stroke before ring, "." is a rest.
 */
export function strumPattern(
  id: string,
  label: string,
  opts: { beats: number; perBeat: number; bars: string[]; chords: string[] },
): RhythmPatternDef {
  const { beats, perBeat, chords } = opts;
  const events: RhythmPatternDef["events"] = [];
  const rests: RhythmPatternDef["rests"] = [];
  const STROKE = { d: "down", u: "up", x: "mute" } as const;
  chords.forEach((_, b) => {
    const row = opts.bars[b % opts.bars.length];
    if (row.length !== beats * perBeat)
      throw new Error(`${id}: bar ${b + 1} has ${row.length} steps`);
    const at = (k: number) => b * beats + k / perBeat;
    [...row].forEach((c, k) => {
      const stroke = STROKE[c.toLowerCase() as keyof typeof STROKE];
      if (c === ".") {
        const last = rests.at(-1);
        if (last && Math.abs(last.endBeat - at(k)) < 1e-9) last.endBeat = at(k + 1);
        else rests.push({ startBeat: at(k), endBeat: at(k + 1) });
      }
      if (!stroke) return;
      let end = k + 1;
      while (row[end] === "-") end++;
      events.push({
        id: `${id}-${b + 1}-${k}`,
        beat: at(k),
        voice: "tap",
        accent: c === c.toUpperCase() ? "accent" : "normal",
        stroke,
        durationBeats: (end - k) / perBeat,
      });
    });
  });
  return {
    id,
    label,
    meter: { beats, beatUnit: 4 },
    defaultBars: chords.length,
    events,
    rests,
    chords: chords.map((symbol, b) => ({
      symbol,
      pitchClasses: parseChordSymbol(symbol)!.pcs,
      startBeat: b * beats,
      durationBeats: beats,
    })),
  };
}

const UKE = ["C", "Am", "F", "G"];

export const STRUM_PATTERNS: RhythmPatternDef[] = [
  strumPattern("ukulele-d-du", "Ukulele: D DU D DU (C Am F G)", {
    beats: 4,
    perBeat: 2,
    bars: ["D-dud-du"],
    chords: UKE,
  }),
  strumPattern("ukulele-reggae", "Ukulele: reggae, short strums on the and (C Am F G)", {
    beats: 4,
    perBeat: 2,
    bars: [".d.D.d.D"],
    chords: UKE,
  }),
  strumPattern("ukulele-waltz", "Ukulele: waltz, D DU DU in 3/4 (C F G7 C)", {
    beats: 3,
    perBeat: 2,
    bars: ["D-dudu"],
    chords: ["C", "F", "G7", "C"],
  }),
  // In 6/8 the click is the dotted quarter: two to a bar, three eighths each.
  strumPattern("ukulele-six-eight", "Ukulele: 6/8, D du D du (C Am F G)", {
    beats: 2,
    perBeat: 3,
    bars: ["DduDdu"],
    chords: UKE,
  }),
  strumPattern("ukulele-calypso", "Ukulele: calypso, D DU UDU with the push on 3 and (C F G7 C)", {
    beats: 4,
    perBeat: 2,
    bars: ["D-du-Udu"],
    chords: ["C", "F", "G7", "C"],
  }),
  strumPattern("ukulele-swing", "Ukulele: swing, D then DU DU DU swung (C A7 D7 G7)", {
    beats: 4,
    perBeat: 3,
    bars: ["D--d-ud-ud-u"],
    chords: ["C", "A7", "D7", "G7"],
  }),
  strumPattern("ukulele-triplet", "Ukulele: triplet strum, i down, thumb down, i up (Am E7)", {
    beats: 4,
    perBeat: 3,
    bars: ["DdudduDduddu"],
    chords: ["Am", "Am", "E7", "Am"],
  }),
  strumPattern(
    "ukulele-swing-comp",
    "Ukulele: swing comping, four to the bar, chuck on 2 and 4 (Dm7 G7 Cmaj7)",
    {
      beats: 4,
      perBeat: 1,
      bars: ["dXdX"],
      chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"],
    },
  ),
  strumPattern(
    "ukulele-bossa",
    "Ukulele: bossa, thumb on 1 and 3, fingers off the beat (Dm7 G7 Cmaj7)",
    {
      beats: 4,
      perBeat: 2,
      bars: ["D--ud-u-", "d-u-du--"],
      chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"],
    },
  ),
  strumPattern(
    "ukulele-split-stroke",
    "Ukulele: Formby split stroke, D dU D dU, accent on the up (C A7 D7 G7)",
    {
      beats: 4,
      perBeat: 2,
      bars: ["D-dUD-dU"],
      chords: ["C", "A7", "D7", "G7"],
    },
  ),
  // A study in the RSL Grade 5 manner, not the exam piece: triplets on 1 and 3, D U on 2 and 4.
  strumPattern(
    "ukulele-triple-stroke",
    "Ukulele: triple stroke study, triplets on 1 and 3 (Am Dm E7 Am)",
    {
      beats: 4,
      perBeat: 6,
      bars: ["D-d-u-d--u--D-d-u-d--u--"],
      chords: ["Am", "Dm", "E7", "Am"],
    },
  ),
  strumPattern("ukulele-fan", "Ukulele: fan stroke, a four-finger roll on 1 and 3 (Am E7)", {
    beats: 4,
    perBeat: 4,
    bars: ["Ddddd-u-Ddddd-u-"],
    chords: ["Am", "Am", "E7", "Am"],
  }),
  strumPattern(
    "guitar-backbeat-chuck",
    "Guitar: accents on 2 and 4, a fretting-hand chuck (D C G G)",
    {
      beats: 4,
      perBeat: 2,
      bars: ["duXuduXu"],
      chords: ["D", "C", "G", "G"],
    },
  ),
];
