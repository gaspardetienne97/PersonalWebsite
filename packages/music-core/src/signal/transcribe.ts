// Offline monophonic transcription: decoded mono audio -> a draft canonical
// score. Pitch per frame from analyzePitch, attacks from the onset detector,
// then the catalog's cleanup (4.11). Monophonic only: a chord comes out as
// whichever note the detector locks onto, frame by frame.
import type { Score, ScoreNote } from "../types";
import { createInputFilter } from "./biquad";
import { createOnsetDetector } from "./onset";
import { analyzePitch, FRAME_SIZE, SILENCE_RMS, WIDE_FRAME_SIZE } from "./pitch";

export const CONFIDENCE_FLOOR = 0.25;
export const MIN_NOTE_S = 0.05;
export const MERGE_GAP_S = 0.08;
const HOP = 1024;

interface Draft {
  midi: number;
  start: number;
  end: number;
  clarity: number[];
  /** Began on a detected attack, so it is a new note, not a fragment. */
  attack: boolean;
}

function rms(buf: Float32Array) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function transcribe(
  samples: Float32Array,
  sampleRate: number,
  opts: { bpm?: number; title?: string; a4?: number } = {},
): Score {
  const x = samples.slice();
  createInputFilter(sampleRate).processBlock(x);
  const hopS = HOP / sampleRate;

  const onsets: number[] = [];
  const detector = createOnsetDetector(sampleRate);
  for (let i = 0; i + HOP <= x.length; i += HOP) {
    const o = detector.push(x.subarray(i, i + HOP), (i / sampleRate) * 1000);
    if (o) onsets.push(o.at / 1000);
  }

  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  let lastT = -Infinity;
  for (let end = FRAME_SIZE; end <= x.length; end += HOP) {
    const t = (end - FRAME_SIZE / 2) / sampleRate; // frame centre
    const wide = end >= WIDE_FRAME_SIZE ? x.subarray(end - WIDE_FRAME_SIZE, end) : undefined;
    // NSDF is normalised, so a window that is mostly silence still reads clearly.
    // Only count a frame whose centre hop is actually sounding, or every note
    // would grow by most of a window.
    const r =
      rms(x.subarray(end - FRAME_SIZE / 2 - HOP / 2, end - FRAME_SIZE / 2 + HOP / 2)) < SILENCE_RMS
        ? null
        : analyzePitch(x.subarray(end - FRAME_SIZE, end), sampleRate, wide, opts.a4);
    const onset = onsets.find((o) => o > lastT && o <= t);
    const reattack = cur && onset !== undefined && onset - cur.start >= MIN_NOTE_S;
    if (!r || !cur || r.midi !== cur.midi || t - lastT > hopS * 1.5 || reattack) {
      if (cur) drafts.push(cur);
      cur = null;
      if (r) {
        // Snap the start to an attack heard up to two hops before this frame.
        const near = onsets.find((o) => o >= t - 2 * hopS && o <= t + hopS / 2);
        cur = {
          midi: r.midi,
          start: near ?? t - hopS / 2,
          end: t,
          clarity: [],
          attack: near !== undefined,
        };
      }
    }
    if (cur && r) {
      cur.end = t + hopS / 2;
      cur.clarity.push(r.clarity);
    }
    lastT = t;
  }
  if (cur) drafts.push(cur);

  const kept = drafts
    .filter((d) => d.clarity.reduce((a, b) => a + b, 0) / d.clarity.length >= CONFIDENCE_FLOOR)
    .filter((d) => d.end - d.start >= MIN_NOTE_S)
    .sort((a, b) => a.start - b.start);
  const merged: Draft[] = [];
  for (const d of kept) {
    const last = merged.at(-1);
    // A same-pitch piece that starts on a real attack is a repeated note, not a fragment.
    if (last && last.midi === d.midi && d.start - last.end < MERGE_GAP_S && !d.attack)
      last.end = Math.max(last.end, d.end);
    else merged.push({ ...d });
  }

  const bpm = opts.bpm ?? 120;
  const beats = (s: number) => Math.round(((s * bpm) / 60) * 1000) / 1000;
  const notes: ScoreNote[] = merged.map((d) => ({
    midi: d.midi,
    startBeat: beats(d.start),
    durationBeats: beats(d.end - d.start),
  }));
  const endBeat = Math.max(0, ...notes.map((n) => n.startBeat + n.durationBeats));
  return {
    id: crypto.randomUUID(),
    title: opts.title ?? "Transcription",
    bpm,
    meter: { beats: 4, beatUnit: 4 },
    voices: [{ id: "melody", name: "Transcription", notes }],
    lengthBeats: Math.max(4, Math.ceil(endBeat / 4) * 4),
    source: { kind: "transcribed" },
  };
}
