<script lang="ts">
  // Sight-reading: a generated phrase on the staff with one cursor. Wait mode
  // holds the cursor until the group is played (guided); Keep time runs the
  // follower against the click. Wrong notes flash on the staff and the keys for
  // a moment and then clear; the group verdicts land on the staff at the end.
  import { onDestroy } from "svelte";
  import type { NoteEvent, Score, ScoreGroup, Strictness } from "@repo/music-core";
  import { noteName, pc } from "@repo/music-core";
  import { barQuarters, CLIMB, READING_METERS, climbAfter, levelMeter, practiceMissedScore, READING_DEFAULTS, readingLevel, readingLevelId, readingRange, readingRungs, sightReadingScore, sightReadingSkills, startClimb, type ClimbState, type Clef } from "@repo/music-core/content/reading";
  import {
    followerInput,
    followerResult,
    liveState,
    performanceStart,
    scoreGroups,
    waitStart,
    type FollowerState,
    type LiveState,
    type PerformanceResult,
    type WaitResult,
  } from "@repo/music-core/scoring/follower";
  import { rng } from "@repo/music-core/content/random";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import type { Tuning } from "@repo/music-core/data/index";
  import { keyByName, KEY_SIGNATURES } from "@repo/music-core/theory/spelling";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import InstrumentStage from "$lib/music/components/InstrumentStage.svelte";
  import { AEROPHONE_RANGE } from "@repo/music-core/content/winds-pads";
  import { writtenOffset } from "@repo/music-core/theory/transposition";
  import Fretboard from "$lib/music/components/Fretboard.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import Staff from "$lib/music/notation/Staff.svelte";
  import Tab from "$lib/music/notation/Tab.svelte";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import { assignTab } from "$lib/music/notation/groups";
  import { swingBeat } from "$lib/music/drills/piano/transport.svelte";
  import type { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { nextRun } from "$lib/music/advance.svelte";
  import { audio, getSetting, mic, putSetting, settings } from "$lib/music/runtime";
  import { clampRange, combineLanes, fretPosition, handLabel, kickGroups, KICK_MIDI, keyboardSpan, placeInPosition, positionRange, READING_TABS, soundingScore, type ReadingSetup } from "./reading";
  import { hitDrumKey } from "@repo/music-core/content/winds-pads";
  import SetupFields from "./SetupFields.svelte";
  import { readingLessons } from "@repo/music-core/lessons/reading";

  interface Props {
    cfg: DrillSetup<ReadingSetup>;
    instrument: "piano" | "guitar" | "ukulele" | "aerophone";
    tuning: Tuning | null;
  }
  let { cfg, instrument, tuning }: Props = $props();

  const s = $derived(cfg.value);
  const fretted = $derived(instrument !== "piano" && !!tuning);
  // The Aerophone reads one treble line in its own written range, by exact pitch like the piano.
  const aero = $derived(instrument === "aerophone");
  const levelId = $derived(readingLevelId(s.level));
  const meter = $derived(levelMeter(levelId, s.meter));
  const rungs = $derived(readingRungs(instrument));
  const key = $derived(keyByName(s.key) ?? KEY_SIGNATURES[0]);
  // A single-line level tapped on the piano reads its one line too.
  const clefs = $derived<Clef[]>(
    fretted || aero || (s.follower === "tap" && !s.climb && readingLevel(readingLevelId(s.level)).reader === "line")
      ? ["treble"]
      : s.clefs.split(",").filter((c): c is Clef => c === "treble" || c === "bass"),
  );
  const [BPM_MIN, BPM_MAX] = READING_DEFAULTS.bpmLimits;
  const bpm = $derived(Math.min(BPM_MAX, Math.max(BPM_MIN, settings.value.bpm)));
  const climbing = $derived(!!s.climb);
  // Tap the rhythm: Keep time with any key, the Tap button or Space; pitch is not graded.
  const tapping = $derived(!climbing && s.follower === "tap");
  // The kick lane: a kick on every quarter under the tapped rhythm, followed on its own.
  const kick = $derived(tapping && !!s.kick);
  const isKick = (m: number) => hitDrumKey(m) === hitDrumKey(KICK_MIDI);
  const follower = $derived<"wait" | "performance">(climbing || s.follower === "performance" || tapping ? "performance" : "wait");
  const measures = $derived(climbing ? CLIMB.measures : Math.min(16, Math.max(1, s.measures)));
  const strictness = $derived<Strictness>((["relaxed", "normal", "strict"] as const).find((x) => x === s.strictness) ?? "normal");
  // Sounding minus written: guitar sounds an octave down, the Aerophone by its reading key.
  const transpose = $derived(-writtenOffset(instrument, settings.value, fretted ? tuning : null));
  const useMic = $derived(fretted && s.input === "mic");
  const entry = catalogEntry("reading")!;
  const modeDef = entry.modes.find((m) => m.id === "sight-reading")!;
  // The level's range on the clefs (or the notes asked for), inside what the instrument
  // reads: fretted instruments in the chosen hand position, the Aerophone in its written range.
  const position = $derived(fretted && tuning ? fretPosition(instrument, s.position) : undefined);
  const limits = $derived<[number, number]>(
    position && tuning ? positionRange(tuning, position.frets) : fretted ? [55, 79] : aero ? [AEROPHONE_RANGE.lowestMidi, AEROPHONE_RANGE.highestMidi] : [21, 108],
  );
  const levelRange = $derived(readingRange(levelId, clefs));
  const range = $derived(clampRange(climbing ? levelRange : [s.low || levelRange[0], s.high || levelRange[1]], limits));

  let seed = $state(Math.floor(Math.random() * 2 ** 31));
  let override = $state.raw<{ from: string; score: Score } | null>(null);
  const generated = $derived(
    sightReadingScore(rng(seed), {
      level: levelId,
      instrument,
      clefs: clefs.length ? clefs : undefined,
      key: key.name,
      measures,
      meter,
      bpm,
      range,
    }),
  );
  const score = $derived(override && override.from === generated.id ? override.score : generated);
  const groups = $derived(scoreGroups(score));
  // Jazz lines are written straight and played swung: off-beat eighths land two thirds into the beat.
  const swing = $derived(!!readingLevel(levelId).swing);
  const feel = (b: number) => (swing ? swingBeat(b) : b);
  /** What the follower grades: swung onsets, and in tap mode one pitch a group. */
  const TAP_MIDI = 60;
  const followGroups = $derived(
    groups.map((g) => ({
      ...g,
      startBeat: feel(g.startBeat),
      notes: tapping ? [{ ...g.notes[0], midi: TAP_MIDI }] : g.notes,
    })),
  );
  // Fretted: the notes placed in the hand position, so the tab and the fretboard agree with it.
  const sounding = $derived.by(() => {
    const out = soundingScore(score, transpose);
    if (!position || !tuning) return out;
    return { ...out, voices: out.voices.map((v) => ({ ...v, notes: placeInPosition(v.notes, tuning, position.frets) })) };
  });
  const beatMs = $derived(60000 / bpm);
  // The click counts quarters; a bar of 3/8 or 9/8 (not whole quarters) counts two bars' worth.
  const clockBeats = $derived(Number.isInteger(barQuarters(score.meter)) ? barQuarters(score.meter) : barQuarters(score.meter) * 2);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let fs = $state.raw<FollowerState | null>(null);
  let kfs = $state.raw<FollowerState | null>(null);
  let live = $state.raw<LiveState | null>(null);
  let startAt = $state(0);
  let now = $state(0);
  let result = $state.raw<WaitResult | PerformanceResult | null>(null);
  let summary = $state<RunSummary | null>(null);
  let showTab = $state(false);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let raf = 0;
  let stopClockRef: (() => void) | null = null;
  const flashes = new Flashes();

  // Preview: Play / Pause with the cursor and keys following the audio.
  let preview = $state.raw<{ stop(): void; playing: boolean } | null>(null);
  let previewBeat = $state<number | null>(null);
  let resumeBeat = $state(0);
  let lit = $state<number[]>([]);

  async function togglePreview() {
    if (preview?.playing) {
      preview.stop();
      preview = null;
      resumeBeat = previewBeat ?? 0;
      status = "Paused.";
      return;
    }
    await audio.unlock();
    const notes = sounding.voices
      .flatMap((v) => v.notes)
      .filter((n) => n.startBeat >= resumeBeat - 1e-6)
      .map((n) => ({ midi: n.midi, time: ((feel(n.startBeat) - resumeBeat) * beatMs) / 1000, duration: ((feel(n.startBeat + n.durationBeats) - feel(n.startBeat)) * beatMs * 0.92) / 1000, beat: n.startBeat }));
    if (!notes.length) resumeBeat = 0;
    const h = audio.playSequence(notes, {
      onNote: (i) => {
        previewBeat = notes[i].beat;
        lit = notes.filter((n) => n.beat === notes[i].beat).map((n) => n.midi);
      },
    });
    preview = h;
    status = "Preview: listen, not scored.";
    void h.done.then(() => {
      if (preview !== h) return;
      preview = null;
      previewBeat = null;
      lit = [];
      resumeBeat = 0;
    });
  }
  function stopPreview() {
    preview?.stop();
    preview = null;
    previewBeat = null;
    lit = [];
    resumeBeat = 0;
  }

  // ---------------------------------------------------------------------------

  // The level climb: where it stands, and the best rung ever reached on this instrument.
  let climb = $state<ClimbState | null>(null);
  let climbBest = $state(-1);
  let climbSeed = -1;
  const BEST_KEY = $derived(`reading.climb-best.${instrument}`);
  $effect(() => void getSetting<number>(BEST_KEY, -1).then((b) => (climbBest = b)));
  const rungOf = (level: string, keyName: string) =>
    Math.max(0, rungs.findIndex((r) => r.level === level && r.key === keyName), rungs.findIndex((r) => r.level === level));
  function goToRung(i: number) {
    const r = rungs[i];
    cfg.set({ level: r.level, key: r.key, clefs: fretted || aero ? "treble" : r.clefs.join(",") });
  }
  function nextPhrase() {
    if (climb && !climb.over) goToRung(climb.rung);
    newPhrase();
  }
  function climbAgain() {
    climb = null;
    newPhrase();
  }

  async function start(ctx: RunContext) {
    stopPreview();
    if (climbing && (!climb || climb.over)) climb = startClimb(rungOf(levelId, key.name), rungs.length);
    // Every climb phrase is read fresh at the climb's rung, whichever button started it.
    else if (climbing && climb && (seed === climbSeed || rungOf(levelId, key.name) !== climb.rung)) {
      goToRung(climb.rung);
      override = null;
      seed = (seed * 7 + 13) % 2 ** 31;
    }
    climbSeed = climbing ? seed : -1;
    summary = null;
    result = null;
    flashes.clear();
    if (useMic && !(await mic.start())) {
      ctx.stopClock();
      phase = "ready";
      status = mic.error || "The microphone could not start.";
      return;
    }
    const octaveExact = instrument === "piano" || aero;
    startAt = ctx.downbeat;
    fs = follower === "wait" ? waitStart(followGroups, octaveExact) : performanceStart(followGroups, { bpm, startAt, strictness, octaveExact });
    kfs = kick ? performanceStart(kickGroups(score.lengthBeats), { bpm, startAt, strictness, octaveExact: true }) : null;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: modeDef.exerciseId,
      setupKey: `sight|${instrument}|${levelId}|${clefs.join(",")}|${key.name}|${measures}|${meter}|${tapping ? "tap" : follower}|${follower === "performance" ? `${bpm}|${strictness}` : "-"}|${range.join("-")}|${s.mask}${kick ? "|kick" : ""}`,
      skillIds: sightReadingSkills(score),
      capabilities: ["reading"],
      modality: "read",
      // Waiting for the right note is guided by definition (scoring rules 1).
      assistance: follower === "wait" ? "guided" : assistanceFor(mode),
      difficulty: readingLevel(levelId).recommendedDifficulty,
      instrument,
      params: {
        instrument,
        level: levelId,
        key: key.name,
        follower: tapping ? "tap" : follower,
        bpm,
        measures,
        meter,
        climb: climbing,
        low: range[0],
        high: range[1],
        mask: s.mask,
        look: s.look,
        ...(kick ? { kick } : {}),
        ...(position ? { position: position.value } : {}),
      },
    });
    // Scored input starts at the downbeat (after any count-in).
    cap = capture(follower === "performance" ? ctx.downbeat - beatMs / 2 : performance.now(), (e) => e.kind === "noteon" && onNote(e));
    status = follower === "wait" ? "Play what the cursor shows. It waits for you." : tapping ? `Tap the rhythm: any key, the Tap button or Space.${kick ? " Kick every beat: a kick pad or the Kick button." : ""}` : "Go.";
    loop();
  }

  const keyOf = (m: number) => (instrument === "piano" || aero ? m : pc(m));

  // The Tap button and Space, in tap mode: input from the count-in on, as the rhythm drill takes it.
  let pressed = $state(false);
  function tap(at: number) {
    if (!tapping || !fs || (phase !== "running" && phase !== "countin")) return;
    audio.drum(37, 0.5);
    pressed = true;
    setTimeout(() => (pressed = false), 90);
    fs = followerInput(fs, { kind: "noteon", midi: TAP_MIDI, velocity: 0.8, at, source: "onscreen", confidence: 1 });
  }
  function kickTap(at: number) {
    if (!kfs || (phase !== "running" && phase !== "countin")) return;
    audio.drum(KICK_MIDI, 0.7);
    kfs = followerInput(kfs, { kind: "noteon", midi: KICK_MIDI, velocity: 0.8, at, source: "onscreen", confidence: 1 });
  }
  function onKey(e: KeyboardEvent) {
    if (!tapping || e.code !== "Space" || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, select, textarea, [contenteditable]")) return;
    e.preventDefault();
    tap(e.timeStamp || performance.now());
  }

  function onNote(e: NoteEvent) {
    if (!fs || phase !== "running") return;
    if (tapping) {
      if (e.source === "audio") return;
      if (kfs && isKick(e.midi)) kfs = followerInput(kfs, { ...e, midi: KICK_MIDI });
      else fs = followerInput(fs, { ...e, midi: TAP_MIDI });
      return;
    }
    if (useMic ? e.source !== "audio" : e.source === "audio") return;
    const written = { ...e, midi: e.midi - transpose };
    const before = liveState(fs, performance.now());
    const expected = before.expected.map(keyOf);
    const hit = expected.includes(keyOf(written.midi));
    if (e.string && e.fret !== undefined) flashes.add(e.string * 100 + e.fret, hit ? "correct" : "wrong", 200);
    else flashes.add(e.midi, hit ? "correct" : "wrong", 200);
    fs = followerInput(fs, written);
  }

  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!fs || (phase !== "running" && phase !== "countin")) return;
      now = performance.now();
      live = liveState(fs, now);
      if (fs.mode === "wait" ? live.done : now > startAt + score.lengthBeats * beatMs + 500) {
        void finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function teardown() {
    cancelAnimationFrame(raf);
    cap?.stop();
    cap = null;
    stopClockRef?.();
    stopClockRef = null;
    if (mic.state === "on") mic.stop();
  }

  function missedGroups(r: WaitResult | PerformanceResult, st: FollowerState): ScoreGroup[] {
    if (st.mode === "wait") return groups.filter((_, i) => st.wrongCounts[i] > 0 || i >= st.index);
    return groups.filter((_, i) => (r as PerformanceResult).groupVerdicts[i] !== "hit");
  }
  let missed = $state.raw<ScoreGroup[]>([]);

  async function finish() {
    if (!fs) return;
    const st = fs;
    const notes = cap?.notes ?? [];
    teardown();
    const r = followerResult(st);
    // With the kick lane, its quarters count beside the taps.
    const kr = kfs ? (followerResult(kfs) as PerformanceResult) : null;
    kfs = null;
    const lanes = combineLanes({ score: r.score, correct: r.correct, n: groups.length }, kr && { score: kr.score, correct: kr.correct, n: kr.expected });
    result = r;
    missed = missedGroups(r, st);
    live = liveState(st, performance.now() + 1e6);
    phase = "results";
    await run!.attempt({
      promptId: score.id,
      correct: lanes.correct,
      partialCredit: lanes.score,
      metrics: r.metrics,
      source: runSource(st.mode === "performance" ? st.notes : notes),
      target: groups.flatMap((g) => g.notes.map((n) => n.midi)),
      instrument: runInstrument(st.mode === "performance" ? st.notes : notes, instrument) ?? null,
    });
    const fin = await run!.finish({ score: lanes.score, correct: lanes.correct, headline: pct(lanes.score) });
    const perf = "groupVerdicts" in r ? r : null;
    const wait = "cleanGroups" in r ? r : null;
    summary = {
      headline: perf
        ? perf.correct
          ? `Read and played in time: ${perf.matched} of ${perf.expected} notes.`
          : `${perf.matched} of ${perf.expected} notes, ${perf.onTime} on time${perf.extra ? `, ${perf.extra} extra` : ""}.`
        : wait!.cleanGroups === wait!.total
          ? `Every group clean, ${wait!.total} of ${wait!.total}.`
          : `${wait!.cleanGroups} of ${wait!.total} groups clean, ${wait!.wrongNotes} wrong note${wait!.wrongNotes === 1 ? "" : "s"} on the way.`,
      metric: pct(lanes.score),
      metricLabel: perf ? "score" : "groups clean",
      delta: fin.delta,
      best: fin.best,
      clean: lanes.correct && follower === "performance" && mode === "check",
      xp: fin.xp,
      assistance:
        follower === "wait"
          ? "Wait mode is guided: the cursor waited for you. Keep time in Check counts toward mastery."
          : mode === "check"
            ? "Checked run: no targets on the keys, so it counts toward mastery."
            : "Practice run: targets were lit. Switch to Check to count it.",
      rows: perf
        ? [
            { label: "Notes matched", value: perf.pitchCompletion, text: `${perf.matched} of ${perf.expected}` },
            { label: "On time", value: perf.matched ? perf.onTime / perf.matched : 0, text: `${perf.onTime} on time, ${perf.early} early, ${perf.late} late` },
            { label: "Extra notes", text: String(perf.extra) },
            { label: "Mean timing error", text: `${Math.round(perf.meanAbsErrorMs)} ms` },
            ...(kr ? [{ label: "Kick on every beat", value: kr.score, text: `${kr.matched} of ${kr.expected}, ${kr.onTime} on time` }] : []),
          ]
        : [
            { label: "Groups clean", value: wait!.total ? wait!.cleanGroups / wait!.total : 0, text: `${wait!.cleanGroups} of ${wait!.total}` },
            { label: "Wrong notes", text: String(wait!.wrongNotes) },
            { label: "Timing", notMeasured: true },
          ],
    };
    // The climb is its own advance; otherwise the next run by the shared rule, when something was played.
    if (!climbing && (st.mode === "performance" ? st.notes : notes).length) summary.advance = await advanceAfter(lanes.score, lanes.correct);
    if (climbing && climb) {
      const was = climb;
      climb = climbAfter(was, r.score, rungs.length);
      const here = rungs[was.rung].label;
      const passed = r.score >= CLIMB.pass;
      if (climb.best > climbBest) {
        climbBest = climb.best;
        void putSetting(BEST_KEY, climbBest);
      }
      summary.headline = climb.over
        ? climb.best < 0
          ? `Three strikes on ${here}. Start the climb a level lower, or slow the tempo.`
          : passed
            ? `The top rung, ${here}, passed. Nothing higher to climb.`
            : `Three strikes. Your level: ${rungs[climb.best].label}, rung ${climb.best + 1} of ${rungs.length}.`
        : passed
          ? `${pct(r.score)} on ${here}: up a rung to ${rungs[climb.rung].label}.`
          : `${pct(r.score)} on ${here}: strike ${climb.strikes} of ${CLIMB.strikes}. A new phrase at the same rung.`;
      summary.rows = [
        ...(summary.rows ?? []),
        { label: "Climb", text: `rung ${climb.rung + 1} of ${rungs.length}, ${climb.strikes} of ${CLIMB.strikes} strikes, ${climb.phrases} phrase${climb.phrases === 1 ? "" : "s"}` },
        ...(climbBest >= 0 && rungs[climbBest] ? [{ label: "Best rung on this instrument", text: `${climbBest + 1}, ${rungs[climbBest].label}` }] : []),
      ];
    }
    status = summary.headline;
  }

  /** Up the level rungs; keeping time also climbs the tempo. Each next run reads a fresh phrase. */
  function advanceAfter(score: number, correct: boolean) {
    const timed = follower === "performance";
    return nextRun(
      `reading.sight.${instrument}.${tapping ? "tap" : follower}.${measures}.${meter}`,
      { ...(timed ? { bpm, tempo: { min: BPM_MIN, goal: 100, max: BPM_MAX } } : {}), steps: rungs, step: rungOf(levelId, key.name) },
      { score, correct },
      ({ bpm: b, step }) => {
        if (b !== undefined) void settings.update({ bpm: b });
        if (step !== undefined) goToRung(step);
        override = null;
        seed = (seed * 7 + 13) % 2 ** 31;
      },
    );
  }

  function stop() {
    teardown();
    fs = null;
    kfs = null;
    live = null;
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function retempo(d: number) {
    const next = Math.min(BPM_MAX, Math.max(BPM_MIN, bpm + d));
    settings.update({ bpm: next });
    phase = "ready";
    summary = null;
    status = `Tempo ${next} BPM. Press Start.`;
  }
  function practiceMissed() {
    if (!missed.length) return;
    override = { from: generated.id, score: practiceMissedScore(score, missed) };
    phase = "ready";
    summary = null;
    status = `Loaded the ${missed.length} group${missed.length === 1 ? "" : "s"} you missed. Press Start.`;
  }
  function newPhrase() {
    override = null;
    seed = (seed * 7 + 13) % 2 ** 31;
    phase = "ready";
    summary = null;
    status = "A new phrase.";
  }

  onDestroy(() => {
    teardown();
    stopPreview();
  });

  // ---------------------------------------------------------------------------
  // What the surfaces draw

  const current = $derived(phase === "running" && live ? groups[live.index] : undefined);
  const cursorBeat = $derived(
    previewBeat ?? (phase !== "running" || !live ? null : fs?.mode === "performance" ? Math.max(0, (now - startAt) / beatMs) : (current?.startBeat ?? null)),
  );
  const groupStates = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (!live) return out;
    live.verdicts.forEach((v, i) => {
      const done = phase === "results";
      if (v === "current") out[i] = "active";
      else if (v === "clean" || v === "hit") out[i] = "correct";
      // Errors are verdicts, shown once the run is over; during it only the flash shows.
      else if (done && (v === "with-errors" || v === "partial")) out[i] = "wrong";
      else if (done && v === "missed") out[i] = "missed";
    });
    if (phase === "running" && live.wrong.length && live.index < groups.length) out[live.index] = "wrong";
    return out;
  });
  // The look-ahead mask: played notes hide, and only the next `mask` beats show.
  // Beams, ties and triplet marks hide with the notes they join (the frame's linked elements).
  const shownStates = $derived.by(() => {
    if (!s.mask || phase === "results") return groupStates;
    const from = phase !== "running" || !live ? 0 : fs?.mode === "performance" ? (cursorBeat ?? 0) : (current?.startBeat ?? 0);
    const out: Record<number, GroupState> = { ...groupStates };
    groups.forEach((g, i) => {
      if (out[i] !== "active" && (g.startBeat + g.durationBeats <= from + 1e-6 || g.startBeat >= from + s.mask - 1e-6)) out[i] = "hidden";
    });
    return out;
  });

  // Look first: Start opens after the set seconds on each new phrase.
  let lookLeft = $state(0);
  let lookedAt = "";
  $effect(() => {
    if (phase !== "ready" || !s.look || lookedAt === score.id) return;
    lookedAt = score.id;
    lookLeft = s.look;
    const t = setInterval(() => {
      lookLeft = Math.max(0, lookLeft - 1);
      if (!lookLeft) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  });
  const lookBlock = $derived(phase === "ready" && s.look && lookLeft > 0 ? `Look first, ${lookLeft} s: find the key, the meter and the hardest bar, and hum bar 1.` : null);

  const both = $derived(instrument === "piano" && score.voices.length > 1);
  const pianoMarks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    for (const m of lit) out[m] = { demo: true };
    if (phase === "running" && mode === "practice" && current)
      for (const n of current.notes)
        out[n.midi + transpose] = { target: true, label: both ? (n.voiceId === "lh" ? "L" : "R") : undefined, role: both ? (n.voiceId === "lh" ? "left" : "right") : undefined };
    return out;
  });
  const allSounding = $derived(sounding.voices.flatMap((v) => v.notes.map((n) => n.midi)));
  const span = $derived(keyboardSpan(allSounding));
  const low = $derived(span[0]);
  const high = $derived(span[1]);
  const tabTuning = $derived(tuning ? { openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name } : null);
  const positions = $derived(tabTuning ? assignTab(sounding.voices.flatMap((v) => v.notes), tabTuning, Math.max(12, position?.frets[1] ?? 0)) : []);
  const fretFrom = $derived(Math.max(0, Math.min(...positions.map((p) => p?.fret ?? 0)) - 1));
  const fretTo = $derived(Math.max(fretFrom + 4, Math.max(...positions.map((p) => p?.fret ?? 0)) + 1));
  const fretMarks = $derived.by(() => {
    if (!tabTuning || phase !== "running" || mode !== "practice" || !current) return [];
    const notes = current.notes.map((n) => ({ ...n, midi: n.midi + transpose }));
    const at = assignTab(position && tuning ? placeInPosition(notes, tuning, position.frets) : notes, tabTuning, 12);
    return at.flatMap((p) => (p ? [{ string: p.string, fret: p.fret }] : []));
  });
  // A short phrase engraves at its natural size (about 190 px a bar); zoom it to fill the stage.
  let paperW = $state(0);
  const zoom = $derived(paperW ? Math.min(1.8, Math.max(1, paperW / (Math.min(4, measures) * 200 + 110))) : 1);
  // Which hand is up, only when the phrase has two.
  const hand = $derived(both ? handLabel(current ?? groups[0]) : null);

  const summaryLine = $derived<SetupClause[]>([
    { text: `${climbing ? "Level climb from " : ""}${readingLevel(levelId).label}`, focus: climbing ? "session" : "level" },
    { text: key.name, focus: "key" },
    { text: `${clefs.join(" and ")} clef`, focus: fretted || aero || climbing ? undefined : "clefs" },
    { text: `${measures} bar${measures > 1 ? "s" : ""} of ${READING_METERS[meter].label}`, focus: climbing ? "meter" : "measures" },
    ...(s.mask ? [{ text: `${s.mask} beats ahead`, focus: "mask" }] : []),
    ...(position ? [{ text: `${position.label.toLowerCase()} position`, focus: "position" }] : []),
    follower === "wait" ? { text: "waits for you", focus: "follower" } : { text: `${tapping ? "taps" : "keeps time"} at ${bpm} BPM${swing ? ", swung" : ""}, ${strictness} window`, focus: "strictness" },
    { text: tapping ? `tapping the rhythm${kick ? ", kick on every beat" : ""}` : `${instrument}${useMic ? " by microphone" : ""}`, focus: fretted && !tapping ? "input" : undefined },
  ]);
  // Wait mode is guided whichever way the shell's switch is set.
  const modeNotes = $derived(
    follower === "wait"
      ? { practice: "Targets shown. Wait mode is guided: practice, not a test.", check: "Targets hidden. Wait mode is still guided and does not count; Keep time counts." }
      : { practice: "Targets shown. Practice, not a test.", check: "Targets hidden. Counts toward mastery." },
  );
