#!/usr/bin/env node
// Detection eval: replay the owner's test recordings through the app's live
// detection path and measure what comes out against what was played.
//
//   node scripts/detection-eval/run.mjs                 every clip, every input
//   node scripts/detection-eval/run.mjs --clips 5,6     some clips
//   node scripts/detection-eval/run.mjs --inputs scarlett-2i2-4th-gen
//   node scripts/detection-eval/run.mjs --rate 44100    another AudioContext rate (default 48000)
//   node scripts/detection-eval/run.mjs --no-transcribe skip the offline melody transcriber
//   node scripts/detection-eval/run.mjs --gain 20       boost every take 20 dB first (a diagnostic:
//                                                       what changes is a level problem); writes report-gain20.md
//
// Reads .recordings/detection (private, git-ignored) and writes
// .ui-climb/detection/report.md and results.json (also ignored). Measures
// only: nothing here changes a detector. See live.mjs for what is replayed.
//
// How takes are aligned to the clip's example: the example's note times are a
// guide, not a score (a second of pre-roll, human timing, no click on most
// clips). Detected onsets are matched to expected attacks by a walk that
// re-anchors on each match and accepts an onset within 45% of the gap to the
// neighbouring attacks; every possible start is tried and the one with the
// most matches wins. Note sequences are compared in order (longest common
// subsequence), with no timing at all.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { readWav, resampleSinc } from "./wav.mjs";
import { liveReadouts, rhythmReadings, simulateLive, strumReadings } from "./live.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const REC = join(ROOT, ".recordings/detection");
const OUT = join(ROOT, ".ui-climb/detection");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const LIVE_RATE = Number(opt("rate") ?? 48000);
const ONLY_CLIPS = opt("clips")?.split(",").map(Number);
const ONLY_INPUTS = opt("inputs")?.split(",");
const TRANSCRIBE = !args.includes("--no-transcribe");
/** A diagnostic: boost every take by this many dB before the live path, to see what is only a level problem. */
const GAIN_DB = Number(opt("gain") ?? 0);
const SUFFIX = (GAIN_DB ? `-gain${GAIN_DB}` : "") + (LIVE_RATE !== 48000 ? `-${LIVE_RATE}` : "");

if (!existsSync(REC)) {
  console.error(`No recordings at ${REC}. Record them at /music/clips first. Nothing to measure.`);
  process.exit(0);
}

const load = (p) => tsImport(pathToFileURL(join(ROOT, p)).href, import.meta.url);
const S = "packages/music-core/src/signal/";
const [
  pitch,
  chromaMod,
  chordMod,
  onset,
  level,
  biquad,
  key,
  transcribeMod,
  chordsMod,
  technique,
  bends,
  clipsMod,
] = await Promise.all([
  load(`${S}pitch.ts`),
  load(`${S}chroma.ts`),
  load(`${S}chord.ts`),
  load(`${S}onset.ts`),
  load(`${S}level.ts`),
  load(`${S}biquad.ts`),
  load(`${S}key.ts`),
  load(`${S}transcribe.ts`),
  load("packages/music-core/src/theory/chords.ts"),
  load("packages/music-core/src/scoring/technique.ts"),
  load("packages/music-core/src/scoring/bends.ts"),
  load("src/lib/music/clips/clips.ts"),
]);
const sig = { ...pitch, ...chromaMod, ...chordMod, ...onset, ...level, ...biquad };
const { CLIPS, clipFile } = clipsMod;

