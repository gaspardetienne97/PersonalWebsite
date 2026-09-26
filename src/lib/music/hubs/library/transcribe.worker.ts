// Transcription off the main thread, so a long song never freezes the page.
// "chords": Spotify's Basic Pitch model (polyphonic, any instrument), run
// with TensorFlow.js; its raw output is kept so a new sensitivity only redoes
// the cheap note-picking step. "melody": the app's own one-note-at-a-time
// detector. Both answer with heard notes in seconds.
import * as tf from "@tensorflow/tfjs";
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch";
import { transcribe } from "@repo/music-core/signal/transcribe";
import modelUrl from "@spotify/basic-pitch/model/model.json?url";
import weightsUrl from "@spotify/basic-pitch/model/group1-shard1of1.bin?url";
import type { HeardNote } from "./transcription";

export type WorkerIn =
  | {
      type: "run";
      engine: "chords" | "melody";
      samples: Float32Array;
      sampleRate: number;
      sensitivity: number;
    }
  | { type: "renote"; sensitivity: number };
export type WorkerOut =
  | { type: "progress"; value: number }
  | { type: "notes"; notes: HeardNote[]; backend: string }
  | { type: "error"; message: string };

const post = (m: WorkerOut) => postMessage(m);
let last: { frames: number[][]; onsets: number[][] } | null = null;
let model: BasicPitch | null = null;
let backend = "";

async function ready() {
  if (model) return model;
  // The GPU when the browser lets a worker have it, else the CPU (slower, same notes).
  for (const b of ["webgl", "cpu"]) {
    try {
      if (await tf.setBackend(b)) {
        await tf.ready();
        backend = b;
        break;
      }
    } catch {
      /* try the next one */
    }
  }
  model = new BasicPitch(
    tf.loadGraphModel(modelUrl, { weightUrlConverter: async () => weightsUrl }),
  );
  return model;
}

/** 0 = only clear notes, 1 = everything faint too. Defaults sit near the model's own (0.5, 0.3). */
function pick(sensitivity: number): HeardNote[] {
  if (!last) return [];
  const s = Math.min(1, Math.max(0, sensitivity));
  const events = outputToNotesPoly(
    last.frames,
    last.onsets,
    0.7 - 0.4 * s,
    0.45 - 0.3 * s,
    Math.round(11 - 6 * s),
    true,
    null,
    null,
    true,
  );
  return noteFramesToTime(events).map((n) => ({
    midi: n.pitchMidi,
    start: n.startTimeSeconds,
    duration: n.durationSeconds,
    amplitude: n.amplitude,
  }));
}

onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  try {
    if (m.type === "renote") return post({ type: "notes", notes: pick(m.sensitivity), backend });
    if (m.engine === "melody") {
      // At 60 BPM a beat is a second, so the draft's beats are the heard seconds.
      const score = transcribe(m.samples, m.sampleRate, { bpm: 60 });
      const notes = score.voices[0].notes.map((n) => ({
        midi: n.midi,
        start: n.startBeat,
        duration: n.durationBeats,
        amplitude: 0.8,
      }));
      return post({ type: "notes", notes, backend: "melody" });
    }
    const bp = await ready();
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await bp.evaluateModel(
      m.samples,
      (f, o) => {
        frames.push(...f);
        onsets.push(...o);
      },
      (p) => post({ type: "progress", value: p }),
    );
    last = { frames, onsets };
    post({ type: "notes", notes: pick(m.sensitivity), backend });
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err) });
  }
};
