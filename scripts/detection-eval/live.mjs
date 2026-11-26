// The app's live microphone path, replayed over a recording.
//
// The capture worklet is mirrored here line for line from
// src/lib/music/runtime/mic.svelte.ts: 128-sample blocks, follow the louder of
// two channels with a 6 dB margin, the input filter (a 60 Hz high-pass and the
// two mains notches), contiguous 2048-sample frames. Everything after the
// worklet is not mirrored but shared: the app and this replay both run the
// listener in packages/music-core/src/signal/listen.ts (the app's own click
// taken out, the level gate, pitch, onsets, the note tracker). On the two clips
// recorded with the metronome through the speakers the listener is given the
// click schedule the app would have had, rebuilt from the take (clickSchedule).
// And the three things drills do with frames: ChordListener
// (drills/guitar/strum.svelte.ts), the rhythm page's chord read at a strum
// (routes/music/rhythm/+page.svelte), and the pitch trace. Times are
// milliseconds from the start of the file.
export const FRAME = 2048;
const BLOCK = 128;
const HISTORY_MS = 2500;

/** Power of `hz` in x[from, from + n) (Goertzel). */
function tonePower(x, sr, hz, from, n) {
  const c = 2 * Math.cos((2 * Math.PI * hz) / sr);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < from + n; i++) {
    const s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

/**
 * The clicks the app would have known about on a take recorded with its
 * metronome through the speakers. The app knows when it scheduled each click
 * and which are accents; the take does not say, so the schedule is rebuilt from
 * the take: the first click is found by its own tone, the rest follow at the
 * tempo, and the bar's phase (which click in four is the accent) is the one
 * that fits the accent tone best. Each click is then expected `leadMs` before
 * it is actually heard, standing in for the input latency and the trip through
 * the room that the app cannot know, so the replay does not get a better
 * schedule than the app has. Times in ms from the start of the file.
 */
export function clickSchedule(channels, sr, bpm, sig, { leadMs = 60, beatsPerBar = 4 } = {}) {
  const x = channels[0];
  const hop = 256;
  const tone = (hz) => {
    const out = [];
    for (let i = 0; i + hop <= x.length; i += hop) out.push(tonePower(x, sr, hz, i, hop));
    return out;
  };
  const beat = tone(sig.CLICK_HZ.beat);
  const accent = tone(sig.CLICK_HZ.accent);
  const both = beat.map((v, i) => v + accent[i]);
  const top = both.reduce((a, b) => Math.max(a, b), 0);
  const first = both.findIndex((v) => v >= 0.1 * top);
  if (first < 0 || top <= 0) return [];
  const period = 60000 / bpm;
  const hopMs = (hop / sr) * 1000;
  const times = [];
  for (let t = first * hopMs; t < (x.length / sr) * 1000; t += period) times.push(t);
  // How much of each click is the accent tone, over the 60 ms from its start.
  const share = times.map((t) => {
    const i = Math.round(t / hopMs);
    const span = Math.ceil(60 / hopMs);
    let a = 0;
    let b = 0;
    for (let j = i; j < i + span && j < both.length; j++) {
      a += accent[j];
      b += beat[j];
    }
    return a / (a + b || 1);
  });
  let phase = 0;
  let best = -1;
  for (let p = 0; p < beatsPerBar; p++) {
    const mine = share.filter((_, k) => k % beatsPerBar === p);
    const m = mine.reduce((u, v) => u + v, 0) / (mine.length || 1);
    if (m > best) [best, phase] = [m, p];
  }
  return times.map((t, k) => ({
    at: t - leadMs,
    hz: k % beatsPerBar === phase ? sig.CLICK_HZ.accent : sig.CLICK_HZ.beat,
  }));
}

export function simulateLive(channels, sr, sig, a4 = 440, { clicks } = {}) {
  const hp = sig.createInputFilter(sr);
  const frameMs = (FRAME / sr) * 1000;
  const frames = [];
  const events = [];
  const switches = [];
  let chan = 0;
  const energy = [0, 0];
  let frame = new Float32Array(FRAME);
  let n = 0;

  // Everything after the worklet is the app's own listener (signal/listen.ts).
  const listener = sig.createListener(sr);
  function onFrame(raw, at) {
    // `emitted`: when the app learns of it (the end of the frame that was pushed).
    const emitted = at + frameMs;
    for (const h of listener.push(raw, at, { a4, clicks })) {
      if (h.onset)
        events.push({
          kind: "onset",
          at: h.onset.at,
          strength: h.onset.strength,
          midi: h.pitch?.midi,
          emitted,
        });
      for (const n of h.notes) events.push({ ...n, emitted });
      frames.push({
        at: h.at,
        frame: h.frame,
        wide: h.wide,
        sampleRate: sr,
        pitch: h.pitch && {
          midi: h.pitch.midi,
          cents: h.pitch.cents,
          hz: h.pitch.hz,
          clarity: h.pitch.clarity,
        },
        rms: h.rms,
        gateRms: h.gateRms,
        db: sig.rmsDb(h.frame),
        onsetAt: h.onset?.at,
      });
    }
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
        // The worklet also posts a 4096 window; the listener builds its own
        // from the frames it has cleaned, so only the frame matters here.
        onFrame(frame, ((b + i + 1 - FRAME) / sr) * 1000);
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
  const buf = sig.framesWindow(win, from, sig.CHORD_WINDOW_MS);
  const sampleRate = win[0]?.sampleRate ?? 48000;
  const r = sig.readChord(buf, sampleRate);
  return { at: from, pcs: r.pcs, chroma: r.chroma, quiet: r.quiet, buf, sampleRate };
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
