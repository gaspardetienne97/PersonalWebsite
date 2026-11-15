// The app's live microphone path, replayed over a recording.
//
// Mirrors src/lib/music/runtime/mic.svelte.ts line for line: the capture
// worklet (128-sample blocks, follow the louder of two channels with a 6 dB
// margin, 40 Hz high-pass, contiguous 2048-sample frames plus a 4096 "wide"
// window), then onFrame (pitch with the 0.6 clarity floor, the onset detector,
// the two-frame note tracker with re-strikes). And the three things drills do
// with frames: ChordListener (drills/guitar/strum.svelte.ts), the rhythm
// page's chord read at a strum (routes/music/rhythm/+page.svelte), and the pitch
// trace. Times are milliseconds from the start of the file.
export const FRAME = 2048;
export const WIDE = 4096;
const STABLE_FRAMES = 2;
const SILENT_FRAMES = 2;
const RESTRIKE_MS = 120;
const BLOCK = 128;
const HISTORY_MS = 2500;

const rmsOf = (buf) => {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
};

export function simulateLive(channels, sr, sig, a4 = 440) {
  const hp = sig.createHighPass(sr, 40);
  const onsets = sig.createOnsetDetector(sr);
  const frameMs = (FRAME / sr) * 1000;
  const frames = [];
  const events = [];
  const switches = [];
  let chan = 0;
  const energy = [0, 0];
  let frame = new Float32Array(FRAME);
  let prev = new Float32Array(FRAME);
  let n = 0;

  let candidate;
  let candidateAt = 0;
  let candidateRun = 0;
  let silentRun = 0;
  let sounding;
  let soundingAt = 0;
  let restrike = null;
  const noteOff = (at) => {
    if (sounding === undefined) return;
    events.push({ kind: "noteoff", midi: sounding, at });
    sounding = undefined;
  };
  const noteOn = (heard, at) => {
    noteOff(at);
    sounding = heard.midi;
    soundingAt = at;
    events.push({
      kind: "noteon",
      midi: heard.midi,
      at,
      cents: heard.cents,
      clarity: heard.clarity,
    });
  };

  function onFrame(f, wide, at) {
    const p = sig.analyzePitch(f, sr, wide, a4);
    const heard = p && p.clarity >= sig.TUNER_CLARITY_FLOOR ? p : null;
    const onset = onsets.push(f, at);
    if (onset)
      events.push({ kind: "onset", at: onset.at, strength: onset.strength, midi: heard?.midi });

    if (onset && heard && sounding === heard.midi && onset.at - soundingAt > RESTRIKE_MS)
      restrike = { at: onset.at, midi: heard.midi, frames: 0 };
    else if (restrike) {
      if (heard?.midi !== restrike.midi) restrike = null;
      else if (++restrike.frames >= STABLE_FRAMES) {
        noteOn(heard, restrike.at);
        restrike = null;
      }
    }
    if (heard) {
      silentRun = 0;
      if (heard.midi === candidate) candidateRun++;
      else {
        candidate = heard.midi;
        candidateAt = at;
        candidateRun = 1;
      }
      if (candidateRun >= STABLE_FRAMES && sounding !== heard.midi) noteOn(heard, candidateAt);
    } else {
      candidate = undefined;
      candidateRun = 0;
      if (++silentRun >= SILENT_FRAMES) noteOff(at);
    }
    const rms = rmsOf(f);
    frames.push({
      at,
      frame: f,
      wide,
      sampleRate: sr,
      pitch: heard && {
        midi: heard.midi,
        cents: heard.cents,
        hz: heard.hz,
        clarity: heard.clarity,
      },
      raw: p && { midi: p.midi, clarity: p.clarity },
      rms,
      db: sig.rmsDb(f),
      onsetAt: onset?.at,
    });
  }

  const len = channels[0].length;
  for (let b = 0; b + BLOCK <= len; b += BLOCK) {
    if (channels.length > 1) {
      for (let c = 0; c < 2; c++) {
        const x = channels[c];
        let e = 0;
        for (let i = b; i < b + BLOCK; i++) e += x[i] * x[i];
        energy[c] = energy[c] * 0.995 + e;
      }
      const other = 1 - chan;
      if (energy[other] > energy[chan] * 4) {
        chan = other;
        switches.push({ at: (b / sr) * 1000, to: chan });
      }
    }
    const ch = channels[Math.min(chan, channels.length - 1)];
    for (let i = 0; i < BLOCK; i++) {
      frame[n++] = hp.process(ch[b + i]);
      if (n === FRAME) {
        const wide = new Float32Array(WIDE);
        wide.set(prev, 0);
        wide.set(frame, FRAME);
        prev = frame;
        onFrame(frame, wide, ((b + i + 1 - FRAME) / sr) * 1000);
        frame = new Float32Array(FRAME);
        n = 0;
      }
    }
  }
  return { frames, events, switches, frameMs, sampleRate: sr };
}