// ---------------------------------------------------------------------------
// Small helpers

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pc = (m) => ((m % 12) + 12) % 12;
const nn = (m) => `${NAMES[pc(m)]}${Math.floor(m / 12) - 1}`;
const pcsName = (pcs) => (pcs.length ? pcs.map((p) => NAMES[p]).join(" ") : "none");
const uniq = (xs) => [...new Set(xs)];
const sortNum = (xs) => [...xs].sort((a, b) => a - b);
const median = (xs) => (xs.length ? sortNum(xs)[Math.floor(xs.length / 2)] : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const dB = (v) => (v > 0 ? 20 * Math.log10(v) : -120);
const tally = (xs) => {
  const m = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return m;
};
const tallyText = (m, name = (k) => k) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${name(k)}x${n}`)
    .join(" ") || "";

/** Longest common subsequence; returns the indices of `got` that matched. */
function lcs(want, got) {
  const n = want.length;
  const m = got.length;
  const d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      d[i][j] = want[i] === got[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const used = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (want[i] === got[j]) {
      used.push(j);
      i++;
      j++;
    } else if (d[i + 1][j] >= d[i][j + 1]) i++;
    else j++;
  }
  return used;
}

/**
 * Match detected onsets (s) to expected attack times (s, relative). See the
 * header. `stretches` are tempo factors to try: a clip with no click is played
 * at the player's own pace (the owner let slow strums ring twice as long as
 * the example), so its timeline may stretch; a clicked clip may not.
 */
function matchOnsets(want, det, stretches = [1]) {
  if (!want.length) return { hits: 0, missed: 0, extra: det.length, pairs: [], stretch: 1 };
  const walk = (exp, offset) => {
    const gap = (k) =>
      Math.min(
        k > 0 ? exp[k] - exp[k - 1] : Infinity,
        k + 1 < exp.length ? exp[k + 1] - exp[k] : Infinity,
      );
    const used = new Set();
    const pairs = [];
    let drift = offset;
    for (let k = 0; k < exp.length; k++) {
      const g = gap(k);
      const tol = Math.max(0.08, 0.45 * (Number.isFinite(g) ? g : 1));
      const target = exp[k] + drift;
      let best = -1;
      det.forEach((t, i) => {
        if (used.has(i) || Math.abs(t - target) > tol) return;
        if (best < 0 || Math.abs(t - target) < Math.abs(det[best] - target)) best = i;
      });
      if (best >= 0) {
        used.add(best);
        pairs.push({ k, i: best, at: det[best] });
        drift = det[best] - exp[k];
      }
    }
    return pairs;
  };
  let best = { pairs: [], stretch: 1 };
  // Nearest to the written tempo first, so a tie keeps the least stretch.
  for (const stretch of [...stretches].sort(
    (a, b) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)),
  )) {
    const exp = want.map((t) => t * stretch);
    for (let j = 0; j < Math.min(3, exp.length); j++)
      for (let i = 0; i < det.length; i++) {
        const pairs = walk(exp, det[i] - exp[j]);
        if (pairs.length > best.pairs.length) best = { pairs, stretch };
      }
  }
  return {
    hits: best.pairs.length,
    missed: want.length - best.pairs.length,
    extra: det.length - best.pairs.length,
    pairs: best.pairs,
    stretch: best.stretch,
  };
}
const STRETCHES = Array.from({ length: 41 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);

// ---------------------------------------------------------------------------
// What each clip should sound like, from clips.ts

/** Owner's notes (notes.json): clip 18, "I played the top C twice". */
const OVERRIDES = {
  18: (ev) => {
    const top = ev.reduce((b, e, i) => (e.midis[0] > ev[b].midis[0] ? i : b), 0);
    const gapS = ev[1].time - ev[0].time;
    return [
      ...ev.slice(0, top + 1),
      { ...ev[top], time: ev[top].time + gapS },
      ...ev.slice(top + 1).map((e) => ({ ...e, time: e.time + gapS })),
    ];
  },
  // The bend clip is two picks; the rest of its example is the pitch moving.
  20: (ev) => [ev[0], ev[3]],
};

function expectation(clip) {
  const sounding = clip.example.filter((n) => n.voice !== "click");
  let events = [];
  for (const n of [...sounding].sort((a, b) => a.time - b.time)) {
    const last = events[events.length - 1];
    if (last && n.time - last.time < 0.15) last.midis.push(n.midi);
    else events.push({ time: n.time, midis: [n.midi], step: n.step, drum: n.voice === "drum" });
  }
  if (OVERRIDES[clip.n]) events = OVERRIDES[clip.n](events);
  const kind =
    clip.section === "Room"
      ? "room"
      : events.some((e) => e.drum)
        ? "muted"
        : events.every((e) => e.midis.length === 1)
          ? "mono"
          : "chord";
  if (kind === "chord") {
    const shapes = clip.visual.shapes;
    for (const e of events) {
      e.pcs = sortNum(uniq(e.midis.map(pc)));
      e.symbol = shapes
        ? shapes.length > 1
          ? shapes[e.step].name
          : shapes[0].name
        : clip.steps[e.step];
    }
  }
  // Clip 20's expected pitches are everything the bend passes through.
  const midis = clip.n === 20 ? [62, 63, 64] : events.map((e) => e.midis[0]);
  return {
    kind,
    events,
    midis,
    clicked: !!clip.bpm,
    // Written pitch (Aerophone) and "any comfortable key" (voice) may sound transposed.
    transposable: clip.section === "Aerophone" || clip.section === "Voice",
  };
}

// ---------------------------------------------------------------------------
// Metrics

function quality(channels) {
  let peak = 0;
  let clipped = 0;
  for (const ch of channels)
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
    }
  return { peakDb: r1(dB(peak)), clippedSamples: clipped };
}

/** Frames that hold playing: 12 dB over the pre-roll's level (the first 0.7 s). */
function soundingFrames(sim) {
  const pre = sim.frames.filter((f) => f.at + sim.frameMs <= 700).map((f) => dB(f.rms));
  const floor = median(pre) ?? -90;
  const loud = sim.frames.filter((f) => dB(f.rms) >= floor + 12);
  return { floorDb: r1(floor), loud, loudDb: r1(median(loud.map((f) => dB(f.rms)))) };
}

function onsetMetrics(exp, sim) {
  const det = sim.events.filter((e) => e.kind === "onset").map((e) => e.at / 1000);
  const want = exp.events.map((e) => e.time);
  const m = matchOnsets(want, det, exp.clicked ? [1] : STRETCHES);
  // Timing against one fixed offset: only meaningful with a click (it includes the player's own timing).
  const res = m.pairs.map((p) => p.at - want[p.k]);
  const med = median(res);
  const err = res.map((x) => (x - med) * 1000);
  return {
    expected: want.length,
    detected: det.length,
    hits: m.hits,
    missed: m.missed,
    extra: m.extra,
    stretch: m.stretch,
    medianAbsErrMs: exp.clicked && err.length ? Math.round(median(err.map(Math.abs))) : null,
    maxAbsErrMs: exp.clicked && err.length ? Math.round(Math.max(...err.map(Math.abs))) : null,
    pairs: m.pairs,
    times: det.map((t) => Math.round(t * 1000) / 1000),
  };
}

function sequenceMetrics(want, got) {
  const used = new Set(lcs(want, got));
  const wantSet = new Set(want);
  const extras = got.filter((_, i) => !used.has(i));
  const cls = (m) =>
    wantSet.has(m)
      ? "repeat"
      : [...wantSet].some((w) => w !== m && pc(w) === pc(m))
        ? "octave"
        : [...wantSet].some((w) => Math.abs(w - m) === 1)
          ? "semitone"
          : "other";
  return {
    expected: want.length,
    got: got.length,
    matched: used.size,
    missed: want.length - used.size,
    extra: extras.length,
    extraKinds: tally(extras.map(cls)),
    extraNotes: tally(extras.filter((m) => cls(m) !== "repeat").map(nn)),
  };
}

/** The transposition (semitones) that makes the heard notes fit best; 0 unless the clip may transpose. */
function bestShift(exp, got) {
  if (!exp.transposable || !got.length) return 0;
  let best = 0;
  let bestN = lcs(exp.midis, got).length;
  for (let s = -24; s <= 24; s++) {
    const n = lcs(
      exp.midis.map((m) => m + s),
      got,
    ).length;
    if (n > bestN || (n === bestN && Math.abs(s) < Math.abs(best))) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

function monoMetrics(clip, exp, sim) {
  const ons = sim.events.filter((e) => e.kind === "noteon");
  const got = ons.map((e) => e.midi);
  const shift = bestShift(exp, got);
  const want = exp.midis.map((m) => m + shift);
  const wantSet = new Set(want);
  const { loud, floorDb, loudDb } = soundingFrames(sim);
  const heard = sim.frames.filter((f) => f.pitch);
  const exact = heard.filter((f) => wantSet.has(f.pitch.midi));
  const octave = heard.filter(
    (f) => !wantSet.has(f.pitch.midi) && [...wantSet].some((w) => pc(w) === pc(f.pitch.midi)),
  );
  const byNote = {};
  for (const f of exact) (byNote[f.pitch.midi] ??= []).push(f.pitch.cents);
  const spreads = Object.values(byNote)
    .filter((c) => c.length >= 4)
    .map(sd);
  const out = {
    shift,
    notes: clip.n === 20 ? null : sequenceMetrics(want, got),
    heardNotes: got.map(nn).join(" "),
    frames: {
      loud: loud.length,
      floorDb,
      loudDb,
      // Loud frames the pitch reader's silence gate (RMS 0.001) throws away.
      gatedPct: pct(loud.filter((f) => f.rms < sig.SILENCE_RMS).length, loud.length),
      heardPct: pct(loud.filter((f) => f.pitch).length, loud.length),
      heard: heard.length,
      exactPct: pct(exact.length, heard.length),
      octavePct: pct(octave.length, heard.length),
      otherPct: pct(heard.length - exact.length - octave.length, heard.length),
      wrong: tally(heard.filter((f) => !wantSet.has(f.pitch.midi)).map((f) => nn(f.pitch.midi))),
      centsSpread: r1(median(spreads)),
      centsOffset: r1(mean(exact.map((f) => f.pitch.cents))),
    },
  };
  if (clip.n === 20) {
    // BendDrill: the trace of every frame's pitch, judged by analyseBend. Split at the second pick.
    const trace = sim.frames.map((f) => ({ at: f.at, hz: f.pitch?.hz ?? null }));
    const first = heard[0]?.at ?? 0;
    const last = heard.at(-1)?.at ?? 0;
    const mid = (first + last) / 2;
    const picks = sim.events.filter((e) => e.kind === "onset").map((e) => e.at);
    const split =
      picks.length > 1
        ? picks.slice(1).reduce((b, t) => (Math.abs(t - mid) < Math.abs(b - mid) ? t : b))
        : mid;
    const judge = (pts, to) => {
      const b = bends.analyseBend(pts, 62, to);
      return { verdict: b.verdict, reachedCents: r1(b.reachedCents), heldMs: Math.round(b.heldMs) };
    };
    out.bend = {
      half: judge(
        trace.filter((p) => p.at < split),
        63,
      ),
      whole: judge(
        trace.filter((p) => p.at >= split),
        64,
      ),
    };
  }
  return out;
}

function transcribeMetrics(exp, mono, shift) {
  const score = transcribeMod.transcribe(mono, LIVE_RATE, { bpm: 60 });
  const got = score.voices[0].notes.map((n) => n.midi);
  return {
    ...sequenceMetrics(
      exp.midis.map((m) => m + shift),
      got,
    ),
    heardNotes: got.map(nn).join(" "),
  };
}

function chordMetrics(exp, sim, onsets) {
  const want = exp.events;
  // When each expected strum happened: its matched onset, else its place after the last match.
  const at = [];
  const time = (e) => e.time * onsets.stretch;
  const first = onsets.pairs[0];
  let drift = first ? first.at - time(want[first.k]) : 1;
  want.forEach((e, k) => {
    const p = onsets.pairs.find((x) => x.k === k);
    if (p) drift = p.at - time(e);
    at.push((time(e) + drift) * 1000);
  });
  const chordAt = (ms) => {
    let k = -1;
    for (let i = 0; i < at.length; i++) if (at[i] - 60 <= ms) k = i;
    return k;
  };
  const grade = (e, pcs) => {
    const need = Math.min(3, e.pcs.length);
    const missing = e.pcs.filter((p) => !pcs.includes(p));
    const extra = pcs.filter((p) => !e.pcs.includes(p));
    const verdict =
      pcs.length < need
        ? "short"
        : !missing.length && !extra.length
          ? "exact"
          : !missing.length
            ? "extra"
            : "missing";
    return { verdict, missing, extra };
  };

  // Strum & identify, Changes: one reading per onset.
  const strums = strumReadings(sim, sig).map((r) => {
    const k = chordAt(r.at);
    const e = want[Math.max(0, k)];
    const g = grade(e, r.pcs);
    const candidates = chordsMod
      .identifyChord(r.pcs)
      .map((c) => ({ symbol: c.symbol, confidence: c.score }));
    const id =
      g.verdict === "short"
        ? null
        : technique.gradeStrumIdentify({
            expectedSymbol: e.symbol,
            expectedPcs: e.pcs,
            observedPcs: r.pcs,
            candidates,
          });
    return {
      at: Math.round(r.at),
      want: e.symbol,
      pcs: r.pcs,
      ...g,
      quiet: r.quiet,
      identified: id?.identified ?? null,
      named: !!id && technique.sameChordSymbol(id.identified ?? "", e.symbol),
      correct: !!id?.correct,
      chroma: r.chroma.map((v) => Math.round(v * 100) / 100),
    };
  });

  // The "Hearing" readout while one chord rings (windows that straddle a change are left out).
  const live = [];
  for (const r of liveReadouts(sim, sig)) {
    const a = chordAt(r.at);
    const b = chordAt(r.end);
    if (a < 0 || want[a].symbol !== want[b].symbol || r.quiet) continue;
    live.push({ ...grade(want[a], r.pcs), pcs: r.pcs });
  }

  // Rhythm page: the chord reader over the 400 ms after each onset; a chord is
  // "held" when the tones heard across its strums cover it (extras allowed).
  const rhythm = rhythmReadings(sim, sig).map((r) => {
    const e = want[Math.max(0, chordAt(r.at))];
    return {
      at: Math.round(r.at),
      want: e.symbol,
      pcs: r.pcs,
      ...(r.pcs ? grade(e, r.pcs) : { verdict: "unpitched", missing: e.pcs, extra: [] }),
    };
  });
  const spans = [];
  want.forEach((e, k) => {
    const last = spans[spans.length - 1];
    if (last && last.symbol === e.symbol) last.to = at[k + 1] ?? Infinity;
    else spans.push({ symbol: e.symbol, pcs: e.pcs, from: at[k] - 60, to: at[k + 1] ?? Infinity });
  });
  const held = spans.map((s) => {
    const heard = uniq(
      rhythm.filter((r) => r.at >= s.from && r.at < s.to).flatMap((r) => r.pcs ?? []),
    );
    return s.pcs.every((p) => heard.includes(p));
  });

  const count = (xs, v) => xs.filter((x) => x.verdict === v).length;
  const hist = (xs, k) => tally(xs.flatMap((x) => x[k].map((p) => NAMES[p])));
  return {
    strum: {
      n: strums.length,
      exact: count(strums, "exact"),
      extra: count(strums, "extra"),
      missing: count(strums, "missing"),
      short: count(strums, "short"),
      named: strums.filter((s) => s.named).length,
      correct: strums.filter((s) => s.correct).length,
      missingPcs: hist(strums, "missing"),
      extraPcs: hist(strums, "extra"),
      identified: tally(strums.map((s) => s.identified ?? "too few tones")),
      readings: strums,
    },
    live: {
      n: live.length,
      exactPct: pct(count(live, "exact"), live.length),
      coveredPct: pct(count(live, "exact") + count(live, "extra"), live.length),
      missingPcs: hist(live, "missing"),
      extraPcs: hist(live, "extra"),
      sets: tally(live.map((l) => pcsName(l.pcs))),
    },
    rhythm: {
      n: rhythm.length,
      unpitched: count(rhythm, "unpitched"),
      exact: count(rhythm, "exact"),
      covered: count(rhythm, "exact") + count(rhythm, "extra"),
      held: held.filter(Boolean).length,
      chords: held.length,
      missingPcs: hist(
        rhythm.filter((r) => r.pcs),
        "missing",
      ),
      extraPcs: hist(
        rhythm.filter((r) => r.pcs),
        "extra",
      ),
      readings: rhythm,
    },
  };
}

/** Clips where nothing pitched was played: everything heard is a false positive. */
function falsePositives(sim) {
  const ons = sim.events.filter((e) => e.kind === "noteon");
  const strums = strumReadings(sim, sig);
  const live = liveReadouts(sim, sig);
  const rhythm = rhythmReadings(sim, sig);
  return {
    onsets: sim.events.filter((e) => e.kind === "onset").length,
    noteons: ons.length,
    noteNames: ons.map((e) => nn(e.midi)).join(" "),
    pitchFramesPct: pct(sim.frames.filter((f) => f.pitch).length, sim.frames.length),
    // Changes takes any reading with a tone; Strum & identify grades one with three.
    strumReads: strums.filter((s) => s.pcs.length).length,
    strumReads3: strums.filter((s) => s.pcs.length >= 3).length,
    strumSets: tally(strums.filter((s) => s.pcs.length).map((s) => pcsName(s.pcs))),
    livePct: pct(live.filter((l) => l.pcs.length).length, live.length),
    rhythmPitched: rhythm.filter((r) => r.pcs).length,
  };
}

function keyMetrics(mono) {
  const ranked = key.rankKeys(key.regionChroma(mono, LIVE_RATE));
  const k = ranked[0];
  return {
    best: k ? `${NAMES[k.tonicPc]}${k.minor ? "m" : ""}` : null,
    r: k ? Math.round(k.r * 100) / 100 : null,
    home: key.homeTonics(ranked).map((p) => NAMES[p]),
  };
}
/** Clips with a clear key, for "find home" (by-ear page). */
const KEYS = { 14: 7, 18: 0, 19: 0, 28: 0, 30: 0, 31: 0, 33: 0, 35: 0, 36: 0 };

// ---------------------------------------------------------------------------
// Run

const inputs = readdirSync(REC, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((d) => !ONLY_INPUTS || ONLY_INPUTS.includes(d))
  .sort();
const clips = CLIPS.filter((c) => !ONLY_CLIPS || ONLY_CLIPS.includes(c.n));
const results = [];
const started = Date.now();

for (const clip of clips) {
  const exp = expectation(clip);
  for (const input of inputs) {
    const file = join(REC, input, clipFile(clip));
    if (!existsSync(file)) continue;
    const wav = readWav(readFileSync(file));
    const q = quality(wav.channels);
    const row = {
      clip: clip.n,
      slug: clip.slug,
      section: clip.section,
      title: clip.title,
      input,
      kind: exp.kind,
      fileRate: wav.sampleRate,
      channels: wav.channels.length,
      seconds: r1(wav.channels[0].length / wav.sampleRate),
      ...q,
      flags: [],
    };
    results.push(row);
    if (q.peakDb < -50 && clip.n > 3) {
      row.skipped = "empty take (nothing above -50 dBFS)";
      continue;
    }
    if (q.clippedSamples > 8) row.flags.push("clipped");
    if (q.peakDb < -30 && exp.kind !== "room") row.flags.push("quiet");
    if (clip.click === "speakers") row.flags.push("speaker click");

    // The browser hands the worklet the AudioContext's rate, whatever the device's own.
    const gain = 10 ** (GAIN_DB / 20);
    const chans = wav.channels.map((c) =>
      resampleSinc(c, wav.sampleRate, LIVE_RATE).map((v) => v * gain),
    );
    const sim = simulateLive(chans, LIVE_RATE, sig);
    row.followed = {
      channel: sim.switches.at(-1)?.to ?? 0,
      switches: sim.switches.map((s) => Math.round(s.at)),
    };
    const { loud, floorDb, loudDb } = soundingFrames(sim);
    row.level = { floorDb, loudDb, loudFrames: loud.length };

    if (exp.kind === "room") {
      row.room = falsePositives(sim);
      if (clip.bpm) row.room.clicks = Math.round(((row.seconds - 1) * clip.bpm) / 60);
    } else {
      row.onsets = onsetMetrics(exp, sim);
      if (exp.kind === "mono") row.mono = monoMetrics(clip, exp, sim);
      if (exp.kind === "chord") row.chord = chordMetrics(exp, sim, row.onsets);
      if (exp.kind === "muted") row.muted = falsePositives(sim);
      // WebAudio's mixdown to one channel, as the transcriber and the by-ear page do.
      const mono = sig.toMono(chans);
      if (exp.kind === "mono" && TRANSCRIBE && clip.n !== 20)
        row.transcribe = transcribeMetrics(exp, mono, row.mono.shift);
      if (clip.n in KEYS) row.key = { ...keyMetrics(mono), want: NAMES[KEYS[clip.n]] };
      delete row.onsets.pairs;
    }
    process.stderr.write(`\r${String(clip.n).padStart(2, "0")} ${input}`.padEnd(60));
  }
}
process.stderr.write(`\rdone in ${Math.round((Date.now() - started) / 1000)} s`.padEnd(60) + "\n");

// ---------------------------------------------------------------------------
// Scores (0 to 1, higher is better) for ranking and the headline table

const f1 = (hit, want, got) => (want + got ? (2 * hit) / (want + got) : 1);
for (const r of results) {
  if (r.skipped) continue;
  r.scores = {};
  if (r.mono?.notes)
    r.scores.notes = f1(r.mono.notes.matched, r.mono.notes.expected, r.mono.notes.got);
  if (r.transcribe)
    r.scores.transcribe = f1(r.transcribe.matched, r.transcribe.expected, r.transcribe.got);
  if (r.onsets) r.scores.onsets = f1(r.onsets.hits, r.onsets.expected, r.onsets.detected);
  if (r.chord) {
    const want = r.onsets.expected;
    r.scores.strum = f1(r.chord.strum.exact, want, r.chord.strum.n);
    r.scores.strumNamed = f1(r.chord.strum.named, want, r.chord.strum.n);
    if (r.chord.live.n) r.scores.live = r.chord.live.exactPct / 100;
    r.scores.rhythmChord = r.chord.rhythm.chords ? r.chord.rhythm.held / r.chord.rhythm.chords : 1;
  }
}

// ---------------------------------------------------------------------------
// Report

const SHORT = Object.fromEntries(inputs.map((i) => [i, i.split("-")[0]]));
const cell = (n, input) => results.find((r) => r.clip === n && r.input === input);
const flagText = (r) => (r.flags.length ? ` [${r.flags.join(", ")}]` : "");
const md = [];
const table = (head, rows) => {
  md.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
  for (const row of rows) md.push(`| ${row.join(" | ")} |`);
  md.push("");
};

md.push(
  "# Detection eval",
  "",
  `Generated ${new Date().toISOString()} by \`node scripts/detection-eval/run.mjs\`. Live path replayed at ${LIVE_RATE} Hz (the AudioContext rate; a 16 kHz input is resampled up to it, as the browser does).${GAIN_DB ? ` Every take boosted ${GAIN_DB} dB first (diagnostic run).` : ""}`,
  "",
);
const findings = join(OUT, "findings.md");
if (existsSync(findings) && !SUFFIX) md.push(readFileSync(findings, "utf8").trim(), "");

