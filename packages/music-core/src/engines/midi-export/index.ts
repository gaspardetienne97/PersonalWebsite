/**
 * MIDI export — render a canonical {@link Score} to a Standard MIDI File. The
 * inverse of `score-import/parseMidiScore`: beats become ticks (quarter-note =
 * ppq), each voice becomes a track, and the first tempo marker sets the file
 * tempo. Reuses the already-installed `@tonejs/midi` writer; no new dependency.
 *
 * ponytail: emits the starting tempo only (the common case for DAW import) and
 * no time-signature meta event — `@tonejs/midi` 2.x exposes no setter for it.
 */

// @tonejs/midi is CJS: under Node/SSR ESM a named `import { Midi }` is not
// statically resolvable and 500s the SSR of routes that import this engine.
// Resolve the class via namespace + default interop (mirrors engines/import).
import * as TonejsMidi from "@tonejs/midi";

import type { Score } from "@repo/music-core/domain";

const Midi: typeof TonejsMidi.Midi =
  (TonejsMidi as { Midi?: typeof TonejsMidi.Midi }).Midi ??
  (TonejsMidi as unknown as { default: { Midi: typeof TonejsMidi.Midi } }).default.Midi;

export function scoreToMidiFile(score: Score): Uint8Array<ArrayBuffer> {
  const midi = new Midi();
  if (score.title) midi.name = score.title;

  const ppq = midi.header.ppq;
  midi.header.setTempo(score.tempoMap[0]?.bpm ?? 120);

  const voices =
    score.voices.length > 0 ? score.voices : [{ id: "", name: "Track", role: "other" }];
  const trackByVoice = new Map<string, ReturnType<TonejsMidi.Midi["addTrack"]>>();
  for (const voice of voices) {
    const track = midi.addTrack();
    track.name = voice.name;
    trackByVoice.set(voice.id, track);
  }
  const fallbackTrack = trackByVoice.values().next().value!;

  for (const note of score.notes) {
    const track = trackByVoice.get(note.voiceId) ?? fallbackTrack;
    track.addNote({
      midi: note.midiNote,
      ticks: Math.round(note.startBeat * ppq),
      durationTicks: Math.max(1, Math.round(note.durationBeats * ppq)),
      velocity: clamp01(note.velocity),
    });
  }

  return new Uint8Array(midi.toArray());
}

export function scoreToMidiBlob(score: Score): Blob {
  return new Blob([scoreToMidiFile(score)], { type: "audio/midi" });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
