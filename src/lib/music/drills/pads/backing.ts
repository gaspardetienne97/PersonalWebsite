// A small band to play a groove over, as play-along apps put songs under
// their drum parts: chords by the groove's style (a bar each, cycling) and a
// bass locked to the groove's kick (house bass takes the offbeats). Made from
// chord symbols on the app's own sounds: no recordings.
import type { SequenceNote } from "#lib/music/runtime/index.ts";
import { chordVoicing } from "../jam/backing";

const BY_STYLE: Record<string, { chords: string[]; keys: "e-piano" | "pad" | "synth" }> = {
  Backbeat: { chords: ["G", "D", "Em", "C"], keys: "e-piano" },
  Rock: { chords: ["G", "D", "Em", "C"], keys: "e-piano" },
  "Rock break": { chords: ["Am", "G", "D", "Am"], keys: "e-piano" },
  Independence: { chords: ["G", "D", "Em", "C"], keys: "e-piano" },
  Fill: { chords: ["G", "D", "Em", "C"], keys: "e-piano" },
  Funk: { chords: ["E9"], keys: "e-piano" },
  "Funk break": { chords: ["E9", "E9", "A9", "E9"], keys: "e-piano" },
  "Boom bap": { chords: ["Dm9", "Gm9"], keys: "e-piano" },
  Swing: { chords: ["Dm9", "G13", "Cmaj9", "A7"], keys: "e-piano" },
  Breakbeat: { chords: ["Gm7", "C9"], keys: "e-piano" },
  Reggaeton: { chords: ["Am", "G", "F", "G"], keys: "synth" },
  House: { chords: ["Am7", "Fmaj7", "C", "G"], keys: "pad" },
  Trap: { chords: ["Cm", "Ab", "Fm", "G"], keys: "pad" },
  "Drum and bass": { chords: ["Am9", "Fmaj7"], keys: "pad" },
  Afrobeats: { chords: ["F#m7", "Bm7", "E", "A"], keys: "synth" },
  Afrobeat: { chords: ["Am7", "D9"], keys: "e-piano" },
  Dancehall: { chords: ["Gm", "Eb", "F", "Gm"], keys: "synth" },
  Reggae: { chords: ["Am", "D"], keys: "e-piano" },
  Cumbia: { chords: ["Am", "E7"], keys: "e-piano" },
  "Baile funk": { chords: ["Em", "Em", "C", "D"], keys: "synth" },
  "Bossa nova": { chords: ["Cmaj7", "D7", "Dm7", "G7"], keys: "e-piano" },
  Soca: { chords: ["C", "F", "G", "F"], keys: "synth" },
  Zouk: { chords: ["Am", "Dm", "G", "C"], keys: "synth" },
  Kompa: { chords: ["C", "Am", "F", "G"], keys: "e-piano" },
  Samba: { chords: ["Am7", "D7", "Gmaj7", "E7"], keys: "e-piano" },
  Shuffle: { chords: ["A7", "D7", "A7", "E7"], keys: "e-piano" },
  "Odd meter": { chords: ["Em", "C", "D", "Em"], keys: "e-piano" },
  "Linear funk": { chords: ["E9", "E9", "A9", "E9"], keys: "e-piano" },
  Songo: { chords: ["Cm7", "F7"], keys: "e-piano" },
};

/** The chords a style plays over, a bar each. */
export const backingChords = (style: string) => (BY_STYLE[style] ?? BY_STYLE.Rock).chords;

/**
 * Backing notes for `bars` of a groove at `beatMs` (`perBar` clicks a bar): chords held a bar, the
 * bass on every kick (to the next kick or the bar's end, a beat at most), or
 * on the &s for house; a groove without a kick gets bass on 1 and 3.
 */
export function backingFor(
  style: string,
  targets: readonly { beat: number; voice: string }[],
  bars: number,
  beatMs: number,
  perBar = 4,
): SequenceNote[] {
  const { chords, keys } = BY_STYLE[style] ?? BY_STYLE.Rock;
  const s = (beat: number) => (beat * beatMs) / 1000;
  const out: SequenceNote[] = [];
  const kicks = [
    ...new Set(targets.filter((t) => t.voice === "kick" || t.voice === "808").map((t) => t.beat)),
  ].sort((a, b) => a - b);
  for (let bar = 0; bar < bars; bar++) {
    const v = chordVoicing(chords[bar % chords.length]);
    const start = bar * perBar;
    for (const m of v.upper)
      out.push({
        midi: m,
        time: s(start),
        duration: s(perBar) * 0.95,
        velocity: 0.32,
        sound: keys,
      });
    const hits =
      style === "House"
        ? [0.5, 1.5, 2.5, 3.5].map((b) => start + b)
        : kicks.length
          ? kicks.filter((b) => b >= start - 1e-6 && b < start + perBar - 1e-6)
          : [start, start + 2];
    hits.forEach((b, i) => {
      const next = hits[i + 1] ?? start + perBar;
      out.push({
        midi: v.bass - 12,
        time: s(b),
        duration: s(Math.min(1, next - b)) * 0.9,
        velocity: 0.62,
        sound: "bass",
      });
    });
  }
  return out.sort((a, b) => a.time - b.time);
}