md.push(
  "## How to read this",
  "",
  "- **notes a/b +c**: note-ons from the live note tracker (what Reading, scales, lines and the fretboard drills receive). a of b expected notes arrived in order; +c extra note-ons (o = octave of an expected note, r = repeat of an expected note, s = a semitone off, x = anything else).",
  "- **frames**: of the frames with a pitch reading, the share on an expected note / an octave of one / anything else. Membership in the clip's note set, not time-aligned, so it flatters slightly.",
  "- **onsets a/b +c**: a of b expected attacks matched, +c extra onsets. Timing error is shown only for clips played to a click and includes the player.",
  "- **strum a/b**: chord readings (the chord reader over the 600 ms from each onset, the Strum & identify and Changes path) whose pitch classes are exactly the chord, of all readings. `named` is the chord identifier's top answer being the chord. `-X` lists chord tones missing, `+X` tones that should not be there.",
  "- **live**: the on-screen Hearing readout while the chord rings: share of readouts that are exactly the chord.",
  "- **rhythm**: the rhythm page's own chord read (the chord reader over the 400 ms from each onset; `unpitched` strums read no tones and count as muted strokes): chords whose tones were all heard across their strums.",
  "- Flags: `clipped` (samples at full scale), `quiet` (peak under -30 dBFS), `speaker click`.",
  "",
);

