// Standard MIDI file <-> canonical score, through @tonejs/midi.
// Beats are quarter notes (MIDI ticks / PPQ).
import { Midi } from "@tonejs/midi";
import type { Score, ScoreNote, ScoreVoice } from "../types";
import { m } from "@repo/i18n/messages.js";

const FIFTHS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function scoreToMidi(score: Score): Uint8Array {
  const midi = new Midi();
  const ppq = midi.header.ppq;
  midi.header.name = score.title;
  midi.header.setTempo(score.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [score.meter.beats, score.meter.beatUnit],
  });
  // tonejs names the key by its fifths position (its "key" is the major name for any mode).
  if (score.keyFifths !== undefined)
    midi.header.keySignatures.push({
      ticks: 0,
      key: FIFTHS[score.keyFifths + 7],
      scale: score.keyMode ?? "major",
    });
  score.voices.forEach((voice, i) => {
    const track = midi.addTrack();
    track.name = voice.name;
    // Drums on channel 10; melodic voices kept off it.
    track.channel = voice.drums ? 9 : i % 16 === 9 ? (i + 1) % 16 : i % 16;
    // A tie continuation extends the note it continues rather than re-striking it.
    const merged: ScoreNote[] = [];
    for (const n of [...voice.notes].sort((a, b) => a.startBeat - b.startBeat)) {
      const prev = n.tieFrom ? merged.findLast((m) => m.midi === n.midi) : undefined;
      if (prev) prev.durationBeats = n.startBeat + n.durationBeats - prev.startBeat;
      else merged.push({ ...n });
    }
    for (const n of merged)
      track.addNote({
        midi: n.midi,
        ticks: Math.round(n.startBeat * ppq),
        durationTicks: Math.max(1, Math.round(n.durationBeats * ppq)),
        velocity: n.velocity ?? 0.8,
      });
  });
  const bytes = midi.toArray();
  // @tonejs/midi 2.0.28 encodes the key-signature byte as index + 7 instead of
  // index - 7; patch the sf byte of FF 59 02 <sf> <mi> to the real fifths.
  if (score.keyFifths !== undefined)
    for (let i = 0; i + 4 < bytes.length; i++)
      if (bytes[i] === 0xff && bytes[i + 1] === 0x59 && bytes[i + 2] === 0x02) {
        bytes[i + 3] = score.keyFifths & 0xff;
        break;
      }
  return bytes;
}

/** One voice per track (tonejs already splits tracks by channel and program). */
export function midiToScore(bytes: Uint8Array, title: string): Score {
  const midi = new Midi(bytes);
  const ppq = midi.header.ppq;
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const key = midi.header.keySignatures[0];
  const voices: ScoreVoice[] = midi.tracks
    .filter((t) => t.notes.length)
    .map((t, i) => {
      const notes: ScoreNote[] = t.notes.map((n) => ({
        midi: n.midi,
        startBeat: round3(n.ticks / ppq),
        durationBeats: round3(n.durationTicks / ppq),
        velocity: n.velocity,
      }));
      const avg = notes.reduce((s, n) => s + n.midi, 0) / notes.length;
      const drums = t.channel === 9;
      return {
        id: `track-${i + 1}-ch${t.channel + 1}`,
        name:
          t.name ||
          (drums ? m.music_content_midi_file_drums() : t.instrument.name) ||
          m.music_content_midi_file_track({ n: i + 1 }),
        ...(drums ? { drums } : { clef: avg < 60 ? ("bass" as const) : ("treble" as const) }),
        notes,
      };
    });
  const end = Math.max(
    0,
    ...voices.flatMap((v) => v.notes.map((n) => n.startBeat + n.durationBeats)),
  );
  const bar = (ts[0] * 4) / ts[1];
  return {
    id: crypto.randomUUID(),
    title: midi.header.name || title,
    bpm: Math.round(midi.header.tempos[0]?.bpm ?? 120),
    meter: { beats: ts[0], beatUnit: ts[1] },
    ...(key && {
      keyFifths: FIFTHS.indexOf(key.key) - 7,
      keyMode: key.scale === "minor" ? ("minor" as const) : ("major" as const),
    }),
    voices,
    lengthBeats: Math.max(bar, Math.ceil(round3(end / bar)) * bar),
    source: { kind: "midi" },
  };
}