</script>

<svelte:window onkeydown={onKey} />

<DrillShell
  lesson={{ lessons: readingLessons("sight-reading", clefs.length > 1 ? "both" : (clefs[0] ?? "treble"), { fifths: key.fifths, level: levelId, meter }) }}
  title="Sight-reading"
  hue="reading"
  blurb="Read a short generated phrase and play it. Wait for me holds the cursor; Keep time follows the click."
  summary={summaryLine}
  tabs={READING_TABS}
  tab="sight-reading"
  ontab={(id) => cfg.set({ activity: id })}
  {modeNotes}
  bind:phase
  bind:mode
  bind:status
  progress={live ? live.index / Math.max(1, groups.length) : 0}
  clock={follower === "performance" ? { bpm, beatsPerBar: clockBeats } : null}
  blocked={lookBlock}
  ondemo={togglePreview}
  demoPlaying={!!preview?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <SetupFields {cfg} activity="sight-reading" {fretted} oneLine={fretted || aero} {instrument} limits={fretted && tuning ? positionRange(tuning, [0, 12]) : limits} />
  {/snippet}

  {#snippet hud()}
    {#if climbing && climb && !climb.over}
      <Stat label="Rung" value={`${climb.rung + 1} of ${rungs.length}`} />
      <Stat label="Strikes" value={`${climb.strikes} of ${CLIMB.strikes}`} />
    {/if}
    {#if phase === "running" && live}
      <Stat label="Group" value="{Math.min(live.index + 1, groups.length)} of {groups.length}" />
      {#if hand}<Stat label="Now" value={hand} />{/if}
      {#if mode === "practice" && current}<Stat label="Next" value={current.notes.map((n) => noteName(n.midi)).join(" + ")} />{/if}
    {:else if hand && phase === "ready"}
      <Stat label="First" value={hand} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div
      bind:clientWidth={paperW}
      data-expected={current?.notes.map((n) => n.midi + transpose).join(",") ?? ""}
      data-group={live?.index ?? -1}
      data-downbeat={fs?.mode === "performance" && (phase === "running" || phase === "countin") ? Math.round(startAt) : undefined}
      data-beat-ms={Math.round(beatMs)}
      data-onsets={followGroups.map((g) => Math.round(g.startBeat * 1000) / 1000).join(",")}
      class="paper-wrap"
    >
      <div style:zoom={zoom}>
        {#key score.id}
          <Staff {score} {cursorBeat} groupStates={shownStates} maxHeight={measures > 4 ? "32rem" : "22rem"} />
        {/key}
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      {#if fretted && tabTuning}
        <button type="button" class={btnStage} aria-pressed={showTab} aria-controls="sight-tab" onclick={() => (showTab = !showTab)}>{showTab ? "Hide tab" : "Show tab"}</button>
        {#if !showTab}<span class="text-sm text-ws-stage-soft">Tab stays hidden so the staff does the work.</span>{/if}
      {/if}
      {#if phase === "ready"}
        <button type="button" class={btnStage} onclick={newPhrase}>New phrase</button>
      {/if}
    </div>
    {#if fretted && tabTuning && showTab}
      <div id="sight-tab" class="mt-3" style:zoom={zoom}>
        <Tab score={sounding} tuning={tabTuning} {cursorBeat} groupStates={shownStates} maxHeight={measures > 4 ? "24rem" : "14rem"} />
      </div>
    {/if}
    <div class="mt-4">
      {#if tapping}
        <div class="flex flex-wrap items-start justify-center gap-6">
        {#if kick}
          <div class="flex flex-col items-center gap-2">
            <button
              type="button"
              class="tap kick"
              aria-label="Kick"
              disabled={phase !== "running" && phase !== "countin"}
              onpointerdown={(e) => {
                if (e.button > 0) return;
                e.preventDefault();
                kickTap(e.timeStamp || performance.now());
              }}
              onkeydown={(e) => {
                if (e.key === "Enter" && !e.repeat) {
                  e.preventDefault();
                  kickTap(e.timeStamp || performance.now());
                }
              }}
            >
              <span class="font-display text-2xl font-bold">Kick</span>
              <span class="text-xs opacity-80">every beat</span>
            </button>
            <p class="text-center text-xs text-ws-stage-soft">A kick pad (MIDI 36) counts too.</p>
          </div>
        {/if}
        <div class="flex flex-col items-center gap-2">
          <button
            type="button"
            class="tap"
            class:pressed
            aria-label="Tap"
            aria-keyshortcuts="Space"
            disabled={phase !== "running" && phase !== "countin"}
            onpointerdown={(e) => {
              if (e.button > 0) return;
              e.preventDefault();
              tap(e.timeStamp || performance.now());
            }}
            onkeydown={(e) => {
              if (e.key === "Enter" && !e.repeat) {
                e.preventDefault();
                tap(e.timeStamp || performance.now());
              }
            }}
          >
            <span class="font-display text-2xl font-bold">Tap</span>
            <span class="text-xs opacity-80">or Space</span>
          </button>
          <p class="text-center text-xs text-ws-stage-soft">Any MIDI key or pad counts too. Only the rhythm is graded.</p>
        </div>
        </div>
      {:else if useMic}
        <div class="rounded-2xl bg-ws-stage-ink/8 p-4">
          <p class="text-sm text-ws-stage-soft">The microphone listens while the run is on. Notes are graded by pitch class.</p>
          <p class="mt-1 font-display text-2xl font-semibold tnum">{mic.pitch ? noteName(mic.pitch.midi) : "No pitch yet"}</p>
        </div>
      {:else if fretted && tuning}
        <Fretboard openStrings={tuning.openStrings} from={fretFrom} to={fretTo} marks={fretMarks} {flashes} label="{instrument} fretboard" />
      {:else if aero}
        <InstrumentStage instrument="aerophone" line={allSounding} marks={pianoMarks} {flashes} />
      {:else}
        <Piano {low} {high} marks={pianoMarks} {flashes} names={mode === "check" ? "none" : "c"} label="Piano keyboard, {noteName(low)} to {noteName(high)}" />
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if climbing && climb}
            {#if climb.over}<button type="button" class={btn} onclick={climbAgain}>Climb again</button>{:else}<button type="button" class={btn} onclick={nextPhrase}>Next phrase</button>{/if}
          {/if}
          <button type="button" class={btn} onclick={() => retempo(10)}>Faster</button>
          <button type="button" class={btn} onclick={() => retempo(-10)}>Slower</button>
          {#if missed.length && !climbing}<button type="button" class={btn} onclick={practiceMissed}>Practice the notes you missed ({missed.length})</button>{/if}
          <button type="button" class={btn} onclick={newPhrase}>New phrase</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>

<style>
  .tap {
    display: grid;
    place-content: center;
    width: 8rem;
    height: 8rem;
    border-radius: 999px;
    background: radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--instr), white 25%), var(--instr) 60%, color-mix(in oklch, var(--instr), black 25%));
    color: var(--ws-stage);
    box-shadow: 0 8px 0 color-mix(in oklch, var(--instr), black 45%), 0 12px 26px rgb(0 0 0 / 0.3);
    transition: transform 60ms ease-out, box-shadow 60ms ease-out;
    touch-action: manipulation;
    user-select: none;
  }
  .tap.kick {
    width: 6.5rem;
    height: 6.5rem;
  }
  .tap:disabled {
    opacity: 0.55;
  }
  .tap.pressed,
  .tap:not(:disabled):active {
    transform: translateY(6px);
    box-shadow: 0 2px 0 color-mix(in oklch, var(--instr), black 45%), 0 4px 12px rgb(0 0 0 / 0.3);
  }
  .tap:focus-visible {
    outline: 3px solid var(--ws-stage-ink);
    outline-offset: 4px;
  }
</style>