// Headline per detector and input
md.push("## Headline", "");
const agg = (input, pick) => {
  const xs = results
    .filter((r) => r.input === input && !r.skipped)
    .map(pick)
    .filter((x) => x);
  const sum = (k) => xs.reduce((a, x) => a + x[k], 0);
  return { xs, sum };
};
table(
  ["Detector", ...inputs.map((i) => SHORT[i])],
  [
    [
      "Single notes: expected notes that arrived (extra note-ons)",
      ...inputs.map((i) => {
        const a = agg(i, (r) => r.mono?.notes);
        return `${pct(a.sum("matched"), a.sum("expected"))}% (+${a.sum("extra")} on ${a.sum("expected")})`;
      }),
    ],
    [
      "Transcriber (offline melody): notes found (extra)",
      ...inputs.map((i) => {
        const a = agg(i, (r) => r.transcribe);
        return a.xs.length
          ? `${pct(a.sum("matched"), a.sum("expected"))}% (+${a.sum("extra")})`
          : "not run";
      }),
    ],
    [
      "Onsets: attacks found (extra onsets)",
      ...inputs.map((i) => {
        const a = agg(i, (r) => r.onsets);
        return `${pct(a.sum("hits"), a.sum("expected"))}% (+${a.sum("extra")} on ${a.sum("expected")})`;
      }),
    ],
    [
      "Chords at a strum: exactly right / named right",
      ...inputs.map((i) => {
        const a = agg(i, (r) => r.chord?.strum);
        return `${pct(a.sum("exact"), a.sum("n"))}% / ${pct(a.sum("named"), a.sum("n"))}% of ${a.sum("n")}`;
      }),
    ],
    [
      "Chords, live readout exactly right (mean of clips)",
      ...inputs.map((i) => {
        const a = agg(i, (r) => (r.chord?.live.n ? r.chord.live : null));
        return `${Math.round(mean(a.xs.map((x) => x.exactPct)) ?? 0)}%`;
      }),
    ],
    [
      "Rhythm page: chords fully heard",
      ...inputs.map((i) => {
        const a = agg(i, (r) => r.chord?.rhythm);
        return `${a.sum("held")}/${a.sum("chords")}`;
      }),
    ],
  ],
);