/** ChordListener.#read: the 600 ms from `from`, cut to the sample, through the chord reader. */
function readChord(frames, from, sig) {
  const frameMs = frames.length ? (frames[0].frame.length / frames[0].sampleRate) * 1000 : 0;
  const win = frames.filter((f) => f.at + frameMs > from && f.at < from + sig.CHORD_WINDOW_MS);
  const r = sig.readChord(
    sig.framesWindow(win, from, sig.CHORD_WINDOW_MS),
    win[0]?.sampleRate ?? 48000,
  );
  return { at: from, pcs: r.pcs, chroma: r.chroma, quiet: r.quiet };
}

/** One reading per audio onset (the 600 ms from it), as ChordListener hands to onStrum. */
export function strumReadings(sim, sig) {
  const { frames, frameMs } = sim;
  const last = frames[frames.length - 1];
  const out = [];
  for (const e of sim.events) {
    if (e.kind !== "onset") continue;
    // The live listener waits for the window to fill; a strum too close to the end never reads.
    if (!last || last.at + frameMs < e.at + sig.CHORD_WINDOW_MS) continue;
    out.push(readChord(frames, e.at, sig));
  }
  return out;
}

/** The "Hearing" readout: every fourth frame, the last 600 ms (of the 2.5 s the listener keeps). */
export function liveReadouts(sim, sig) {
  const { frames, frameMs } = sim;
  const out = [];
  for (let i = 3; i < frames.length; i += 4) {
    const end = frames[i].at + frameMs;
    const kept = frames.slice(Math.max(0, i - 63), i + 1);
    out.push({
      ...readChord(
        kept.filter((x) => frames[i].at - x.at <= HISTORY_MS),
        end - sig.CHORD_WINDOW_MS,
        sig,
      ),
      end,
    });
  }
  return out;
}

/** The rhythm page keeps 24 frames and reads a strum from the 400 ms after its attack. */
const RHYTHM_READ_MS = 400;
const RHYTHM_FRAME_MS = 45;
const RHYTHM_RING = 24;

/**
 * The rhythm page at a strum: once 400 ms and two frames have passed since the
 * onset was delivered, the chord reader over the 400 ms from the attack, out
 * of the last 24 frames. Null is "no tones" (the page counts that as a muted
 * stroke). A strum too close to the end is read from what arrived, if 150 ms did.
 */
export function rhythmReadings(sim, sig) {
  const { frames, frameMs } = sim;
  const out = [];
  frames.forEach((f, i) => {
    if (f.onsetAt === undefined) return;
    // The onset is delivered with frame i; the timer fires this long after.
    const firesAt = f.at + frameMs + RHYTHM_READ_MS + 2 * RHYTHM_FRAME_MS;
    let j = i;
    while (j + 1 < frames.length && frames[j + 1].at + frameMs <= firesAt) j++;
    const ring = frames.slice(Math.max(0, j + 1 - RHYTHM_RING), j + 1);
    const buf = sig.framesWindow(ring, f.onsetAt, RHYTHM_READ_MS);
    let pcs = null;
    if (buf.length >= sim.sampleRate * 0.15) {
      const r = sig.readChord(buf, sim.sampleRate);
      if (r.pcs.length) pcs = r.pcs;
    }
    out.push({ at: f.onsetAt, pcs });
  });
  return out;
}
