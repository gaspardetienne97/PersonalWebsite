<script lang="ts">
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import type { NoteEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import {
    GROOVE_VOICES,
    GROOVES,
    RUDIMENT_HIT_COUNTS,
    RUDIMENT_TEMPOS,
    RUDIMENTS,
    grooveSkills,
    grooveTargetsFor,
    rudimentHits,
    rudimentSkills,
  } from "@repo/music-core/content/winds-pads";
  import { gradeGroove, gradeRudiment, grooveCaptureEnd, tempoDrift, type GrooveResult, type RudimentResult } from "@repo/music-core/scoring/pads";
  import { closestGapMs, gradeTier, measuredSwing, PAD_LEVELS, PAD_REPERTOIRE, repertoireFor, TIERS, topicSkill } from "@repo/music-core/content/pads-repertoire";
  import { getSetting, putSetting } from "$lib/music/runtime";
  import Picker from "$lib/music/components/Picker.svelte";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Pads from "$lib/music/components/Pads.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, input, settings } from "$lib/music/runtime";
  import GrooveGrid from "$lib/music/drills/pads/GrooveGrid.svelte";
  import StickingLane from "$lib/music/drills/pads/StickingLane.svelte";
  import MidiStatus from "$lib/music/drills/pads/MidiStatus.svelte";
  import NoteHighway, { type HighwayLane, type HighwayNote } from "$lib/music/drills/pads/NoteHighway.svelte";
  import { laneColor, starsFor, type Judgement } from "$lib/music/drills/pads/lanes";
  import { backingChords, backingFor } from "$lib/music/drills/pads/backing";
  import { padLabel } from "$lib/music/drills/pads/midi-status";

  const cfg = new DrillSetup("pads", {
    mode: "rudiment" as string,
    pattern: "single-strokes" as string,
    sub: 2,
    hits: 16,
    padL: 36,
    padR: 38,
    groove: "backbeat" as string,
    sound: true as boolean,
    // Hold the tempo: the groove played for twelve bars, the click gone after four.
    steady: "basic-rock" as string,
    // Practice tools, as play-along apps have them: play it more than once, or wait for each note.
    plays: 1,
    wait: false as boolean,
    // A small band under the groove (chords by style, bass on the kick).
    backing: false as boolean,
  });
  const s = $derived(cfg.value);
  // Path steps carry their tempo (?bpm=); the practice strip owns it from then on.
  const urlBpm = Number(page.url.searchParams.get("bpm"));
  // Wait for the stored row: an update before it loads would write defaults over it.
  if (urlBpm) void settings.ready.then(() => settings.update({ bpm: clamp(Math.round(urlBpm), 30, 240) }));
  const bpm = $derived(clamp(settings.value.bpm, 30, 240));
  const beatMs = $derived(60000 / bpm);

  /** Hold the tempo: a groove too, longer, with the click for the first four bars only. */
  const isSteady = $derived(s.mode === "steady");
  const isGroove = $derived(s.mode === "groove" || isSteady);
  const pattern = $derived(RUDIMENTS.find((r) => r.id === s.pattern) ?? RUDIMENTS[0]);
  const perBeat = $derived(("subdivision" in pattern && pattern.subdivision) || (s.sub as 2 | 3 | 4));
  const stepMs = $derived(beatMs / perBeat);
  const pads = $derived<[number, number]>(s.padL === s.padR ? [36, 38] : [s.padL, s.padR]);
  const hits = $derived(rudimentHits({ patternId: pattern.id, subdivision: s.sub as 2 | 3 | 4, hits: s.hits, bpm, pads }));
  const strokes = $derived(hits.filter((h) => !h.grace));
  const STEADY_BARS = 12;
  const CLICK_BARS = 4;
  // The repertoire holds the table's grooves and the app's, by level.
  const entry = $derived(repertoireFor(isSteady ? s.steady : s.groove) ?? PAD_REPERTOIRE[0]);
  const levelOf = $derived(PAD_LEVELS.find((l) => l.level === entry.level)!);
  /** Hold the tempo repeats the groove to twelve bars: four with the click, eight without. */
  const played = $derived.by(() => {
    const g = entry.groove;
    const plays = waitMode ? 1 : Math.max(1, Math.min(4, Math.round(s.plays)));
    if (!isSteady && plays === 1) return g;
    const cycles = isSteady ? Math.ceil(STEADY_BARS / g.bars) : plays;
    return {
      ...g,
      bars: cycles * g.bars,
      sectionLabels: isSteady
        ? Array.from({ length: cycles * g.bars }, (_, b) => (b < CLICK_BARS ? "with the click" : "on your own"))
        : Array.from({ length: cycles }, () => g.sectionLabels).flat(),
      targets: Array.from({ length: cycles }, (_, c) => g.targets.map((t) => ({ ...t, beat: t.beat + c * g.bars * 4 }))).flat(),
    };
  });
  const groove = $derived(grooveTargetsFor(played, bpm));
  const voicePads = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  /** Wait mode: no click; each note waits until its pads are hit (learn it, then time it). */
  const waitMode = $derived(!!s.wait && !isSteady && mode === "practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let rud = $state<RudimentResult | null>(null);
  let grv = $state<GrooveResult | null>(null);
  /** The research's measures on top of the groove grade: perfect and good, swing, drift, each drum's lean. */
  let extra = $state.raw<{
    tier: ReturnType<typeof gradeTier>;
    swing: number | null;
    drift: ReturnType<typeof tempoDrift>;
    bias: { voice: string; ms: number | null }[];
    pass: boolean;
  } | null>(null);
  /** Misses in a row at this tempo: two step the ladder back down. */
  let fails = 0;
  const ladderKey = (id: string) => `music.pads.ladder.${id}`;
  /** Pick a groove and start at its ladder's tempo (its start tempo the first time). */
  async function pickGroove(id: string, key: "groove" | "steady" = "groove") {
    cfg.set({ [key]: id });
    fails = 0;
    const r = repertoireFor(id);
    if (!r) return;
    const saved = key === "steady" ? r.bpm.start : await getSetting<number>(ladderKey(id), r.bpm.start);
    void settings.update({ bpm: saved });
  }
  let downbeat = $state(0);
  let now = $state(0);
  let demo = $state<{ stop(): void; playing: boolean; startPerf: number } | null>(null);
  let demoLit = $state<Record<number, boolean>>({});
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let band: { stop(): void } | null = null;
  /** The band plays under grooves, never under Hold the tempo (it would carry the tempo) or Wait mode. */
  const withBacking = $derived(!!s.backing && isGroove && !isSteady && !waitMode);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;

  // Visual clock only (scheduling stays on the audio clock).
  $effect(() => {
    if (phase !== "running" && phase !== "countin" && !demo?.playing) return;
    let raf = 0;
    const loop = () => {
      now = performance.now();
      sweepMisses();
      // Wait mode glides the highway to the next waiting note.
      if (waitMode && waitGroups.length) waitShown += ((waitGroups[Math.min(waitIdx, waitGroups.length - 1)] ?? 0) - 120 - waitShown) * 0.2;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });
  const base = $derived(demo?.playing ? demo.startPerf : phase === "running" ? downbeat : null);
  const strokeNow = $derived(base === null ? null : Math.round((now - base) / stepMs));
  const sixteenthNow = $derived(base === null || now < base ? null : Math.floor((now - base) / (beatMs / 4)));

  // MIDI pad hits sound here (the MPC in Controller Mode is silent); on-screen
  // taps already sound through the input layer.
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind === "noteon" && e.source !== "onscreen" && cfg.value.sound) audio.drum(e.midi, e.velocity);
    }),
  );

  const names = $derived<Record<number, string>>(
    isGroove
      ? Object.fromEntries(GROOVE_VOICES.filter((v) => groove.targets.some((t) => t.voice === v.id)).map((v) => [v.midi, v.name]))
      : pattern.onePad
        ? { [pads[1]]: "Both fingers" }
        : { [pads[0]]: "Left", [pads[1]]: "Right" },
  );

  // ---------------------------------------------------------------------------
  // The highway: lanes, notes, live judgements, streak.

  /** Top to bottom as drum notation reads: cymbals, hats, toms, snare, kick. */
  const LANE_ORDER = ["crash", "ride", "openhat", "hats", "pedalhat", "tom-high", "tom-mid", "perc", "rim", "snare", "tom-low", "kick", "808"];
  const lanes = $derived<HighwayLane[]>(
    isGroove
      ? LANE_ORDER.filter((v) => groove.targets.some((t) => t.voice === v)).map((v) => ({ id: v, label: voiceName(v), color: laneColor(v) }))
      : pattern.onePad
        ? [{ id: "both", label: "Both", color: laneColor("both") }]
        : [
            { id: "right", label: "Right", color: laneColor("right") },
            { id: "left", label: "Left", color: laneColor("left") },
          ],
  );
  /** What is judged live, in order: the groove's targets or the rudiment's strokes. */
  const live = $derived(
    isGroove
      ? groove.targets.map((t) => ({ pad: t.pad, atMs: t.atMs, lane: lanes.findIndex((l) => l.id === t.voice), kind: (t.accent ? "accent" : t.ghost ? "ghost" : "normal") as HighwayNote["kind"] }))
      : strokes.map((h) => ({ pad: h.pad, atMs: h.atMs, lane: pattern.onePad || h.hand === "right" ? 0 : 1, kind: (h.accent ? "accent" : h.velocityBand ? "ghost" : "normal") as HighwayNote["kind"] })),
  );
  const padColors = $derived<Record<number, string>>(
    isGroove
      ? Object.fromEntries(GROOVE_VOICES.filter((v) => groove.targets.some((t) => t.voice === v.id)).map((v) => [v.midi, laneColor(v.id)]))
      : pattern.onePad
        ? { [pads[1]]: laneColor("both") }
        : { [pads[0]]: laneColor("left"), [pads[1]]: laneColor("right") },
  );
  /** The level's perfect and good windows (beginner for technique), good capped by the closest spacing. */
  const judgeWindow = $derived.by(() => {
    const tier = isGroove ? TIERS[levelOf.tier] : TIERS.beginner;
    const good = Math.min(tier.good, 0.4 * (isGroove ? closestGapMs(groove.targets, beatMs) : stepMs));
    return { perfect: Math.min(tier.perfect, good), good };
  });
  let judged = $state<Record<number, Judgement>>({});
  let streak = $state(0);
  let bestStreak = $state(0);
  let flashKey = 0;
  let flashNote = $state<{ judgement: Judgement | "extra"; ms?: number; key: number } | null>(null);
  const judgedCount = $derived(Object.keys(judged).length);
  const liveScore = $derived(
    judgedCount ? Object.values(judged).reduce((t, j) => t + (j === "perfect" ? 1 : j === "miss" ? 0 : 0.7), 0) / judgedCount : null,
  );
  /** A hit, judged against the nearest unjudged note on its pad inside the good window. */
  function judge(e: NoteEvent) {
    const at = e.at - downbeat;
    let best = -1;
    let err = Infinity;
    live.forEach((t, i) => {
      if (judged[i] || t.pad !== e.midi) return;
      const d = at - t.atMs;
      if (Math.abs(d) <= judgeWindow.good && Math.abs(d) < Math.abs(err)) [best, err] = [i, d];
    });
    if (best < 0) {
      flashNote = { judgement: "extra", key: ++flashKey };
      return;
    }
    const j: Judgement = Math.abs(err) <= judgeWindow.perfect ? "perfect" : err < 0 ? "early" : "late";
    judged = { ...judged, [best]: j };
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    flashNote = { judgement: j, ms: err, key: ++flashKey };
  }
  /** Notes gone past the good window unhit: missed, and the streak resets. */
  function sweepMisses() {
    if (phase !== "running" || waitMode) return;
    const rel = performance.now() - downbeat;
    let missed = false;
    const next = { ...judged };
    live.forEach((t, i) => {
      if (!next[i] && t.atMs + judgeWindow.good < rel) {
        next[i] = "miss";
        missed = true;
      }
    });
    if (missed) {
      judged = next;
      streak = 0;
      flashNote = { judgement: "miss", key: ++flashKey };
    }
  }

  // Wait mode: the notes stop at each group until its pads are hit.
  let waitGroups = $state<number[]>([]);
  let waitIdx = $state(0);
  let waitShown = $state(0);
  let wrongPads = 0;
  function waitHit(e: NoteEvent) {
    const at = waitGroups[waitIdx];
    const due = live.flatMap((t, i) => (Math.abs(t.atMs - at) < 1 && !judged[i] ? [i] : []));
    const hit = due.find((i) => live[i].pad === e.midi);
    if (hit === undefined) {
      wrongPads++;
      streak = 0;
      flashNote = { judgement: "extra", key: ++flashKey };
      return;
    }
    judged = { ...judged, [hit]: "perfect" };
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    flashNote = { judgement: "perfect", key: ++flashKey };
    if (due.length === 1) {
      waitIdx++;
      if (waitIdx >= waitGroups.length) finishWait();
    }
  }
  function finishWait() {
    clearTimeout(timer);
    cap?.stop();
    phase = "results";
    const n = live.length;
    summary = {
      headline: `All ${n} notes in order${wrongPads ? `, with ${wrongPads} wrong pad${wrongPads > 1 ? "s" : ""}` : ", no wrong pads"}. Now turn Wait off and play it in time.`,
      metric: String(n),
      metricLabel: "notes learned",
      rows: [
        { label: "Wrong pads", text: String(wrongPads) },
        { label: "Longest run without a wrong pad", text: String(bestStreak) },
      ],
      assistance: "Wait mode waits for you, so it is learning, not timing: nothing is recorded.",
      recorded: false,
    };
    status = summary.headline;
  }

  // Stars, best kept per groove or rudiment.
  const STARS_KEY = "music.pads.stars";
  let bestStars = $state<Record<string, number>>({});
  void getSetting<Record<string, number>>(STARS_KEY, {}).then((v) => (bestStars = v));
  let stars = $state<number | null>(null);
  const starsId = $derived(isSteady ? `steady:${entry.groove.value}` : isGroove ? entry.groove.value : `rudiment:${pattern.id}`);
  const starText = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    for (const [m, on] of Object.entries(demoLit)) if (on) out[+m] = { demo: true };
    if (mode === "check" || phase === "results" || demo?.playing) return out;
    if (phase === "running" && waitMode) {
      // The pads the waiting notes need.
      const at = waitGroups[waitIdx];
      live.forEach((t, i) => {
        if (Math.abs(t.atMs - at) < 1 && !judged[i]) out[t.pad] = { target: true };
      });
      return out;
    }
    if (phase === "running") {
      // A pad glows in its lane's colour as its note comes up (half a beat ahead).
      const rel = now - downbeat;
      const ahead = Math.min(beatMs / 2, 260);
      for (const t of live) if (t.atMs >= rel - 40 && t.atMs <= rel + ahead) out[t.pad] = { target: true };
      return out;
    }
    if (!isGroove)
      for (const [i, p] of pads.entries()) if (!pattern.onePad || i === 1) out[p] = { role: i ? "right" : "left", target: phase === "ready" };
    return out;
  });

  const summaryLine = $derived(
    isSteady
      ? `Hold the tempo: ${entry.groove.label}, ${CLICK_BARS} bars with the click and ${STEADY_BARS - CLICK_BARS} on your own, ${bpm} BPM`
      : isGroove
      ? `Level ${entry.level}: ${groove.groove.label}, ${groove.groove.bars} bar${groove.groove.bars > 1 ? "s" : ""}, ${bpm} BPM (aim for ${entry.bpm.target})${entry.swing ? `, swing ${entry.swing}%` : ""}`
      : `Rudiment: ${pattern.label}, ${({ 2: "eighths", 3: "triplets", 4: "sixteenths" } as Record<number, string>)[perBeat]}, ${s.hits} hits, pads ${padLabel(pads[0])} and ${padLabel(pads[1])}, ${bpm} BPM`,
  );
  const setupKey = $derived(
    isSteady ? `steady:${s.steady}:${bpm}` : isGroove ? `groove:${s.groove}:${bpm}` : `rudiment:${pattern.id}:${perBeat}:${s.hits}:${pads.join("-")}:${bpm}`,
  );

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoLit = {};
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes = isGroove
      ? [...groove.targets.map((t) => ({ midi: t.pad, time: t.atMs / 1000, duration: 0.12, velocity: t.accent ? 1 : 0.7, voice: "drum" as const })), ...(withBacking ? backingFor(entry.style, groove.targets, groove.groove.bars, beatMs) : [])]
      : hits.map((h) => ({ midi: h.pad, time: (h.atMs + 30) / 1000, duration: 0.1, velocity: h.grace ? 0.4 : h.accent || !hits.some((x) => x.accent) ? 0.95 : 0.55, voice: "drum" as const }));
    const handle = audio.playSequence(notes, {
      onNote: (i: number) => {
        if (notes[i].voice !== "drum") return;
        const m = notes[i].midi;
        demoLit = { ...demoLit, [m]: true };
        setTimeout(() => (demoLit = { ...demoLit, [m]: false }), 110);
      },
    });
    demo = handle;
    status = "Listen: the pattern at tempo, pads lit as they sound. Not scored.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function nearest<T extends { atMs: number }>(list: T[], at: number, ok: (t: T) => boolean) {
    let best: T | null = null;
    for (const t of list) if (ok(t) && (!best || Math.abs(t.atMs - at) < Math.abs(best.atMs - at))) best = t;
    return best;
  }

  function onHit(e: NoteEvent) {
    if (phase !== "running" || mode !== "practice") return;
    if (waitMode) return waitHit(e);
    judge(e);
    const at = e.at - downbeat;
    if (isGroove) {
      const t = nearest(groove.targets, at, (x) => x.pad === e.midi);
      flashes.add(e.midi, t && Math.abs(t.atMs - at) <= groove.matchWindowMs ? "correct" : "wrong");
    } else {
      const t = nearest(strokes, at, () => true);
      flashes.add(e.midi, t && t.pad === e.midi && Math.abs(t.atMs - at) <= stepMs / 2 ? "correct" : "wrong");
    }
  }

  function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    rud = null;
    grv = null;
    extra = null;
    flashes.clear();
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    judged = {};
    streak = 0;
    bestStreak = 0;
    flashNote = null;
    stars = null;
    if (waitMode) {
      waitGroups = [...new Set(live.map((t) => Math.round(t.atMs)))].sort((a, b) => a - b);
      waitIdx = 0;
      waitShown = -beatMs;
      wrongPads = 0;
      run = null;
      cap = capture(performance.now() - 50, (e) => e.kind === "noteon" && onHit(e));
      status = "Wait mode: hit the glowing pads; each note waits for you.";
      return;
    }
    run = practice.beginRun({
      exerciseId: isSteady ? "technique.mpc.steadiness" : isGroove ? "technique.mpc.groove" : "technique.mpc.single-strokes",
      setupKey,
      skillIds: isSteady
        ? ["technique.mpc", "technique.mpc.steadiness"]
        : isGroove
          ? [...new Set([...(GROOVES.some((g) => g.value === s.groove) ? grooveSkills(s.groove) : ["technique.mpc"]), topicSkill(entry.topic)])]
          : rudimentSkills(pattern.id),
      capabilities: ["technique", "rhythm"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: isGroove
        ? clamp(0.1 + entry.level * 0.12 + (bpm / entry.bpm.target - 1) * 0.3, 0.05, 0.95)
        : clamp(0.25 + (perBeat - 2) * 0.1 + (bpm - 60) / 300 + (pattern.id === "paradiddle" || pattern.id === "flam" ? 0.1 : 0), 0, 1),
      instrument: "mpc",
      params: isGroove ? { bpm, groove: entry.groove.value, mode: s.mode } : { bpm, pattern: pattern.id, sub: perBeat, hits: s.hits, padL: pads[0], padR: pads[1] },
    });
    const wait = Math.max(0, ctx.downbeat - performance.now());
    if (withBacking) band = audio.playSequence(backingFor(entry.style, groove.targets, groove.groove.bars, beatMs), { startPerf: ctx.downbeat });
    if (isGroove) {
      // Scored input opens after the count-in; the grader's window catches an early first hit.
      cap = capture(ctx.downbeat - groove.matchWindowMs, (e) => e.kind === "noteon" && onHit(e));
      const lastAt = Math.max(...groove.targets.map((t) => t.atMs));
      const end = grooveCaptureEnd(ctx.downbeat + lastAt, beatMs, ctx.downbeat + groove.lengthMs);
      timer = setTimeout(() => void finish(), end - performance.now() + 150);
      if (isSteady) {
        clickTimer = setTimeout(() => {
          ctx.stopClock();
          if (phase === "running") status = "On your own now: hold the tempo.";
        }, ctx.downbeat + CLICK_BARS * 4 * beatMs - performance.now() - 30);
      }
    } else {
      cap = capture(ctx.downbeat - stepMs / 2, (e) => e.kind === "noteon" && onHit(e));
      timer = setTimeout(() => void finish(), wait + strokes[strokes.length - 1].atMs + stepMs + 200);
    }
  }

  const velocityWhy = (notes: NoteEvent[]) =>
    notes.some((n) => n.source !== "midi") ? "on-screen hits carry no velocity" : "every hit had the same velocity; is Full Level on?";

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    clearTimeout(clickTimer);
    band?.stop();
    band = null;
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    let graded: { score: number; correct: boolean; metrics: RudimentResult["metrics"] };
    if (isGroove) {
      const r = gradeGroove({
        targets: groove.targets.map((t) => ({ voice: t.voice, beat: t.beat, accent: t.accent ? "accent" : "normal" })),
        voicePads,
        sectionLabels: played.sectionLabels,
        beatsPerBar: 4,
        beatMs,
        startAt: downbeat,
        hits: notes,
        responseEnd: downbeat + groove.lengthMs,
      });
      if ("error" in r) {
        phase = "ready";
        status = r.error;
        return;
      }
      grv = r;
      const tier = gradeTier(r.perTarget, levelOf.tier, closestGapMs(groove.targets, beatMs));
      const drift = isSteady ? tempoDrift(groove.targets, r.perTarget, beatMs, CLICK_BARS * 4) : null;
      // Early (negative) or late per drum: each finger has its own lean.
      const bias = [...new Set(groove.targets.map((t) => t.voice))].map((voice) => {
        const errs = groove.targets.flatMap((t, i) => (t.voice === voice && r.perTarget[i] !== null ? [r.perTarget[i]!] : []));
        return { voice, ms: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : null };
      });
      const steadyOk = !drift || Math.abs(drift.driftBpm) < 3;
      extra = { tier, swing: entry.swing ? measuredSwing(groove.targets, r.perTarget, beatMs) : null, drift, bias, pass: tier.pass && steadyOk };
      // Holding the tempo counts in the score: drifting 3 BPM or more costs 40%.
      graded = { ...r, score: steadyOk ? r.score : r.score * 0.6, correct: tier.pass && steadyOk };
      // The tempo ladder: a pass moves this groove's next tempo up 5, to the target.
      if (!isSteady) {
        const key = ladderKey(entry.groove.value);
        if (extra.pass) {
          fails = 0;
          if (bpm < entry.bpm.target) void putSetting(key, Math.min(entry.bpm.target, bpm + 5));
        } else if (++fails >= 2) {
          fails = 0;
          void putSetting(key, Math.max(entry.bpm.start, bpm - 5));
        }
      }
    } else {
      const r = gradeRudiment({
        strokes: strokes.map((h) => ({ pad: h.pad, offsetMs: h.atMs, band: h.velocityBand ? (h.accent ? ("accent" as const) : ("tap" as const)) : undefined })),
        stepMs,
        anchorAt: downbeat,
        hits: notes,
      });
      rud = r;
      graded = r;
    }
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: graded.correct,
      partialCredit: graded.score,
      metrics: graded.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, "mpc") ?? null,
      target: isGroove ? groove.targets.map((t) => t.pad) : strokes.map((h) => h.pad),
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score: graded.score, correct: graded.correct, headline: `${pct(graded.score)} at ${bpm} BPM` });
    summary = {
      ...(isGroove ? grooveSummary(grv!, ons) : rudimentSummary(rud!, ons)),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: graded.correct && mode === "check",
      assistance: assistanceText(mode),
    };
    stars = starsFor(graded.score, isGroove ? !!extra?.pass : graded.correct);
    if (stars > (bestStars[starsId] ?? 0)) {
      bestStars = { ...bestStars, [starsId]: stars };
      void putSetting(STARS_KEY, bestStars);
    }
    status = summary.headline;
  }

  function rudimentSummary(r: RudimentResult, ons: NoteEvent[]): RunSummary {
    const ms = Math.round(r.meanAbsErrorMs);
    const wrongPads = r.perStroke.filter((p) => p && !p.rightPad).length;
    const headline = !ons.length
      ? "No hits arrived. Check the line under the stage for why."
      : r.correct
        ? `Clean: every stroke landed, ${ms} ms off the click on average.`
        : r.completion < 1
          ? `${r.matched} of ${r.total} strokes landed. Keep going to the last one.`
          : r.pad < 0.875
            ? `${wrongPads} stroke${wrongPads === 1 ? "" : "s"} on the wrong pad. Slow down and say the sticking.`
            : ms > 90
              ? `Right pads, but ${ms} ms off the click on average. Aim for 90 or less.`
              : "Timing and pads are right; the accents missed their velocity bands.";
    return {
      headline,
      metric: pct(r.score),
      metricLabel: r.velocity === null ? "score, velocity not measured" : "score",
      rows: [
        { label: "Right pad", value: r.pad, text: `${r.matched - wrongPads} of ${r.total}` },
        { label: "Timing vs the click", value: r.timing, text: `${ms} ms off` },
        r.velocity === null
          ? { label: `Velocity: ${velocityWhy(ons)}`, notMeasured: true }
          : { label: hits.some((h) => h.velocityBand) ? "Accents in band" : "Velocity evenness", value: r.velocity },
        { label: "Completed", value: r.completion, text: `${r.matched} of ${r.total}${r.extra ? `, ${r.extra} extra` : ""}` },
      ],
    };
  }

  function sectionWord(label: string, r: GrooveResult) {
    const sec = r.perSection.find((x) => x.label === label)!;
    if (sec.missed) return `${sec.missed} missed`;
    if (sec.extra) return `${sec.extra} extra`;
    const errs = groove.targets.flatMap((t, i) => (t.section === label && r.perTarget[i] !== null ? [r.perTarget[i]!] : []));
    const signed = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
    if (sec.meanAbsErrorMs > 45) return signed > 0 ? "late" : "early";
    return "clean";
  }

  function grooveSummary(r: GrooveResult, ons: NoteEvent[]): RunSummary {
    const ms = Math.round(r.meanAbsErrorMs);
    const labels = [...new Set(groove.groove.sectionLabels)];
    const total = groove.targets.length;
    let headline: string;
    if (!ons.length) headline = "No hits arrived. Check the line under the stage for why.";
    else if (labels.length > 1) {
      const parts = labels.map((l) => `${l} ${sectionWord(l, r)}`).join(", ");
      headline = parts.charAt(0).toUpperCase() + parts.slice(1) + ".";
    } else if (r.correct) headline = `Clean: all ${total} hits in the window, ${ms} ms off on average.`;
    else if (r.missed || r.extra) headline = `${r.missed ? `${r.missed} missed` : ""}${r.missed && r.extra ? " and " : ""}${r.extra ? `${r.extra} extra` : ""} out of ${total}. The grid shows where.`;
    else headline = `Every hit landed, ${ms} ms off on average. Tighten it under 90.`;
    const x = extra!;
    if (ons.length && isSteady && x.drift) {
      const d = x.drift;
      const way = Math.abs(d.driftBpm) < 0.5 ? "held it" : d.driftBpm > 0 ? `rushed to ${d.bpmPlayed.toFixed(1)}` : `dragged to ${d.bpmPlayed.toFixed(1)}`;
      headline = `On your own you ${way} (${bpm} BPM asked), and ended ${Math.abs(Math.round(d.endOffsetMs))} ms ${d.endOffsetMs < 0 ? "ahead of" : "behind"} the grid. ${x.pass ? "Steady." : Math.abs(d.driftBpm) >= 3 ? "Aim to stay within 3 BPM." : ""}`.trim();
    } else if (ons.length && !isSteady)
      headline = x.pass
        ? `Passed level ${entry.level} at ${bpm} BPM: ${Math.round(x.tier.perfect * 100)}% perfect, ${Math.round(x.tier.good * 100)}% good.${bpm < entry.bpm.target ? ` Next time: ${Math.min(entry.bpm.target, bpm + 5)} BPM.` : " At the target tempo."}`
        : `${headline} ${Math.round(x.tier.good * 100)}% good of the 90% to pass, ${Math.round(x.tier.perfect * 100)}% perfect of 70%.`;
    const leans = x.bias.filter((b) => b.ms !== null && Math.abs(b.ms) >= 8);
    return {
      headline,
      metric: pct(r.score),
      metricLabel: r.inBand === null ? "score, accents not measured" : "score",
      rows: [
        { label: `Perfect (within ${Math.round(x.tier.perfectMs)} ms)`, value: x.tier.perfect, text: `${Math.round(x.tier.perfect * 100)}%, 70% to pass` },
        { label: `Good (within ${Math.round(x.tier.goodMs)} ms)`, value: x.tier.good, text: `${Math.round(x.tier.good * 100)}%, 90% to pass` },
        ...(x.swing !== null ? [{ label: "Swing played", value: Math.max(0, 1 - Math.abs(x.swing - (entry.swing ?? 50)) / 10), text: `${x.swing}%, aiming for ${entry.swing}%` }] : []),
        ...(leans.length ? [{ label: "Each drum's lean", text: leans.map((b) => `${voiceName(b.voice)} ${Math.abs(b.ms!)} ms ${b.ms! < 0 ? "early" : "late"}`).join(", ") }] : []),
        { label: "Hits matched", value: r.matched / total, text: `${r.matched} of ${total}` },
        { label: "Extra hits", value: r.extra ? Math.max(0, 1 - r.extra / total) : 1, text: String(r.extra) },
        { label: "Timing", value: Math.max(0, 1 - r.meanAbsErrorMs / 180), text: `${ms} ms off` },
        r.inBand === null
          ? { label: `Accents: ${velocityWhy(ons)}`, notMeasured: true }
          : { label: "Accents in band", value: r.inBand / total, text: `${r.inBand} of ${total}` },
      ],
    };
  }

  function stop() {
    clearTimeout(timer);
    clearTimeout(clickTimer);
    band?.stop();
    band = null;
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function retempo(delta: number) {
    void settings.update({ bpm: clamp(bpm + delta, 30, 240) });
    phase = "ready";
    summary = null;
  }

  function setMode(m: string) {
    if (phase === "running" || phase === "countin") return;
    stopDemo();
    cfg.set({ mode: m });
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    clearTimeout(timer);
    clearTimeout(clickTimer);
    band?.stop();
    cap?.stop();
    stopDemo();
  });

  const MODES = [
    ["rudiment", "Technique"],
    ["groove", "Grooves"],
    ["steady", "Hold the tempo"],
  ] as const;
  const grooveOptions = $derived(PAD_REPERTOIRE.map((r) => ({
    value: r.groove.value,
    label: `${r.groove.label}${r.groove.bars > 1 ? ` (${r.groove.bars} bars)` : ""}${bestStars[r.groove.value] ? ` ${starText(bestStars[r.groove.value])}` : ""}`,
    group: `Level ${r.level}: ${PAD_LEVELS.find((l) => l.level === r.level)!.title}`,
  })));
  const padOptions = Array.from({ length: 16 }, (_, i) => ({ value: 36 + i, label: `${padLabel(36 + i)} (${36 + i})` }));
  const voiceName = (id: string) => GROOVE_VOICES.find((v) => v.id === id)?.name ?? id;