const monoCell = (r) => {
  if (!r) return "no take";
  if (r.skipped) return "empty";
  const m = r.mono;
  const k = m.notes?.extraKinds ?? {};
  const extras = m.notes
    ? ` +${m.notes.extra}${
        m.notes.extra
          ? ` (${[
              ["octave", "o"],
              ["repeat", "r"],
              ["semitone", "s"],
              ["other", "x"],
            ]
              .filter(([n]) => k[n])
              .map(([n, s]) => `${k[n]}${s}`)
              .join(" ")})`
          : ""
      }`
    : "";
  const head = m.notes
    ? `notes ${m.notes.matched}/${m.notes.expected}${extras}`
    : `bend ½: ${m.bend.half.verdict}, whole: ${m.bend.whole.verdict}`;
  const f = m.frames;
  return `${head}; frames ${f.exactPct ?? 0}/${f.octavePct ?? 0}/${f.otherPct ?? 0} (heard ${f.heardPct ?? 0}% of loud${f.gatedPct ? `, ${f.gatedPct}% gated` : ""}); onsets ${r.onsets.hits}/${r.onsets.expected} +${r.onsets.extra}${m.shift ? `; shift ${m.shift}` : ""}${r.transcribe ? `; transcribe ${r.transcribe.matched}/${r.transcribe.expected} +${r.transcribe.extra}` : ""}${flagText(r)}`;
};
const chordCell = (r) => {
  if (!r) return "no take";
  if (r.skipped) return "empty";
  const c = r.chord;
  const miss = tallyText(c.strum.missingPcs);
  const extra = tallyText(c.strum.extraPcs);
  return `strum ${c.strum.exact}/${c.strum.n}, named ${c.strum.named}${c.strum.short ? `, ${c.strum.short} too few tones` : ""}${miss ? ` -[${miss}]` : ""}${extra ? ` +[${extra}]` : ""}; live ${c.live.exactPct ?? "n/a"}%; rhythm ${c.rhythm.held}/${c.rhythm.chords}${c.rhythm.unpitched ? ` (${c.rhythm.unpitched} unpitched)` : ""}; onsets ${r.onsets.hits}/${r.onsets.expected} +${r.onsets.extra}${r.onsets.medianAbsErrMs !== null ? ` ±${r.onsets.medianAbsErrMs} ms` : ""}${flagText(r)}`;
};
const roomCell = (r, k = "room") => {
  if (!r) return "no take";
  if (r.skipped) return "empty";
  const m = r[k];
  const on =
    k === "muted"
      ? `onsets ${r.onsets.hits}/${r.onsets.expected} +${r.onsets.extra}`
      : `onsets ${m.onsets}${m.clicks ? ` (about ${m.clicks} clicks)` : ""}`;
  return `${on}; note-ons ${m.noteons}${m.noteNames ? ` (${m.noteNames})` : ""}; pitch on ${m.pitchFramesPct}% of frames; chord reads ${m.strumReads} (${m.strumReads3} with 3+ tones); live readout shows tones ${m.livePct}% of the time; rhythm pitched ${m.rhythmPitched}${flagText(r)}`;
};

