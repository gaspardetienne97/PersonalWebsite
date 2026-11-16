// Taking the app's own metronome out of the microphone signal.
//
// A click through the speakers arrives at the microphone as the same waveform
// every time (the same sound through the same speaker, room and microphone), so
// once one has been heard it can be subtracted from the next: find where the
// click sits to the sample, scale it, take it off. What is left is whatever was
// played on the beat. Measured on a laptop microphone and a webcam, a learned
// click comes off by 18 to 31 dB.
//
// The app says when each click is due (ExpectedClick). The time is only roughly
// right (the input's own latency and the trip through the room are not known),
// so the click is looked for by its tone across a wide window around it. To
// take a click off a frame, the frame after it is needed (a click that starts
// at a frame's last samples cannot be placed yet), so frames inside a click's
// window are handed on one frame late, about 43 ms, with their times unchanged.
// Everything else passes straight through. When the clicks are not heard at all
// (headphones), nothing is held back.

/** A click the app is playing: when it should reach the microphone (ms, the frames' clock) and its pitch. */
export interface ExpectedClick {
  at: number;
  hz: number;
}
/**
 * How far around its expected time a click is looked for. The expected time is
 * the scheduled time plus the output latency the browser reports.
 */
export const CLICK_EARLY_MS = 40;
export const CLICK_LATE_MS = 300;

export interface CleanFrame {
  frame: Float32Array;
  /** Start of the frame, ms (as it was pushed). */
  at: number;
  /**
   * `removed`: a learned click was taken off this frame. `unlearned`: a click is
   * in it that could not be taken off (the first one heard, or one heard with
   * no frame held back); the caller should not trust an attack found here.
   */
  click?: "removed" | "unlearned";
  /** The pitch of the click due around this frame, removed or not. */
  clickHz?: number;
  /** RMS of what removing the click is expected to have left in this frame. */
  residue?: number;
  /** When the click in this frame began, ms. */
  clickAt?: number;
}

interface Template {
  wave: Float32Array;
  energy: number;
  /** Energy of the first `match` samples. */
  head: number;
  /** The loudest 2 ms of the click's own tone. */
  tone: number;
}

