<script lang="ts">
  import { browser } from "$app/environment";
  import Play from "lucide-svelte/icons/play";
  import { onDestroy } from "svelte";

  import { Capability, unixMs, type NoteEvent, type ScoringEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildJazzSequenceCapture,
    gradeLickSequence,
    JAZZ_LICKS,
    LICK_PHRASES,
    lickTimeline,
    normalizeJazzLickDrillConfig,
    type LickCategory,
    type LickGrade,
  } from "@repo/music-core/engines/jazz";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  const LICK_BPM = 150;
  const LICK_EXERCISE_ID = "jazz.lick.playback";
  const LICK_SKILL_IDS = ["harmony.ii-v-i"];
  const LICK_CAPABILITIES = [Capability.Harmony, Capability.Improvisation, Capability.Pitch];
  const LICK_DIFFICULTY = 0.6;
  const initialConfig = normalizeJazzLickDrillConfig(
    browser ? initialDrillSearch() : {},
  );
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const servicesReady = Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);

  const lickCategories = [
    { value: "major-ii-V-I", label: "Major ii-V-I" },
    { value: "major-ii-V-I-VI", label: "ii-V-I-VI" },
    { value: "minor-ii-V-i", label: "Minor ii-V-i" },
    { value: "minor-chord", label: "Minor chord" },
  ];

  let category = $state<LickCategory>(initialConfig.category);
  let lickNumber = $state(initialConfig.lickNumber);

  const visibleLicks = $derived(JAZZ_LICKS.filter((l) => l.category === category));
  const lick = $derived(JAZZ_LICKS.find((l) => l.number === lickNumber) ?? visibleLicks[0]);
  const phrase = $derived(LICK_PHRASES[lick?.number ?? 1] ?? []);
  const expectedMidi = $derived(phrase.map(([midi]) => midi));
  const phraseNotes = $derived(expectedMidi.map((midi) => midiToNote(midi, true)).join("  "));

  let phase = $state<"idle" | "listening" | "graded">("idle");
  let played = $state<number[]>([]);
  let grade = $state<LickGrade | undefined>();
  let status = $state("Pick a lick, hear it, then play it back.");
  let captured = false;
  let attemptStartedAt = unixMs(Date.now());
  let unsubscribe: (() => void) | undefined;

  $effect(() => {
    syncConfigUrl();
  });

  function selectCategory(next: LickCategory): void {
    const config = normalizeJazzLickDrillConfig({ category: next });
    category = config.category;
    lickNumber = config.lickNumber;
    reset();
    status = "Pick a lick, hear it, then play it back.";
  }

  function reset(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    phase = "idle";
    played = [];
    grade = undefined;
    captured = false;
  }

  function selectLick(next: number): void {
    const config = normalizeJazzLickDrillConfig({ category, lickNumber: next });
    category = config.category;
    lickNumber = config.lickNumber;
    reset();
    status = "Pick a lick, hear it, then play it back.";
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeJazzLickDrillConfig({ category, lickNumber });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("category", config.category);
    params.set("lick", String(config.lickNumber));
    syncRouteQuery(`${url.pathname}?${params.toString()}${url.hash}`);
  }

  async function playReference(): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    const secondsPerBeat = 60 / LICK_BPM;
    for (const note of lickTimeline(phrase)) {
      runtime.sound.playNote(
        note.midi,
        note.beats * secondsPerBeat * 0.96,
        `+${note.offsetBeats * secondsPerBeat}`,
        0.85,
      );
    }
  }

  function startAttempt(): void {
    reset();
    attemptStartedAt = unixMs(Date.now());
    phase = "listening";
    status = "Play the lick…";
    unsubscribe = runtime.router.subscribe((event: NoteEvent) => {
      if (phase !== "listening" || event.type !== "noteOn") return;
      if (runtime.audioEnabled) {
        runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
      }
      played = [...played, event.midiNote];
      if (played.length >= expectedMidi.length) void finish();
    });
  }

  async function finish(): Promise<void> {
    unsubscribe?.();
    unsubscribe = undefined;
    const currentLick = lick;
    const expected = [...expectedMidi];
    const response = [...played];
    const result = gradeLickSequence(expected, response);
    grade = result;
    phase = "graded";
    if (!captured) {
      captured = true;
      const endedAt = unixMs(Date.now());
      const sessionId = stableId("jazz-lick-session");
      const runId = stableId("jazz-lick-run");
      const capture = buildJazzSequenceCapture({
        exerciseId: LICK_EXERCISE_ID,
        label: `Lick #${currentLick?.number ?? lickNumber}`,
        sessionId,
        runId,
        eventId: stableId("jazz-lick-event"),
        promptId: `lick-${currentLick?.number ?? lickNumber}`,
        skillIds: LICK_SKILL_IDS,
        capabilities: LICK_CAPABILITIES,
        expectedMidi: expected,
        playedMidi: response,
        grade: result,
        startedAt: attemptStartedAt,
        endedAt,
        difficulty: LICK_DIFFICULTY,
        instrument: "piano",
        params: {
          category,
          lickNumber: currentLick?.number ?? lickNumber,
          progression: currentLick?.progression ?? [],
        },
      });
      const xp = await ingestScoringEvents([capture.event]);
      status = `${result.matched}/${result.total} notes · ${Math.round(result.accuracy * 100)}% · +${xp} XP`;
      await runtime.recordPractice({
        id: sessionId,
        source: "drill",
        instrument: "piano",
        tags: ["jazz", "licks"],
        scoringEvents: [capture.event],
        runs: [capture.run],
        xpEarned: xp,
        note: `Lick #${currentLick?.number ?? lickNumber}: ${Math.round(result.accuracy * 100)}%`,
      });
    } else {
      status = `${result.matched}/${result.total} notes · ${Math.round(result.accuracy * 100)}%`;
    }
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

  onDestroy(() => unsubscribe?.());
</script>

<svelte:head>
  <title>Jazz Licks Drill | Musicianship OS</title>
  <meta
    name="description"
    content="Hear a transcribed jazz lick, then play it back — graded note-by-note against the phrase, octave-lenient."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Jazz Licks Drill"
    subtitle="Hear a transcribed line, then play it back. Graded note-by-note against the phrase; XP feeds your jazz vocabulary."
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
      <Card.Root>
        <Card.Header class="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Card.Description>Drill</Card.Description>
            <Card.Title>Lick #{lick?.number} · {lick?.progression.join(" ")}</Card.Title>
          </div>
          <SegmentedControl
            size="sm"
            ariaLabel="Lick category"
            options={lickCategories}
            value={category}
            onChange={(value) => selectCategory(value as LickCategory)}
          />
        </Card.Header>

        <Card.Content class="space-y-5">
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Pick a lick">
            {#each visibleLicks as entry (entry.number)}
              <button
                type="button"
                aria-pressed={entry.number === lickNumber}
                onclick={() => selectLick(entry.number)}
                class="size-8 rounded-md border text-sm font-semibold tabular-nums transition-colors {entry.number ===
                lickNumber
                  ? 'border-practice-accent bg-practice-accent text-practice-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted'}"
              >
                {entry.number}
              </button>
            {/each}
          </div>

          <div class="space-y-2 rounded-lg border bg-muted/30 p-4">
            <p class="eyebrow">The line</p>
            <p class="font-mono text-sm tabular-nums">{phraseNotes}</p>
            {#if lick?.tip}
              <p class="text-sm text-muted-foreground">{lick.tip}</p>
            {/if}
            <div class="flex flex-wrap gap-1.5 pt-1">
              {#each lick?.scales ?? [] as scale (scale)}
                <Badge variant="outline">{scale}</Badge>
              {/each}
            </div>
          </div>

          {#if phase !== "idle"}
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs text-muted-foreground">
                <span>{phase === "listening" ? "Notes played" : "Result"}</span>
                <span class="tabular-nums">{played.length} / {expectedMidi.length}</span>
              </div>
              <Progress value={Math.min(played.length, expectedMidi.length)} max={expectedMidi.length} />
            </div>
          {/if}

          {#if phase === "graded" && grade}
            <div class="rounded-md border border-practice-accent/30 bg-practice-accent/5 p-4">
              <p class="font-semibold">
                {grade.matched} / {grade.total} notes · {Math.round(grade.accuracy * 100)}%
              </p>
              <p class="text-sm text-muted-foreground">
                Play the reference again and match the line note-for-note.
              </p>
            </div>
            <AdaptiveRetryBar onRetry={startAttempt} retryLabel="Repeat lick" />
            <RoutineContinueAction routine={runtime.dailyRoutine} />
          {/if}

          <OnScreenKeyboard router={runtime.router} />
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          <Button type="button" variant="outline" onclick={playReference}>
            <Play aria-hidden="true" />
            Hear it
          </Button>
          <Button type="button" onclick={startAttempt}>
            {phase === "graded" ? "Try again" : "Play it back"}
          </Button>
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    </div>

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>How it works</Card.Description>
          <Card.Title class="text-base">Call &amp; response</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2 text-sm text-muted-foreground">
          <p>1. <strong class="text-foreground">Hear it</strong> — the line plays at {LICK_BPM} bpm.</p>
          <p>2. <strong class="text-foreground">Play it back</strong> on the keys or your MIDI instrument.</p>
          <p>3. It's graded note-by-note (octave-lenient) the moment you finish the phrase.</p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Last attempt</Card.Description>
          <Card.Title>{grade ? `${Math.round(grade.accuracy * 100)}%` : "—"}</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Notes matched</span>
            <span class="font-medium tabular-nums">{grade ? `${grade.matched} / ${grade.total}` : "—"}</span>
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