for (const section of uniq(clips.map((c) => c.section))) {
  md.push(`## ${section}`, "");
  table(
    ["#", "Clip", ...inputs.map((i) => SHORT[i])],
    clips
      .filter((c) => c.section === section)
      .map((c) => [
        String(c.n).padStart(2, "0"),
        c.title,
        ...inputs.map((i) => {
          const r = cell(c.n, i);
          const kind = r?.kind;
          return kind === "room"
            ? roomCell(r)
            : kind === "muted"
              ? roomCell(r, "muted")
              : kind === "chord"
                ? chordCell(r)
                : monoCell(r);
        }),
      ]),
  );
}

md.push("## Levels and takes", "");
table(
  ["#", ...inputs.flatMap((i) => [`${SHORT[i]} peak`, "floor / playing dB", "ch"])],
  clips.map((c) => [
    String(c.n).padStart(2, "0"),
    ...inputs.flatMap((i) => {
      const r = cell(c.n, i);
      if (!r) return ["", "", ""];
      if (r.skipped) return [`${r.peakDb}`, "empty", ""];
      return [
        `${r.peakDb}${r.clippedSamples > 8 ? ` (${r.clippedSamples} clipped)` : ""}`,
        `${r.level.floorDb} / ${r.level.loudDb ?? "n/a"}`,
        r.channels > 1
          ? `${r.followed.channel + 1}${r.followed.switches.length ? ` @${r.followed.switches.join(",")}ms` : ""}`
          : "1",
      ];
    }),
  ]),
);

