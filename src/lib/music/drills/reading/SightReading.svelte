<script lang="ts">
  // Sight-reading: a generated phrase on the staff with one cursor. Wait mode
  // holds the cursor until the group is played (guided); Keep time runs the
  // follower against the click. Wrong notes flash on the staff and the keys for
  // a moment and then clear; the group verdicts land on the staff at the end.
  import { onDestroy } from "svelte";
  import type { NoteEvent, Score, ScoreGroup, Strictness } from "@repo/music-core";
  import { noteName, pc } from "@repo/music-core";
  import { barQuarters, CLIMB, climbAfter, practiceMissedScore, READING_RUNGS, readingLevel, sightReadingScore, sightReadingSkills, startClimb, type ClimbState, type Clef } from "@repo/music-core/content/reading";
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
  import type { ReadingLevelId, Tuning } from "@repo/music-core/data/index";
  import { keyByName, KEY_SIGNATURES } from "@repo/music-core/theory/spelling";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Fretboard from "$lib/music/components/Fretboard.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import Staff from "$lib/music/notation/Staff.svelte";
  import Tab from "$lib/music/notation/Tab.svelte";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import { assignTab } from "$lib/music/notation/groups";
  import type { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { nextRun } from "$lib/music/advance.svelte";
  import { audio, getSetting, mic, putSetting, settings } from "$lib/music/runtime";
  import { handLabel, soundingScore, type ReadingSetup } from "./reading";
  import SetupFields from "./SetupFields.svelte";

  interface Props {
    cfg: DrillSetup<ReadingSetup>;
    instrument: "piano" | "guitar" | "ukulele";
    tuning: Tuning | null;
  }
  let { cfg, instrument, tuning }: Props = $props();

  const s = $derived(cfg.value);
  const fretted = $derived(instrument !== "piano" && !!tuning);
  const levelId = $derived((["primer", "level-1", "level-2", "level-3"].includes(s.level) ? s.level : "primer") as ReadingLevelId);
  const key = $derived(keyByName(s.key) ?? KEY_SIGNATURES[0]);
  const clefs = $derived<Clef[]>(fretted ? ["treble"] : s.clefs.split(",").filter((c): c is Clef => c === "treble" || c === "bass"));
  const bpm = $derived(Math.min(200, Math.max(40, settings.value.bpm)));
  const climbing = $derived(!!s.climb);
  const follower = $derived<"wait" | "performance">(climbing || s.follower === "performance" ? "performance" : "wait");
  const measures = $derived(climbing ? CLIMB.measures : s.measures);
  const strictness = $derived<Strictness>((["relaxed", "normal", "strict"] as const).find((x) => x === s.strictness) ?? "normal");
  const transpose = $derived(fretted ? tuning!.notationTransposition : 0);
  const useMic = $derived(fretted && s.input === "mic");
  const entry = catalogEntry("reading")!;
  const modeDef = entry.modes.find((m) => m.id === "sight-reading")!;

  let seed = $state(Math.floor(Math.random() * 2 ** 31));
  let override = $state.raw<{ from: string; score: Score } | null>(null);
  const generated = $derived(
    sightReadingScore(rng(seed), {
      level: levelId,
      instrument,
      clefs: clefs.length ? clefs : undefined,
      key: key.name,
      measures,
      meter: s.meter === "compound" ? "compound" : "simple",
      bpm,
      // Fretted instruments read in their own written range.
      range: fretted ? [Math.max(readingLevel(levelId).recommendedRange.lowestMidi, 55), Math.min(readingLevel(levelId).recommendedRange.highestMidi, 79)] : undefined,
    }),
  );
  const score = $derived(override && override.from === generated.id ? override.score : generated);
  const groups = $derived(scoreGroups(score));
  const sounding = $derived(soundingScore(score, transpose));
  const beatMs = $derived(60000 / bpm);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let fs = $state.raw<FollowerState | null>(null);
  let live = $state.raw<LiveState | null>(null);
  let startAt = 0;
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
      .map((n) => ({ midi: n.midi, time: ((n.startBeat - resumeBeat) * beatMs) / 1000, duration: (n.durationBeats * beatMs * 0.92) / 1000, beat: n.startBeat }));
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
  const rungOf = (level: string, keyName: string) => Math.max(0, READING_RUNGS.findIndex((r) => r.level === level && r.key === keyName));
  function goToRung(i: number) {
    const r = READING_RUNGS[i];
    cfg.set({ level: r.level, key: r.key, clefs: fretted ? "treble" : r.clefs.join(",") });
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
    if (climbing && (!climb || climb.over)) climb = startClimb(rungOf(levelId, key.name));
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
    const octaveExact = instrument === "piano";
    startAt = ctx.downbeat;
    fs = follower === "wait" ? waitStart(groups, octaveExact) : performanceStart(groups, { bpm, startAt, strictness, octaveExact });
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: modeDef.exerciseId,
      setupKey: `sight|${instrument}|${levelId}|${clefs.join(",")}|${key.name}|${measures}|${s.meter}|${follower}|${follower === "performance" ? `${bpm}|${strictness}` : "-"}`,
      skillIds: sightReadingSkills(score),
      capabilities: ["reading"],
      modality: "read",
      // Waiting for the right note is guided by definition (scoring rules 1).
      assistance: follower === "wait" ? "guided" : assistanceFor(mode),
      difficulty: readingLevel(levelId).recommendedDifficulty,
      instrument,
      params: { instrument, level: levelId, key: key.name, follower, bpm, measures, meter: s.meter, climb: climbing },
    });
    // Scored input starts at the downbeat (after any count-in).
    cap = capture(follower === "performance" ? ctx.downbeat - beatMs / 2 : performance.now(), (e) => e.kind === "noteon" && onNote(e));
    status = follower === "wait" ? "Play what the cursor shows. It waits for you." : "Go.";
    loop();
  }

  const keyOf = (m: number) => (instrument === "piano" ? m : pc(m));

  function onNote(e: NoteEvent) {
    if (!fs || phase !== "running") return;
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
    result = r;
    missed = missedGroups(r, st);
    live = liveState(st, performance.now() + 1e6);
    phase = "results";
    await run!.attempt({
      promptId: score.id,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(st.mode === "performance" ? st.notes : notes),
      target: groups.flatMap((g) => g.notes.map((n) => n.midi)),
      instrument: runInstrument(st.mode === "performance" ? st.notes : notes, instrument) ?? null,
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: pct(r.score) });
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
      metric: pct(r.score),
      metricLabel: perf ? "score" : "groups clean",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && follower === "performance" && mode === "check",
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
          ]
        : [
            { label: "Groups clean", value: wait!.total ? wait!.cleanGroups / wait!.total : 0, text: `${wait!.cleanGroups} of ${wait!.total}` },
            { label: "Wrong notes", text: String(wait!.wrongNotes) },
            { label: "Timing", notMeasured: true },
          ],
    };
    // The climb is its own advance; otherwise the next run by the shared rule, when something was played.
    if (!climbing && (st.mode === "performance" ? st.notes : notes).length) summary.advance = await advanceAfter(r.score, r.correct);
    if (climbing && climb) {
      const was = climb;
      climb = climbAfter(was, r.score);
      const here = READING_RUNGS[was.rung].label;
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
            : `Three strikes. Your level: ${READING_RUNGS[climb.best].label}, rung ${climb.best + 1} of ${READING_RUNGS.length}.`
        : passed
          ? `${pct(r.score)} on ${here}: up a rung to ${READING_RUNGS[climb.rung].label}.`
          : `${pct(r.score)} on ${here}: strike ${climb.strikes} of ${CLIMB.strikes}. A new phrase at the same rung.`;
      summary.rows = [
        ...(summary.rows ?? []),
        { label: "Climb", text: `rung ${climb.rung + 1} of ${READING_RUNGS.length}, ${climb.strikes} of ${CLIMB.strikes} strikes, ${climb.phrases} phrase${climb.phrases === 1 ? "" : "s"}` },
        ...(climbBest >= 0 ? [{ label: "Best rung on this instrument", text: `${climbBest + 1}, ${READING_RUNGS[climbBest].label}` }] : []),
      ];
    }
    status = summary.headline;
  }

  /** Up the level rungs; keeping time also climbs the tempo. Each next run reads a fresh phrase. */
  function advanceAfter(score: number, correct: boolean) {
    const timed = follower === "performance";
    return nextRun(
      `reading.sight.${instrument}.${follower}.${measures}.${s.meter}`,
      { ...(timed ? { bpm, tempo: { min: 40, goal: 100, max: 200 } } : {}), steps: READING_RUNGS, step: rungOf(levelId, key.name) },
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
    live = null;
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function retempo(d: number) {
    settings.update({ bpm: Math.min(200, Math.max(40, bpm + d)) });
    phase = "ready";
    summary = null;
    status = `Tempo ${Math.min(200, Math.max(40, bpm + d))} BPM. Press Start.`;
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
  const low = $derived(Math.floor((Math.min(...allSounding) - 2) / 12) * 12);
  const high = $derived(Math.max(low + 24, Math.ceil((Math.max(...allSounding) + 2) / 12) * 12));
  const tabTuning = $derived(tuning ? { openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name } : null);
  const positions = $derived(tabTuning ? assignTab(sounding.voices.flatMap((v) => v.notes), tabTuning, 12) : []);
  const fretFrom = $derived(Math.max(0, Math.min(...positions.map((p) => p?.fret ?? 0)) - 1));
  const fretTo = $derived(Math.max(fretFrom + 4, Math.max(...positions.map((p) => p?.fret ?? 0)) + 1));
  const fretMarks = $derived.by(() => {
    if (!tabTuning || phase !== "running" || mode !== "practice" || !current) return [];
    const at = assignTab(current.notes.map((n) => ({ ...n, midi: n.midi + transpose })), tabTuning, 12);
    return at.flatMap((p) => (p ? [{ string: p.string, fret: p.fret }] : []));
  });
  // A short phrase engraves at its natural size (about 190 px a bar); zoom it to fill the stage.
  let paperW = $state(0);
  const zoom = $derived(paperW ? Math.min(1.8, Math.max(1, paperW / (Math.min(4, s.measures) * 200 + 110))) : 1);
  const hand = $derived(instrument === "piano" ? handLabel(current ?? groups[0]) : null);

  const summaryLine = $derived(
    `${climbing ? "Level climb from " : ""}${readingLevel(levelId).label}, ${key.name}, ${clefs.join(" and ")} clef, ${measures} bar${measures > 1 ? "s" : ""} of ${s.meter === "compound" ? "6/8" : "4/4"}, ${follower === "wait" ? "waits for you" : `keeps time at ${bpm} BPM`}, ${instrument}${useMic ? " by microphone" : ""}`,
  );
</script>

<DrillShell
  title="Sight-reading"
  hue="reading"
  blurb="Read a short generated phrase and play it. Wait for me holds the cursor; Keep time follows the click."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={live ? live.index / Math.max(1, groups.length) : 0}
  clock={follower === "performance" ? { bpm, beatsPerBar: barQuarters(score.meter) } : null}
  ondemo={togglePreview}
  demoPlaying={!!preview?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <SetupFields {cfg} activity="sight-reading" {fretted} />
  {/snippet}

  {#snippet hud()}
    {#if climbing && climb && !climb.over}
      <Stat label="Rung" value={`${climb.rung + 1} of ${READING_RUNGS.length}`} />
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
    <div bind:clientWidth={paperW} data-expected={current?.notes.map((n) => n.midi + transpose).join(",") ?? ""} data-group={live?.index ?? -1} class="paper-wrap">
      <div style:zoom={zoom}>
        {#key score.id}
          <Staff {score} {cursorBeat} {groupStates} maxHeight="22rem" />
        {/key}
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      {#if phase !== "running" && mode === "practice"}
        <button type="button" class={btnStage} aria-pressed={!!preview?.playing} onclick={togglePreview}>{preview?.playing ? "Pause" : resumeBeat > 0 ? "Resume preview" : "Play preview"}</button>
      {/if}
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
        <Tab score={sounding} tuning={tabTuning} {cursorBeat} {groupStates} maxHeight="14rem" />
      </div>
    {/if}
    <div class="mt-4">
      {#if useMic}
        <div class="rounded-2xl bg-ws-stage-ink/8 p-4">
          <p class="text-sm text-ws-stage-soft">The microphone listens while the run is on. Notes are graded by pitch class.</p>
          <p class="mt-1 font-display text-2xl font-semibold tnum">{mic.pitch ? noteName(mic.pitch.midi) : "No pitch yet"}</p>
        </div>
      {:else if fretted && tuning}
        <Fretboard openStrings={tuning.openStrings} from={fretFrom} to={fretTo} marks={fretMarks} {flashes} label="{instrument} fretboard" />
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

</style>