</script>

<svelte:head><title>Pads | Woodshed</title></svelte:head>

<DrillShell
  title="Pads"
  hue="mpc"
  blurb={isSteady
    ? "Play a groove with the click, then keep it going when the click stops."
    : isGroove
      ? "Play the groove as the notes come at you. Each level tightens the timing; a pass moves the tempo up."
      : "Finger technique on the click: strokes, rolls, accents and ghosts."}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={base === null ? 0 : clamp((now - base) / (isGroove ? groove.lengthMs : strokes[strokes.length - 1].atMs + stepMs), 0, 1)}
  clock={waitMode ? undefined : { bpm, beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Mode" options={MODES.map(([value, label]) => ({ value, label }))} value={s.mode} onchange={setMode} />
      {#if isSteady}
        <div class="flex min-w-0 flex-col gap-1 text-sm">
          <span class="font-medium">Groove to hold</span>
          <Picker label="Groove to hold" value={s.steady} options={grooveOptions.filter((o) => (repertoireFor(o.value)?.level ?? 9) <= 3)} onchange={(v) => pickGroove(v, "steady")} />
        </div>
      {:else if isGroove}
        <div class="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
          <span class="font-medium">Groove</span>
          <Picker label="Groove" value={entry.groove.value} options={grooveOptions} onchange={(v) => pickGroove(v)} />
        </div>
      {:else}
        <Choice label="Rudiment" select options={RUDIMENTS.map((r) => ({ value: r.id, label: r.label }))} value={s.pattern} onchange={(v) => cfg.set({ pattern: v })} />
        <Choice
          label="Subdivision{'subdivision' in pattern && pattern.subdivision ? ' (this rudiment sets its own)' : ''}"
          options={[
            { value: 2, label: "Eighths" },
            { value: 3, label: "Triplets" },
            { value: 4, label: "Sixteenths" },
          ]}
          value={perBeat}
          disabled={"subdivision" in pattern && !!pattern.subdivision}
          onchange={(v) => cfg.set({ sub: v })}
        />
        <Choice label="Hits" options={RUDIMENT_HIT_COUNTS.map((n) => ({ value: n as number, label: String(n) }))} value={s.hits} onchange={(v) => cfg.set({ hits: v })} />
        <Choice label="Left-hand pad" select options={padOptions} value={pads[0]} onchange={(v) => cfg.set(v === pads[1] ? { padL: v, padR: pads[0] } : { padL: v })} />
        <Choice label="Right-hand pad" select options={padOptions} value={pads[1]} onchange={(v) => cfg.set(v === pads[0] ? { padR: v, padL: pads[1] } : { padR: v })} />
      {/if}
      {#if !isSteady}
        <Choice label="Wait mode (learn it)" options={[{ value: "off", label: "Off" }, { value: "on", label: "On: no click, notes wait" }]} value={s.wait ? "on" : "off"} onchange={(v) => cfg.set({ wait: v === "on" })} />
      {/if}
      {#if isGroove && !isSteady}
        <Choice
          label="Backing"
          options={[
            { value: "off", label: "Click only" },
            { value: "on", label: `Band: ${backingChords(entry.style).join(" ")}` },
          ]}
          value={s.backing ? "on" : "off"}
          onchange={(v) => cfg.set({ backing: v === "on" })}
        />
        <Choice label="Plays" options={[1, 2, 4].map((n) => ({ value: n, label: n === 1 ? "Once" : `${n} times` }))} value={s.plays} onchange={(v) => cfg.set({ plays: v })} />
      {/if}
      {#if !isGroove}
        <Choice label="Tempo (BPM)" options={RUDIMENT_TEMPOS.map((t) => ({ value: t, label: String(t) }))} value={bpm} onchange={(v) => settings.update({ bpm: v })} />
      {/if}
      <Choice
        label="Pad sounds"
        options={[
          { value: "on", label: "On" },
          { value: "off", label: "Off (the MPC makes its own)" },
        ]}
        value={s.sound ? "on" : "off"}
        onchange={(v) => cfg.set({ sound: v === "on" })}
      />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && mode === "practice"}
      <Stat label="Streak" value={streak} tone={streak >= 8 ? "success" : undefined} />
      {#if liveScore !== null}<Stat label="Score so far" value="{Math.round(liveScore * 100)}%" />{/if}
    {/if}
    {#if phase === "running" && waitMode}
      <Stat label="Notes" value="{Object.keys(judged).length} of {live.length}" />
    {:else if phase === "running" && !isGroove && strokeNow !== null}
      <Stat label="Stroke" value="{clamp(strokeNow + 1, 1, strokes.length)} of {strokes.length}" />
    {:else if phase === "running" && isGroove && sixteenthNow !== null}
      <Stat label="Bar" value="{Math.min(groove.groove.bars, Math.floor(sixteenthNow / 16) + 1)} of {groove.groove.bars}" />
    {:else if rud}
      <Stat label="Landed" value="{rud.matched}/{rud.total}" tone={rud.completion === 1 ? "success" : "warn"} />
      <Stat label="Mean error" value="{Math.round(rud.meanAbsErrorMs)} ms" tone={rud.meanAbsErrorMs <= 90 ? "success" : "warn"} />
    {:else if grv}
      <Stat label="Matched" value="{grv.matched}/{groove.targets.length}" tone={grv.missed ? "warn" : "success"} />
      <Stat label="Extra" value={grv.extra} tone={grv.extra ? "warn" : "success"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-4" data-downbeat={phase === "running" || phase === "countin" ? downbeat : undefined} data-targets={isGroove ? JSON.stringify(groove.targets.map((t) => [t.pad, Math.round(t.atMs), t.accent ? "a" : t.ghost ? "g" : "n"])) : undefined} data-testid="pads-stage">
      {#if phase === "ready" || phase === "results"}
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Pads mode">
          {#each MODES as [id, label] (id)}
            <button
              type="button"
              class="min-h-11 rounded-full px-4 text-sm font-semibold {s.mode === id ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/10 text-ws-stage-ink hover:bg-ws-stage-ink/20'}"
              aria-pressed={s.mode === id}
              onclick={() => setMode(id)}>{label}</button
            >
          {/each}
        </div>
      {/if}
      <!-- The notes on top, the pads under them, as play-along apps stack them. -->
      <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5">
        <div class="min-w-0">
          {#if (phase === "running" || phase === "countin" || demo?.playing) && (mode === "practice" || demo?.playing)}
            <!-- While it plays: the notes come at you, judged as they pass. -->
            <NoteHighway
              {lanes}
              notes={live}
              now={waitMode && phase === "running" ? waitShown : demo?.playing ? now - demo.startPerf : now - downbeat}
              {beatMs}
              lengthMs={isGroove ? groove.lengthMs : strokes[strokes.length - 1].atMs + stepMs}
              {judged}
              flash={flashNote}
              countIn={phase === "countin" ? Math.max(1, Math.ceil((downbeat - now) / beatMs)) : null}
              label="{lanes.map((l) => l.label).join(', ')}: notes coming up"
            />
            {#if waitMode}<p class="mt-2 text-xs text-ws-stage-soft">Wait mode: no click; the notes stop until their pads are hit.</p>{/if}
          {:else if mode === "check" && phase !== "results"}
            <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm text-ws-stage-soft">
              Check: from memory, no grid.
              {#if isGroove}{groove.groove.label}, {groove.groove.bars} bar{groove.groove.bars > 1 ? "s" : ""} after the count-in.{:else}{pattern.label}, left on {padLabel(pads[0])}, right on {padLabel(pads[1])}.{/if}
            </p>
          {:else if isGroove}
            {#if phase !== "running" && phase !== "countin"}
              <div class="mb-3 rounded-xl bg-ws-stage-ink/8 p-3 text-sm" aria-label="About this groove">
                <p class="font-semibold">
                  {entry.groove.label} <span class="font-normal text-ws-stage-soft">· {entry.style}, level {entry.level} ({levelOf.tier}: perfect within {TIERS[levelOf.tier].perfect} ms, good within {TIERS[levelOf.tier].good} ms){entry.swing ? ` · swing ${entry.swing}%` : ""}</span>
                </p>
                <p class="mt-1 text-ws-stage-soft">{entry.feel}</p>
                <p class="mt-1"><span class="text-ws-stage-soft">Fingers:</span> {entry.fingers}</p>
                <p class="mt-1 text-ws-stage-soft">
                  {#if isSteady}Four bars with the click, then {STEADY_BARS - CLICK_BARS} on your own: stay within 3 BPM.{:else}Starts at {entry.bpm.start} BPM, aims for {entry.bpm.target}; each pass moves it up 5, two misses in a row back down 5. Now {bpm}.{/if}
                </p>
              </div>
            {/if}
            <GrooveGrid
              targets={groove.targets}
              bars={groove.groove.bars}
              sectionLabels={groove.groove.sectionLabels}
              playhead={sixteenthNow}
              outcomes={grv?.perTarget}
              windowMs={groove.matchWindowMs}
            />
          {:else}
            <StickingLane hits={hits} {perBeat} current={phase === "running" ? strokeNow : demo?.playing ? strokeNow : null} outcomes={rud?.perStroke} windowMs={Math.min(60, stepMs / 3)} />
            {#if hits.some((h) => h.grace)}<p class="mt-2 text-xs text-ws-stage-soft">Flam: a grace note on the other pad just before each stroke. Only the main strokes are graded.</p>{/if}
          {/if}
        </div>
        <Pads {marks} {flashes} {names} colors={padColors} label="MPC pads, bank A. Computer keys Z X C V play the bottom row." />
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary && stars !== null}
      <div class="stars mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ws-line bg-ws-surface px-4 py-3" aria-label="{stars} of 3 stars">
        <span class="stars-row" aria-hidden="true">{#each [0, 1, 2] as k (k)}<span class:lit={k < stars}>★</span>{/each}</span>
        <span class="text-sm">
          {stars === 3 ? "Three stars: passed." : stars === 2 ? "Two stars: pass the level's timing for the third." : stars === 1 ? "One star: most of it there." : "No stars yet: slow it down and try again."}
          {#if bestStreak >= 4}Best streak {bestStreak}.{/if}
          {#if (bestStars[starsId] ?? 0) > stars}<span class="text-ws-soft">Your best: {starText(bestStars[starsId])}.</span>{/if}
        </span>
      </div>
    {/if}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if extra?.pass && !isSteady && bpm < entry.bpm.target}
            <button type="button" class={btnPrimary} onclick={() => retempo(Math.min(entry.bpm.target, bpm + 5) - bpm)}>Up the ladder: {Math.min(entry.bpm.target, bpm + 5)} BPM</button>
          {/if}
          <button type="button" class={btn} onclick={() => retempo(isGroove ? 5 : 6)}>Faster</button>
          <button type="button" class={btn} onclick={() => retempo(isGroove ? -5 : -6)}>Slower</button>
        {/snippet}
      </Results>
      {#if grv}
        <div class="grid gap-4 rounded-2xl border border-ws-line bg-ws-surface p-4 sm:grid-cols-2 sm:p-5">
          <div class="min-w-0 overflow-x-auto">
            <table class="w-full text-sm">
              <caption class="mb-2 text-left font-semibold">By voice</caption>
              <thead class="text-ws-soft"><tr><th class="py-1 text-left font-normal">Voice</th><th class="font-normal">Hit</th><th class="font-normal">Missed</th><th class="font-normal">Extra</th><th class="text-right font-normal">Timing</th></tr></thead>
              <tbody class="tnum">
                {#each grv.perVoice as v (v.voice)}
                  <tr class="border-t border-ws-line">
                    <td class="py-1.5">{voiceName(v.voice)} <span class="text-ws-soft">{padLabel(v.pad)}</span></td>
                    <td class="text-center">{v.matched}</td>
                    <td class="text-center {v.missed ? 'font-semibold text-destructive' : ''}">{v.missed}</td>
                    <td class="text-center {v.extra ? 'font-semibold text-destructive' : ''}">{v.extra}</td>
                    <td class="text-right">{v.matched ? `${Math.round(v.meanAbsErrorMs)} ms` : "none"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div class="min-w-0 overflow-x-auto">
            <table class="w-full text-sm">
              <caption class="mb-2 text-left font-semibold">By section</caption>
              <thead class="text-ws-soft"><tr><th class="py-1 text-left font-normal">Section</th><th class="font-normal">Hit</th><th class="font-normal">Missed</th><th class="text-right font-normal">Verdict</th></tr></thead>
              <tbody class="tnum">
                {#each grv.perSection as sec (sec.label)}
                  <tr class="border-t border-ws-line">
                    <td class="py-1.5 capitalize">{sec.label}</td>
                    <td class="text-center">{sec.matched}</td>
                    <td class="text-center">{sec.missed}</td>
                    <td class="text-right font-medium">{sectionWord(sec.label, grv)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="mpc" /></div>
  {/snippet}
</DrillShell>

<style>
  .stars-row {
    display: inline-flex;
    gap: 0.15rem;
    font-size: 2rem;
    line-height: 1;
    color: color-mix(in oklch, var(--ws-ink) 18%, transparent);
  }
  .stars-row .lit {
    color: var(--warn);
    text-shadow: 0 0 12px color-mix(in oklch, var(--warn) 50%, transparent);
  }
</style>