md.push(
  "## Chords in detail",
  "",
  "What each reading at a strum held, and what the live readout showed most.",
  "",
);
table(
  [
    "#",
    "Input",
    "Wanted",
    "Strum readings (identified as)",
    "Live readout sets",
    "Rhythm page reads",
  ],
  results
    .filter((r) => r.chord)
    .map((r) => [
      String(r.clip).padStart(2, "0"),
      SHORT[r.input],
      uniq(r.chord.strum.readings.map((s) => s.want)).join(" ") || "",
      r.chord.strum.readings.map((s) => `${pcsName(s.pcs)} (${s.identified ?? "?"})`).join("; "),
      tallyText(r.chord.live.sets),
      r.chord.rhythm.readings.map((s) => (s.pcs ? pcsName(s.pcs) : "unpitched")).join("; "),
    ]),
);

md.push("## Single notes in detail", "");
table(
  ["#", "Input", "Note-ons heard", "Wrong frames", "Cents spread / offset", "Transcriber"],
  results
    .filter((r) => r.mono)
    .map((r) => [
      String(r.clip).padStart(2, "0"),
      SHORT[r.input],
      r.mono.heardNotes,
      tallyText(r.mono.frames.wrong),
      `${r.mono.frames.centsSpread ?? "n/a"} / ${r.mono.frames.centsOffset ?? "n/a"}`,
      r.transcribe?.heardNotes ??
        (r.mono.bend
          ? `half ${JSON.stringify(r.mono.bend.half)} whole ${JSON.stringify(r.mono.bend.whole)}`
          : ""),
    ]),
);

