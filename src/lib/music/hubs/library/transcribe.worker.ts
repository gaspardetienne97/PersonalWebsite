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

// TensorFlow.js 3 waits on the GPU with `if (!window || ...)`, which throws in
// a worker (no `window` there), so a GPU run hung at 0%. Declared but empty,
// it takes its plain setTimeout path.
(globalThis as { window?: unknown }).window = undefined;

// Anything thrown outside a message handler (a GPU callback, say) still
// reaches the page, so it shows an error instead of waiting forever.
addEventListener("error", (e) =>
  post({ type: "error", message: (e as ErrorEvent).message || "The transcriber stopped." }),
);
addEventListener("unhandledrejection", (e) =>
  post({
    type: "error",
    message: String(
      (e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason,
    ),
  }),
);
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Onset and frame thresholds and the shortest note (frames) at a sensitivity. */
function thresholds(sensitivity: number): [number, number, number] {
  const s = Math.min(1, Math.max(0, sensitivity));
  // 0 = only clear notes, 1 = everything faint too. The middle was tuned on a
  // real piano recording against its MIDI: 87% of the notes kept are right and
  // 88% of the notes are found. The model's own defaults (0.5, 0.3, 5) sit near
  // 1 and double the note count with overtones and re-struck held notes.
  return s <= 0.5
    ? [lerp(0.8, 0.66, s * 2), lerp(0.5, 0.42, s * 2), Math.round(lerp(12, 10, s * 2))]
    : [
        lerp(0.66, 0.45, s * 2 - 1),
        lerp(0.42, 0.28, s * 2 - 1),
        Math.round(lerp(10, 6, s * 2 - 1)),
      ];
}

function pick(sensitivity: number): HeardNote[] {
  if (!last) return [];
  const [onset, frame, minLen] = thresholds(sensitivity);
  const events = outputToNotesPoly(
    last.frames,
    last.onsets,
    onset,
    frame,
    minLen,
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
