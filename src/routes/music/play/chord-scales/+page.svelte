<script lang="ts">
  import { browser } from "$app/environment";
  import Play from "lucide-svelte/icons/play";
  import { onDestroy, tick } from "svelte";

  import {
    Capability,
    VIEWABLE_INSTRUMENTS,
    unixMs,
    type ExerciseRunRecord,
    type InstrumentId,
    type NoteEvent,
    type ScoringEvent,
  } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildJazzSequenceCapture,
    gradeLickSequence,
    normalizeChordScaleDrillConfig,
    type ChordScaleDrillChangesId,
    type LickGrade,
  } from "@repo/music-core/engines/jazz";
  import { targetTones, type TargetTone, type ToneRole } from "@repo/music-core/engines/jam";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    scaleSemitones,
    type ScalePatternKind,
  } from "@repo/music-core/exercises/scale-pattern";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import PianoSurface, { type PianoHighlightRole } from "../../_components/piano/PianoSurface.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  let { runtime: runtimeProp }: { runtime?: MusicRuntime } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();
  const SCALE_BPM = 132;
  const CHORD_SCALE_SKILL = "harmony.ii-v-i";
  const CHORD_SCALE_CAPABILITIES = [Capability.Harmony, Capability.Technique, Capability.Pitch];
  const CHORD_SCALE_DIFFICULTY = 0.65;
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const servicesReady = Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);

  // The go-to scale for each chord as a ii-V-I moves: the relationship the Jazz
  // Guide teaches as reference, here drilled by ear and hand. Roots in C; scale
  // kinds reuse the J5 scale set so notes come straight from scaleSemitones().
  interface Change {
    symbol: string;
    rootMidi: number;
    scale: ScalePatternKind;
    scaleLabel: string;
  }
  interface Changes {
    id: ChordScaleDrillChangesId;
    label: string;
    chords: Change[];
  }
  interface CompletedChord {
    change: Change;
    index: number;
    expectedMidi: number[];
    playedMidi: number[];
    grade: LickGrade;
  }
  const ALL_CHANGES: Changes[] = [
    {
      id: "major",
      label: "Major ii-V-I",
      chords: [
        { symbol: "Dm7", rootMidi: 62, scale: "dorian", scaleLabel: "D Dorian" },
        { symbol: "G7", rootMidi: 67, scale: "mixolydian", scaleLabel: "G Mixolydian" },
        { symbol: "Cmaj7", rootMidi: 60, scale: "major", scaleLabel: "C Major" },
      ],
    },
    {
      id: "minor",
      label: "Minor ii-V-i",
      chords: [
        { symbol: "Dm7♭5", rootMidi: 62, scale: "locrian", scaleLabel: "D Locrian" },
        { symbol: "G7alt", rootMidi: 67, scale: "altered", scaleLabel: "G Altered" },
        { symbol: "Cm7", rootMidi: 60, scale: "dorian", scaleLabel: "C Dorian" },
      ],
    },
  ];
  const changesOptions = ALL_CHANGES.map((entry) => ({ value: entry.id, label: entry.label }));
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeChordScaleDrillConfig(initialSearch);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;
  const initialInstrument = VIEWABLE_INSTRUMENTS.includes(
    initialSearch.get("instrument") as InstrumentId,
  )
    ? (initialSearch.get("instrument") as InstrumentId)
    : runtime.activeInstrument;

  let changesId = $state<ChordScaleDrillChangesId>(initialConfig.changesId);
  let instrument = $state<InstrumentId>(initialInstrument);
  runtime.setActiveInstrument(initialInstrument);
  let bpm = $state(SCALE_BPM);
  let chordIndex = $state(0);
  // Per-chord step within a run (renamed from `phase` to free that word for the
  // shell's setup/stage/summary phase model below).
  let step = $state<"idle" | "listening" | "graded">("idle");
  // True once the user starts the drill; distinguishes the setup screen from the
  // active stage (both sit at chordIndex 0 with no grades before the first play).
  let started = $state(false);
  let played = $state<number[]>([]);
  let grades = $state<LickGrade[]>([]);
  let completedChords = $state<CompletedChord[]>([]);
  let status = $state("Ready. Press Start, or Space.");
  let captured = false;
  let attemptStartedAt = unixMs(Date.now());
  let unsubscribe: (() => void) | undefined;
  let previewGeneration = 0;
  let attemptPending = false;
  let attemptRequest = 0;
  let practiceContextRequest = 0;
  let practiceContextReady: Promise<boolean> = Promise.resolve(true);

  const changes = $derived(ALL_CHANGES.find((entry) => entry.id === changesId) ?? ALL_CHANGES[0]);
  const chord = $derived(changes.chords[chordIndex]);
  const scaleMidi = $derived(scaleSemitones(chord.scale).map((semitones) => chord.rootMidi + semitones));
  const chartTones = $derived<TargetTone[]>(targetTones(normalizedChordSymbol(chord.symbol), chord.scaleLabel));
  // One keyboard carries both layers: tone roles by pitch class across the
  // range the scale needs, and the next expected note as the target while listening.
  const KEY_RANGE = Array.from({ length: 61 }, (_, i) => 36 + i);
  const toneRoles = $derived(
    Object.fromEntries(
      KEY_RANGE.map((midi) => [
        midi,
        chartTones.find((tone) => tone.pitchClass === midi % 12)?.role ?? ("avoid" as ToneRole),
      ]),
    ) as Record<number, ToneRole>,
  );
  const nextTarget = $derived<Record<number, PianoHighlightRole>>(
    step === "listening" && scaleMidi[played.length] !== undefined
      ? { [scaleMidi[played.length]!]: "target" }
      : {},
  );
  const chordSymbols = $derived(changes.chords.map((entry) => entry.symbol).join(" "));
  const done = $derived(grades.length === changes.chords.length);
  const normalizedConfig = $derived(normalizeChordScaleDrillConfig({ changes: changesId }));
  const variantKey = $derived(`v1:chord-scales:${instrument}:${changesId}`);
  const overall = $derived(
    grades.length === 0
      ? 0
      : Math.round((grades.reduce((sum, g) => sum + g.accuracy, 0) / grades.length) * 100),
  );

  // Shell phase, computed from route state; the shell renders it but never
  // transitions. Setup is hidden during play (mandatory anatomy); `started`
  // gates it, and the summary replaces the body once every chord is graded.
  const phase = $derived<"setup" | "stage" | "summary">(
    !started ? "setup" : done ? "summary" : "stage",
  );
  // Announced by the persistent live region: branch swaps remount the visible
  // status, so screen readers would otherwise miss the transitions.
  const liveAnnouncement = $derived(
    done ? `Chord-scales complete. ${overall}% across ${changes.chords.length} chords.` : status,
  );

  // Branch swaps destroy the focused element, dropping focus to <body>. Move it
  // to the freshly mounted stage/results heading on each transition, but not on
  // initial mount, so page load doesn't steal focus. Focus stays route-owned;
  // the summary card only exposes its heading ref.
  let setupHeading = $state<HTMLDivElement | null>(null);
  let activeHeading = $state<HTMLElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let previousPhase: "setup" | "stage" | "summary" | undefined;

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    const current = phase;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") activeHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupHeading?.focus({ preventScroll: false });
  });

  $effect(() => {
    const key = variantKey;
    const contextRequest = ++practiceContextRequest;
    attemptRequest += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "chord-scales",
        variantKey: key,
        defaultBpm: SCALE_BPM,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: [...VIEWABLE_INSTRUMENTS],
        onBpmChange: (next) => (bpm = next),
        onInstrumentChange: (next) => (instrument = next),
      })
      .then((nextCleanup) => {
        cleanup = nextCleanup;
        if (disposed || contextRequest !== practiceContextRequest) {
          cleanup();
          return false;
        }
        return true;
      });
    return () => {
      disposed = true;
      practiceContextRequest += 1;
      attemptRequest += 1;
      cleanup();
    };
  });

  function reset(): void {
    attemptRequest += 1;
    cancelPreview();
    runtime.endPerformance();
    unsubscribe?.();
    unsubscribe = undefined;
    chordIndex = 0;
    step = "idle";
    played = [];
    grades = [];
    completedChords = [];
    captured = false;
    status = "Ready. Press Start, or Space.";
  }

  function selectChanges(id: string): void {
    changesId = normalizeChordScaleDrillConfig({ changes: id }).changesId;
    reset();
  }

  // Setup → stage: a fresh run. Lifecycle stays per-chord (Hear/Play it back);
  // this only reveals the stage.
  function beginRun(): void {
    reset();
    started = true;
  }

  // Leave the stage or summary for setup (mid-run End run and the summary's
  // Change setup share this). reset() clears the run so `done` and `step` drop.
  function returnToSetup(): void {
    reset();
    started = false;
  }

  function romanFor(changesKind: string, index: number): string {
    if (index === 0) return changesKind === "minor" ? "iiø" : "ii";
    if (index === 1) return changesKind === "minor" ? "V7alt" : "V";
    return changesKind === "minor" ? "i" : "I";
  }

  function normalizedChordSymbol(symbol: string): string {
    return symbol.replaceAll("♭", "b").replaceAll("♯", "#");
  }

  async function hearScale(): Promise<void> {
    const generation = ++previewGeneration;
    runtime.sound.stopPattern();
    if (!(await runtime.ensurePlaybackVoice())) {
      if (generation === previewGeneration) status = runtime.audioMessage;
      return;
    }
    if (generation !== previewGeneration) return;
    const secondsPerBeat = 60 / bpm;
    runtime.sound.playPattern(
      scaleMidi.map((midi, step) => ({
        midiNotes: [midi],
        offsetSeconds: step * secondsPerBeat * 0.5,
        durationSeconds: secondsPerBeat * 0.9,
      })),
      0.85,
    );
  }

  function cancelPreview(): void {
    previewGeneration += 1;
    runtime.sound.stopPattern();
  }

  async function startAttempt(): Promise<void> {
    if (attemptPending) return;
    cancelPreview();
    unsubscribe?.();
    attemptPending = true;
    try {
      await tick();
      const request = ++attemptRequest;
      if (!(await practiceContextReady) || request !== attemptRequest) return;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (request === attemptRequest) status = runtime.audioMessage;
        return;
      }
      if (request !== attemptRequest) return;
      const performance = await runtime.beginPerformance();
      if (request !== attemptRequest) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      if (completedChords.length === 0) attemptStartedAt = unixMs(Date.now());
      step = "listening";
      played = [];
      status = `Play ${chord.scaleLabel} over ${chord.symbol}.`;
      unsubscribe = runtime.router.subscribe((event: NoteEvent) => {
        if (step !== "listening" || event.type !== "noteOn") return;
        if (runtime.audioEnabled) {
          runtime.sound.playNote(event.midiNote, 0.16, undefined, event.velocity);
        }
        played = [...played, event.midiNote];
        if (played.length >= scaleMidi.length) gradeChord();
      });
    } finally {
      attemptPending = false;
    }
  }

  function gradeChord(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    runtime.endPerformance();
    const currentChord = chord;
    const currentIndex = chordIndex;
    const expected = [...scaleMidi];
    const response = [...played];
    const grade = gradeLickSequence(expected, response);
    const nextCompleted = [
      ...completedChords,
      { change: currentChord, index: currentIndex, expectedMidi: expected, playedMidi: response, grade },
    ];
    grades = [...grades, grade];
    completedChords = nextCompleted;
    if (chordIndex < changes.chords.length - 1) {
      step = "idle";
      chordIndex += 1;
      status = `${Math.round(grade.accuracy * 100)}% on ${currentChord.symbol}, next chord: ${changes.chords[chordIndex].symbol}.`;
    } else {
      step = "graded";
      void finish(nextCompleted);
    }
  }

  async function finish(completed = completedChords): Promise<void> {
    const request = attemptRequest;
    runtime.endPerformance();
    if (!captured) {
      captured = true;
      const endedAt = unixMs(Date.now());
      const completedChanges = changes;
      const completedInstrument = instrument;
      const completedStartedAt = attemptStartedAt;
      const completedOverall = Math.round(
        (completed.reduce((sum, item) => sum + item.grade.accuracy, 0) / completed.length) * 100,
      );
      const sessionId = stableId("jazz-chord-scale-session");
      const runId = stableId("jazz-chord-scale-run");
      const exerciseId = `jazz.chord-scale.${completedChanges.id}`;
      const captures = completed.map((item) =>
        buildJazzSequenceCapture({
          exerciseId,
          label: `${item.change.symbol} · ${item.change.scaleLabel}`,
          sessionId,
          runId,
          eventId: stableId(`jazz-chord-scale-event-${item.index + 1}`),
          promptId: `${completedChanges.id}-${item.index + 1}-${item.change.symbol}`,
          skillIds: [CHORD_SCALE_SKILL, `technique.scale.${item.change.scale}`],
          capabilities: CHORD_SCALE_CAPABILITIES,
          expectedMidi: item.expectedMidi,
          playedMidi: item.playedMidi,
          grade: item.grade,
          startedAt: completedStartedAt,
          endedAt,
          difficulty: CHORD_SCALE_DIFFICULTY,
          instrument: completedInstrument,
          params: {
            changesId: completedChanges.id,
            chordSymbol: item.change.symbol,
            scale: item.change.scale,
          },
        }),
      );
      const scoringEvents = captures.map((capture) => capture.event);
      const runs = [
        mergeChordScaleRun(captures.map((capture) => capture.run), exerciseId, runId, {
          changes: completedChanges,
          endedAt,
          instrument: completedInstrument,
          startedAt: completedStartedAt,
        }),
      ];
      const journal = {
        id: sessionId,
        source: "drill" as const,
        instrument: completedInstrument,
        tags: ["jazz", "chord-scales"],
        scoringEvents,
        runs,
        note: `${completedChanges.label} chord-scales · ${completedOverall}%`,
      };
      const xp = await ingestScoringEvents(scoringEvents);
      if (request === attemptRequest) {
        status = `Done. ${completedOverall}% across ${completedChanges.chords.length} chords, +${xp} XP.`;
      }
      await runtime.recordPractice({
        ...journal,
        xpEarned: xp,
      });
    } else {
      status = `Done. ${overall}% across ${changes.chords.length} chords.`;
    }
  }

  function mergeChordScaleRun(
    runs: ExerciseRunRecord[],
    exerciseId: string,
    runId: string,
    snapshot: {
      changes: Changes;
      endedAt: ReturnType<typeof unixMs>;
      instrument: InstrumentId;
      startedAt: ReturnType<typeof unixMs>;
    },
  ): ExerciseRunRecord {
    return {
      id: runId,
      exerciseId,
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
      promptIds: runs.flatMap((run) => run.promptIds),
      targetSkillIds: [...new Set(runs.flatMap((run) => run.targetSkillIds))],
      instrument: snapshot.instrument,
      difficulty: CHORD_SCALE_DIFFICULTY,
      params: {
        changesId: snapshot.changes.id,
        chords: snapshot.changes.chords.map((entry) => entry.symbol),
      },
    };
  }

  async function ingestScoringEvents(events: ScoringEvent[]): Promise<number> {
    await servicesReady;
    let xp = 0;
    for (const event of events) {
      await skills.ingest(event);
      await analytics.ingest(event);
      xp += await progress.ingest(event, skills);
    }
    return xp;
  }

  function stableId(prefix: string): string {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("changes", config.changesId);
    params.set("instrument", instrument);
    params.set("bpm", String(bpm));
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onDestroy(() => {
    attemptRequest += 1;
    practiceContextRequest += 1;
    cancelPreview();
    runtime.endPerformance();
    unsubscribe?.();
  });
</script>

<svelte:head>
  <title>Chord-Scale Drill | Practice OS</title>
  <meta
    name="description"
    content="Play the go-to scale for each chord as a ii-V-I moves: Dorian, Mixolydian, Ionian, graded note-by-note."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Chord-Scale Drill" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <!-- Persistent live region: mounted outside the phase branches so transitions announce. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet setupSummaryLine()}
    {changes.label} · {chordSymbols} · {bpm} BPM
  {/snippet}

  <!-- The chord chart: the same strip on the ready stage (nothing current yet), during
       the run (current + next) and in results (all graded). -->
  {#snippet chordStrip(current: number)}
    <ol class="grid grid-cols-3 gap-2" aria-label={`${changes.label} chord chart`}>
      {#each changes.chords as change, index (change.symbol)}
        {@const state =
          index === current ? "current" : current >= 0 && index === current + 1 ? "next" : "upcoming"}
        <li
          data-testid={`progression-cell-${index}`}
          data-state={state}
          class={[
            "grid gap-0.5 rounded-lg border p-2.5 text-center text-sm sm:p-3",
            state === "current" && "border-practice-accent bg-practice-accent/15 ring-1 ring-practice-accent/30",
            state === "next" && "border-dashed border-stage-line bg-stage-2",
            state === "upcoming" && "border-stage-line bg-stage-2/60",
          ]}
        >
          <span class="text-base font-bold sm:text-lg">{change.symbol}</span>
          <span class="text-xs text-stage-muted">
            {romanFor(changes.id, index)}{state === "current" ? " · now" : state === "next" ? " · next" : ""}
          </span>
          <span class="text-[0.6875rem] font-medium text-stage-muted">{change.scaleLabel}</span>
        </li>
      {/each}
    </ol>
  {/snippet}

  {#snippet toneLegend()}
    <div class="flex flex-wrap items-center gap-3 text-xs text-stage-muted">
      <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-primary"></span>Chord tones</span>
      <span class="flex items-center gap-1.5">
        <span class="size-3 rounded-full bg-primary/25 ring-1 ring-inset ring-primary"></span>Scale tones
      </span>
      <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-muted"></span>Avoid</span>
    </div>
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={returnToSetup}>
      {#snippet heading()}
        <Card.Description>{changes.label} · {chordSymbols}</Card.Description>
        <Card.Title>Chord-scales complete</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {overall}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> across {changes.chords.length} chords</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta tags={["chord-scales"]} accuracy={overall / 100} before={visitStartedAt} />
      {/snippet}
      {#snippet children()}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile size="sm" label="Chords graded" value={`${grades.length} / ${changes.chords.length}`} />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        </div>
        <div class="grid gap-2">
          {#each completedChords as item (item.index)}
            <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span class="font-medium">{item.change.symbol} · {item.change.scaleLabel}</span>
              <span class="tabular-nums text-muted-foreground">
                {Math.round(item.grade.accuracy * 100)}%
              </span>
            </div>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">Harmony · Jazz vocabulary</p>
      {/snippet}
      {#snippet actions()}
        <Button type="button" onclick={beginRun}>Again</Button>
      {/snippet}
      {#snippet routineContinue()}
        <RoutineContinueAction routine={runtime.dailyRoutine} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/chord-scales" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-3 rounded-lg border bg-card p-4">
        <SegmentedControl
          size="sm"
          ariaLabel="Changes"
          options={changesOptions}
          value={changesId}
          onChange={selectChanges}
        />
        <p class="text-xs text-muted-foreground">
          Tempo lives in the practice controls above: {bpm} BPM.
        </p>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage {instrument} class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · chord to scale</p>
            <div
              role="heading"
              aria-level="2"
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="chord-scales-ready-heading"
              bind:this={setupHeading}
            >
              {changes.label}
            </div>
            <p class="text-sm text-stage-muted">
              Every chord implies a scale. Hear the go-to scale, then play it back over each chord.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" onclick={beginRun}>Start</Button>
            <StartShortcut onStart={beginRun} />
          </div>
        </div>
        {@render chordStrip(-1)}
        <div class="grid min-w-0 gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-semibold tracking-wide text-stage-muted">First up · {chord.symbol} / {chord.scaleLabel}</p>
            {@render toneLegend()}
          </div>
          <PianoSurface router={runtime.router} notes={scaleMidi} {toneRoles} noteNames="c" />
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <PracticeStage {instrument} class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold tracking-wide text-stage-muted">
              Now playing · {romanFor(changes.id, chordIndex)} ·
              <span data-testid="progression-current-symbol">{chord.symbol}</span>
            </p>
            <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={activeHeading}>
              {chord.scaleLabel} over {chord.symbol}
            </h2>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onclick={hearScale}>
              <Play aria-hidden="true" />
              Hear scale
            </Button>
            <Button type="button" onclick={() => void startAttempt()} disabled={step === "listening"}>
              Play it back
            </Button>
            <StartShortcut onStart={() => void startAttempt()} enabled={step !== "listening"} />
          </div>
        </div>
        {@render chordStrip(chordIndex)}
        <div class="grid grid-cols-2 gap-3">
          <HudTile size="sm" label="Notes played" value={`${played.length} / ${scaleMidi.length}`} />
          <HudTile size="sm" label="Graded" value={`${grades.length} / ${changes.chords.length}`} />
        </div>
        {#if step === "listening"}
          <Progress value={Math.min(played.length, scaleMidi.length)} max={scaleMidi.length} />
        {/if}
        <div class="grid min-w-0 gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-semibold tracking-wide text-stage-muted">Target tones · {chord.symbol} / {chord.scaleLabel}</p>
            {@render toneLegend()}
          </div>
          <PianoSurface router={runtime.router} notes={scaleMidi} {toneRoles} highlights={nextTarget} noteNames="c" />
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={returnToSetup}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <DrillProgressRail
        items={[
          { label: "Changes", value: changes.label },
          { label: "Chord", value: chord.symbol },
          { label: "Graded", value: `${grades.length} / ${changes.chords.length}` },
          { label: "Overall", value: grades.length > 0 ? `${overall}%` : "0%" },
          { label: "Input", value: runtime.activeSource === "midi" ? "MIDI" : "On-screen" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