if (results.some((r) => r.key)) {
  md.push("## Key (find home)", "");
  table(
    ["#", "Wanted", ...inputs.map((i) => SHORT[i])],
    clips
      .filter((c) => c.n in KEYS)
      .map((c) => [
        String(c.n).padStart(2, "0"),
        NAMES[KEYS[c.n]],
        ...inputs.map((i) => {
          const k = cell(c.n, i)?.key;
          return k ? `${k.best} (r ${k.r}; home ${k.home.join(", ")})` : "";
        }),
      ]),
  );
}

md.push(
  "## Worst cells by score",
  "",
  "Lowest scores first (F1 of found against expected and heard; 1 is perfect).",
  "",
);
const LABEL = {
  notes: "live notes",
  transcribe: "transcriber",
  onsets: "onsets",
  strum: "chord at strum",
  strumNamed: "chord named",
  live: "live chord readout",
  rhythmChord: "rhythm chord",
};
const worst = results
  .flatMap((r) => Object.entries(r.scores ?? {}).map(([k, v]) => ({ r, k, v })))
  .sort((a, b) => a.v - b.v)
  .slice(0, 40);
table(
  ["Score", "Detector", "#", "Clip", "Input", "Flags"],
  worst.map((w) => [
    w.v.toFixed(2),
    LABEL[w.k],
    String(w.r.clip).padStart(2, "0"),
    w.r.title,
    SHORT[w.r.input],
    w.r.flags.join(", "),
  ]),
);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `report${SUFFIX}.md`), md.join("\n") + "\n");
writeFileSync(
  join(OUT, `results${SUFFIX}.json`),
  JSON.stringify(
    { liveRate: LIVE_RATE, gainDb: GAIN_DB, generatedAt: new Date().toISOString(), results },
    null,
    1,
  ),
);
console.log(
  `Wrote ${join(OUT, `report${SUFFIX}.md`)} and results${SUFFIX}.json (${results.length} takes).`,
);
