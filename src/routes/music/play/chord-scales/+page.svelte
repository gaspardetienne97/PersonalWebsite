<script lang="ts">
  import { browser } from "$app/environment";
  import Play from "lucide-svelte/icons/play";
  import { onDestroy } from "svelte";

  import {
    Capability,
    unixMs,
    type ExerciseRunRecord,
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
  import {
    targetTones,
    type JamProgression,
    type TargetTone,
  } from "@repo/music-core/engines/jam";
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

  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import ProgressionChartStage from "../../_components/ProgressionChartStage.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
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

  // The go-to scale for each chord as a ii-V-I moves — the relationship the Jazz
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
  const initialConfig = normalizeChordScaleDrillConfig(
    browser ? initialDrillSearch() : {},
  );

  let changesId = $state<ChordScaleDrillChangesId>(initialConfig.changesId);
  let chordIndex = $state(0);
  let phase = $state<"idle" | "listening" | "graded">("idle");
  let played = $state<number[]>([]);
  let grades = $state<LickGrade[]>([]);
  let completedChords = $state<CompletedChord[]>([]);
  let status = $state("Hear the scale for each chord, then play it back.");
  let captured = false;
  let attemptStartedAt = unixMs(Date.now());
  let unsubscribe: (() => void) | undefined;

  const changes = $derived(ALL_CHANGES.find((entry) => entry.id === changesId) ?? ALL_CHANGES[0]);
  const chord = $derived(changes.chords[chordIndex]);
  const scaleMidi = $derived(scaleSemitones(chord.scale).map((semitones) => chord.rootMidi + semitones));
  const progressionView = $derived<JamProgression>({
    id: `chord-scale-${changes.id}`,
    name: changes.label,
    key: changes.id === "minor" ? "C minor" : "C major",
    style: "jazz",
    chords: changes.chords.map((entry, index) => ({
      symbol: entry.symbol,
      roman: romanFor(changes.id, index),
      scale: entry.scaleLabel,
      bars: 1,
    })),
  });
  const chartTones = $derived<TargetTone[]>(targetTones(normalizedChordSymbol(chord.symbol), chord.scaleLabel));
  const done = $derived(grades.length === changes.chords.length);
  const normalizedConfig = $derived(normalizeChordScaleDrillConfig({ changes: changesId }));
  const overall = $derived(
    grades.length === 0
      ? 0
      : Math.round((grades.reduce((sum, g) => sum + g.accuracy, 0) / grades.length) * 100),
  );

  $effect(() => {
    syncConfigUrl();
  });

  function reset(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    chordIndex = 0;
    phase = "idle";
    played = [];
    grades = [];
    completedChords = [];
    captured = false;
    status = "Hear the scale for each chord, then play it back.";
  }

  function selectChanges(id: string): void {
    changesId = normalizeChordScaleDrillConfig({ changes: id }).changesId;
    reset();
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
    if (!(await runtime.enableAudio())) return;
    const secondsPerBeat = 60 / SCALE_BPM;
    scaleMidi.forEach((midi, step) => {
      runtime.sound.playNote(midi, secondsPerBeat * 0.9, `+${step * secondsPerBeat * 0.5}`, 0.85);
    });
  }

  function startAttempt(): void {
    unsubscribe?.();
    if (completedChords.length === 0) attemptStartedAt = unixMs(Date.now());
    phase = "listening";
    played = [];
    status = `Play ${chord.scaleLabel} over ${chord.symbol}…`;
    unsubscribe = runtime.router.subscribe((event: NoteEvent) => {
      if (phase !== "listening" || event.type !== "noteOn") return;
      if (runtime.audioEnabled) {
        runtime.sound.playNote(event.midiNote, 0.16, undefined, event.velocity);
      }
      played = [...played, event.midiNote];
      if (played.length >= scaleMidi.length) gradeChord();
    });
  }

  function gradeChord(): void {
    unsubscribe?.();
    unsubscribe = undefined;
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
      phase = "idle";
      chordIndex += 1;
      status = `${Math.round(grade.accuracy * 100)}% — next chord: ${changes.chords[chordIndex].symbol}.`;
    } else {
      phase = "graded";
      void finish(nextCompleted);
    }
  }

  async function finish(completed = completedChords): Promise<void> {
    if (!captured) {
      captured = true;
      const endedAt = unixMs(Date.now());
      const sessionId = stableId("jazz-chord-scale-session");
      const runId = stableId("jazz-chord-scale-run");
      const exerciseId = `jazz.chord-scale.${changes.id}`;
      const captures = completed.map((item) =>
        buildJazzSequenceCapture({
          exerciseId,
          label: `${item.change.symbol} · ${item.change.scaleLabel}`,
          sessionId,
          runId,
          eventId: stableId(`jazz-chord-scale-event-${item.index + 1}`),
          promptId: `${changes.id}-${item.index + 1}-${item.change.symbol}`,
          skillIds: [CHORD_SCALE_SKILL, `technique.scale.${item.change.scale}`],
          capabilities: CHORD_SCALE_CAPABILITIES,
          expectedMidi: item.expectedMidi,
          playedMidi: item.playedMidi,
          grade: item.grade,
          startedAt: attemptStartedAt,
          endedAt,
          difficulty: CHORD_SCALE_DIFFICULTY,
          instrument: "piano",
          params: {
            changesId: changes.id,
            chordSymbol: item.change.symbol,
            scale: item.change.scale,
          },
        }),
      );
      const scoringEvents = captures.map((capture) => capture.event);
      const runs = [mergeChordScaleRun(captures.map((capture) => capture.run), exerciseId, runId)];
      const xp = await ingestScoringEvents(scoringEvents);
      status = `Done — ${overall}% across ${changes.chords.length} chords · +${xp} XP.`;
      await runtime.recordPractice({
        id: sessionId,
        source: "drill",
        instrument: "piano",
        tags: ["jazz", "chord-scales"],
        scoringEvents,
        runs,
        xpEarned: xp,
        note: `${changes.label} chord-scales · ${overall}%`,
      });
    } else {
      status = `Done — ${overall}% across ${changes.chords.length} chords.`;
    }
  }

  function mergeChordScaleRun(
    runs: ExerciseRunRecord[],
    exerciseId: string,
    runId: string,
  ): ExerciseRunRecord {
    return {
      id: runId,
      exerciseId,
      startedAt: attemptStartedAt,
      endedAt: unixMs(Date.now()),
      promptIds: runs.flatMap((run) => run.promptIds),
      targetSkillIds: [...new Set(runs.flatMap((run) => run.targetSkillIds))],
      instrument: "piano",
      difficulty: CHORD_SCALE_DIFFICULTY,
      params: { changesId: changes.id, chords: changes.chords.map((entry) => entry.symbol) },
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
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onDestroy(() => unsubscribe?.());
</script>

<svelte:head>
  <title>Chord-Scale Drill | Practice OS</title>
  <meta
    name="description"
    content="Play the go-to scale for each chord as a ii-V-I moves — Dorian, Mixolydian, Ionian — graded note-by-note."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Chord-Scale Drill"
    subtitle="As the ii-V-I moves, play the go-to scale for each chord. Graded note-by-note; XP feeds your jazz vocabulary."
  >
    {#snippet controls()}
      <SourceReadout
        label="Playing on"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="min-w-0 space-y-4">
      <ProgressionChartStage progression={progressionView} currentIndex={chordIndex} tones={chartTones} />

      <Card.Root>
        <Card.Header class="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Card.Description>Changes</Card.Description>
            <Card.Title>{changes.label} · {changes.chords.map((c) => c.symbol).join(" ")}</Card.Title>
          </div>
          <SegmentedControl
            size="sm"
            ariaLabel="Changes"
            options={changesOptions}
            value={changesId}
            onChange={selectChanges}
          />
        </Card.Header>

        <Card.Content class="space-y-5">
          {#if phase === "listening"}
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs text-muted-foreground">
                <span>Notes played</span>
                <span class="tabular-nums">{played.length} / {scaleMidi.length}</span>
              </div>
              <Progress value={Math.min(played.length, scaleMidi.length)} max={scaleMidi.length} />
            </div>
          {/if}

          {#if done}
            <div class="rounded-md border border-practice-accent/30 bg-practice-accent/5 p-4">
              <p class="font-semibold">{overall}% across {changes.chords.length} chords</p>
              <p class="text-sm text-muted-foreground">
                Hear each scale again and match it note-for-note over its chord.
              </p>
            </div>
            <LastRunDelta tags={["chord-scales"]} accuracy={overall / 100} before={visitStartedAt} />
            <RoutineContinueAction routine={runtime.dailyRoutine} />
            <NextUpSuggestion {skills} {analytics} currentPath="/music/play/chord-scales" routine={runtime.dailyRoutine} />
          {/if}

          <OnScreenKeyboard router={runtime.router} />
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          {#if done}
            <Button type="button" onclick={reset}>Restart</Button>
          {:else}
            <Button type="button" variant="outline" onclick={hearScale}>
              <Play aria-hidden="true" />
              Hear scale
            </Button>
            <Button type="button" onclick={startAttempt}>Play it back</Button>
          {/if}
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    </div>

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Why this drill</Card.Description>
          <Card.Title class="text-base">Chord → scale</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2 text-sm text-muted-foreground">
          <p>Every chord implies a scale. Internalising which scale fits which chord is the core of jazz improv.</p>
          <p>Hear the go-to scale, then play it back over each chord of the progression.</p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>This run</Card.Description>
          <Card.Title>{grades.length > 0 ? `${overall}%` : "—"}</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Chords graded</span>
            <span class="font-medium tabular-nums">{grades.length} / {changes.chords.length}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Skill</span>
            <span class="font-medium">Jazz vocabulary</span>
          </div>
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