/** Power of `hz` in buf[from, from + n) (Goertzel). */
function tonePower(buf: Float32Array, from: number, n: number, hz: number, sampleRate: number) {
  const c = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < from + n; i++) {
    const s0 = buf[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

export function createClickCanceller(sampleRate: number) {
  const length = Math.round(sampleRate * 0.2); // a click and its ring in the room
  const match = Math.round(sampleRate * 0.02); // what a click is placed by
  const block = Math.round(sampleRate * 0.002); // the tone is watched in 2 ms steps
  const lead = Math.round(sampleRate * 0.005); // kept ahead of the tone's rise
  const VARIANTS = 4;
  const templates = new Map<number, Template[]>();
  let pending: { frame: Float32Array; at: number } | null = null;
  let prevRaw: Float32Array | null = null;
  /** Samples handed on so far: the absolute index of the next frame's first sample. */
  let emitted = 0;
  let active: { wave: Float32Array; start: number; gain: number } | null = null;
  /** When the click now sounding began, ms. */
  let began = 0;
  let capture: {
    hz: number;
    start: number;
    raw: Float32Array;
    /** What it was taken off with; null when it could not be taken off. */
    by: { wave: Float32Array; gain: number } | null;
  } | null = null;
  /** The expected time of the latest click that was dealt with (found, or given up on). */
  let done = -Infinity;
  let misses = 0;
  /** What was left of each of the last few clicks, as a share of the click (amplitude). */
  let leftovers: number[] = [];

  const makeTemplate = (wave: Float32Array, hz: number): Template => {
    let energy = 0;
    let head = 0;
    for (let i = 0; i < wave.length; i++) {
      energy += wave[i] * wave[i];
      if (i < match) head += wave[i] * wave[i];
    }
    let tone = 0;
    for (let i = 0; i + block <= wave.length; i += block)
      tone = Math.max(tone, tonePower(wave, i, block, hz, sampleRate));
    return { wave, energy, head, tone };
  };

  function finishCapture() {
    const c = capture!;
    capture = null;
    const fresh = makeTemplate(c.raw, c.hz);
    let known = templates.get(c.hz) ?? [];
    if (c.by) {
      let left = 0;
      for (let i = 0; i < length; i++) left += (c.raw[i] - c.by.gain * c.by.wave[i]) ** 2;
      leftovers.push(Math.sqrt(left / (fresh.energy || 1)));
      if (leftovers.length > 8) leftovers.shift();
      // It came off by 15 dB or more: nothing to learn. If not, it is a new
      // variant only when it is no louder than a bare click (a strum on the
      // click is louder).
      const quietest = Math.min(...known.map((t) => t.energy));
      if (left * 31.6 < fresh.energy || fresh.energy > 1.5 * quietest) return;
    } else {
      // Learned outright (the first click, or one at a level nothing known
      // matches: the volume changed). Clicks at another level are forgotten.
      known = known.filter((t) => t.energy <= 1.5 * fresh.energy && fresh.energy <= 1.5 * t.energy);
    }
    known.push(fresh);
    // A bare click is the quietest sighting; one learned with a strum on it goes.
    const least = Math.min(...known.map((t) => t.energy));
    const kept = known
      .filter((t) => t.energy <= 1.5 * least)
      .sort((a, b) => a.energy - b.energy)
      .slice(0, VARIANTS);
    templates.set(c.hz, kept);
  }

  /** One frame out. `next` is the frame after it when that is in hand. */
  function process(
    raw: Float32Array,
    at: number,
    next: Float32Array | null,
    clicks: readonly ExpectedClick[] | undefined,
  ): CleanFrame {
    const n = raw.length;
    const frameMs = (n / sampleRate) * 1000;
    const start = emitted;
    const out = raw.slice();
    let flag: CleanFrame["click"];

    let due: ExpectedClick | undefined;
    if (clicks)
      for (const c of clicks) {
        if (c.at <= done) continue;
        if (c.at + CLICK_LATE_MS < at) {
          // Its window went by and it was never heard.
          misses++;
          done = Math.max(done, c.at);
        } else if (c.at - CLICK_EARLY_MS <= at + frameMs && (!due || c.at < due.at)) due = c;
      }

    let hzOut: number | undefined;
    if (due && prevRaw) {
      const hz = due.hz;
      // Three frames side by side: the one before, this one, the one after.
      const x = new Float32Array(3 * n);
      x.set(prevRaw, 0);
      x.set(raw, n);
      if (next) x.set(next, 2 * n);
      const blocks = Math.floor(n / block);
      let was = 0;
      for (let j = 0; j < blocks; j++) was += tonePower(x, j * block, block, hz, sampleRate);
      was /= blocks;
      const known = templates.get(hz) ?? [];
      // A sine of amplitude 0.001 at the least; 9 dB over the frame before for a
      // known click, 20 dB for one never heard.
      const need = Math.max(
        (0.0005 * block) ** 2,
        known.length ? Math.max(0.1 * known[0].tone, 8 * was) : 100 * was,
      );
      // Each place the tone comes in (or jumps, over something already sounding),
      // in this frame or the first few milliseconds of the next.
      let before = tonePower(x, n - block, block, hz, sampleRate);
      let found = n;
      for (let j = 0; j < blocks + (next ? 3 : 0) && !flag; j++) {
        const rise = n + j * block;
        const p = tonePower(x, rise, block, hz, sampleRate);
        const jumped = p >= need && (before < need || p >= 4 * before);
        before = p;
        if (!jumped || rise + match > x.length) continue;
        found = rise;
        // How much of the 20 ms from here is the click's own tone (1 for a bare sine).
        let energy = 0;
        for (let i = rise; i < rise + match; i++) energy += x[i] * x[i];
        // A bare click measures about 0.3 (it decays, and the room rings), one
        // over a ringing chord 0.1 to 0.2, a strum next to nothing.
        const purity = tonePower(x, rise, match, hz, sampleRate) / ((energy * match) / 2 || 1);
        const pure = purity >= 0.1;
        let best = { rho: 0, at: 0, gain: 1, wave: null as Float32Array | null };
        if (next)
          for (const t of known)
            for (let s = rise - lead - 3 * block; s <= rise - lead + 3 * block; s++) {
              if (s < 0 || s + match > x.length) continue;
              let dot = 0;
              let own = 0;
              for (let i = 0; i < match; i++) {
                dot += t.wave[i] * x[s + i];
                own += x[s + i] * x[s + i];
              }
              const rho = dot / Math.sqrt(t.head * own || 1);
              if (rho > best.rho) best = { rho, at: s, gain: dot / (t.head || 1), wave: t.wave };
            }
        // A match at half or twice the learned level is the click at another volume: not a match.
        if (best.wave && best.rho >= 0.5 && best.gain >= 0.5 && best.gain <= 2) {
          // Found to the sample: take it off from here on, and keep the raw
          // sound in case it turns out to be a variant worth learning.
          const gain = best.gain;
          active = { wave: best.wave, start: start - n + best.at, gain };
          capture = {
            hz,
            start: active.start,
            raw: new Float32Array(length),
            by: { wave: best.wave, gain },
          };
          // A bare click that barely came off (under 6 dB over its first 20 ms)
          // is one this microphone has not shown before: what is left would
          // read as an attack, so it is treated as not removed.
          let left = 0;
          let had = 0;
          for (let i = 0; i < match; i++) {
            const v = x[best.at + i];
            had += v * v;
            left += (v - gain * best.wave[i]) ** 2;
          }
          flag = purity >= 0.25 && left > 0.25 * had ? "unlearned" : "removed";
        } else if (pure) {
          // A click that matches nothing learned so far (the first, or one
          // heard with no frame held back): learn it; it cannot be taken off.
          capture = {
            hz,
            start: start - n + rise - lead,
            raw: new Float32Array(length),
            by: null,
          };
          flag = "unlearned";
        }
        // Anything else is not the click, or the click under something louder: leave it.
      }
      if (flag) {
        done = due.at;
        misses = 0;
        hzOut = hz;
        began = at + ((found - n) / sampleRate) * 1000;
      }
    }

    if (capture) {
      // Raw samples, before anything is taken off (the lead-in may be in the frame before).
      const from = capture.start;
      const to = Math.min(capture.start + length, start + n);
      for (let i = Math.max(from, start - n); i < to; i++)
        if (i >= start) capture.raw[i - from] = raw[i - start];
        else if (prevRaw) capture.raw[i - from] = prevRaw[i - start + n];
      if (to > Math.max(from, start)) {
        flag ??= capture.by ? "removed" : "unlearned";
        hzOut ??= capture.hz;
      }
      if (to >= capture.start + length) finishCapture();
    }
    let residue: number | undefined;
    if (active) {
      const from = Math.max(active.start, start);
      const to = Math.min(active.start + length, start + n);
      let taken = 0;
      for (let i = from; i < to; i++) {
        const v = active.gain * active.wave[i - active.start];
        out[i - start] -= v;
        taken += v * v;
      }
      // The best of the last few removals says how clean a removal can be here
      // (a strum on a click leaves more, and must not raise the estimate); 14 dB
      // under the click until two have been measured.
      const share = leftovers.length >= 2 ? Math.max(0.03, Math.min(...leftovers)) : 0.2;
      residue = share * Math.sqrt(taken / n);
      if (start + n >= active.start + length) active = null;
    }
    prevRaw = raw;
    emitted += n;
    return {
      frame: out,
      at,
      click: flag,
      clickHz: hzOut,
      residue,
      clickAt: flag || residue ? began : undefined,
    };
  }

  return {
    /**
     * Push the next frame; returns the frames now ready, oldest first: none
     * while one is held back for a click, two when the held one is released.
     */
    push(frame: Float32Array, at: number, clicks?: readonly ExpectedClick[]): CleanFrame[] {
      const frameMs = (frame.length / sampleRate) * 1000;
      // Hold back only around a click that is still to come, and only while clicks are being heard.
      const hold =
        misses < 4 &&
        !!clicks?.some(
          (c) =>
            c.at > done && c.at - CLICK_EARLY_MS <= at + 2 * frameMs && c.at + CLICK_LATE_MS >= at,
        );
      const out: CleanFrame[] = [];
      if (pending) {
        out.push(process(pending.frame, pending.at, frame, clicks));
        pending = null;
      }
      if (hold) pending = { frame: frame.slice(), at };
      else out.push(process(frame, at, null, clicks));
      return out;
    },
    /** The frame still held back, if any (the microphone stopped). */
    flush(): CleanFrame[] {
      if (!pending) return [];
      const p = pending;
      pending = null;
      return [process(p.frame, p.at, null, undefined)];
    },
  };
}
