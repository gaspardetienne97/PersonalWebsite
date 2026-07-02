<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import {
    createChordFollower,
    expectedChordsFromProgression,
    type ChordFollowerRun,
    type ChordFollowerState,
    type ChordObservation,
  } from "@repo/music-core/engines/chord-follower";
  import { toPitchClasses } from "@repo/music-core/engines/chord-id";
  import {
    ChordAudioSource,
    chromaToPitchClasses,
    type ChordAnalysis,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import {
    JAM_PROGRESSIONS,
    normalizeChordProgressionDrillConfig,
    targetTones,
    type TargetTone,
  } from "@repo/music-core/engines/jam";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";

  import HudTile from "../../_components/HudTile.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import ProgressionChartStage from "../../_components/ProgressionChartStage.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface ChordSourceLike {
    readonly state: AudioPitchState;
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribeState(listener: (state: AudioPitchState) => void): () => void;
    subscribeAnalysis(listener: (analysis: ChordAnalysis) => void): () => void;
  }

  const {
    audioSource = new ChordAudioSource(),
    analyzeOnsetWindow = defaultAnalyzeOnsetWindow,
    runtime = useMusicRuntime(),
  }: {
    audioSource?: ChordSourceLike;
    /** Run Basic Pitch on a buffered onset window and return detected MIDI notes. Injectable for tests. */
    analyzeOnsetWindow?: (window: Float32Array) => Promise<number[]>;
    runtime?: MusicRuntime;
  } = $props();

  // ponytail: reuse the transcribe route's raw-PCM Basic Pitch adapter — the
  // chord follower only needs MIDI notes from a buffered onset window, never a
  // live frame loop.
  async function defaultAnalyzeOnsetWindow(window: Float32Array): Promise<number[]> {
    const { extractBasicPitchNotesFromSamples } = await import(
      "../../transcribe/basic-pitch-extractor"
    );
    const notes = await extractBasicPitchNotesFromSamples(window);
    return notes.map((note) => note.midiNote);
  }

  const progressionOptions = JAM_PROGRESSIONS.map((entry) => ({
    value: entry.id,
    label: entry.name,
  }));
  const initialConfig = normalizeChordProgressionDrillConfig(
    browser ? new URLSearchParams(window.location.search) : {},
  );

  let progressionId = $state(initialConfig.progressionId);
  let bpm = $state(initialConfig.bpm);
  let followerState = $state<ChordFollowerState | undefined>();
  let detected = $state<number[]>([]);
  let running = $state(false);
  let status = $state("Pick a progression, then start strumming on the beat.");
  let follower: ChordFollowerRun | undefined;
  let unsubscribeAnalysis: (() => void) | undefined;
  let unsubscribeAudioState: (() => void) | undefined;
  let audioState = $state<AudioPitchState>({ status: "idle" });
  let captured = false;

  const progression = $derived(
    JAM_PROGRESSIONS.find((entry) => entry.id === progressionId) ?? JAM_PROGRESSIONS[0]!,
  );
  const expected = $derived(expectedChordsFromProgression(progression));
  const currentIndex = $derived(followerState?.currentIndex ?? 0);
  const currentChord = $derived(progression.chords[currentIndex] ?? progression.chords[0]!);
  const chartTones = $derived<TargetTone[]>(targetTones(currentChord.symbol, currentChord.scale));
  const detectedLabels = $derived(detected.map(pitchClassLabel).join(", ") || "None yet");
  const normalizedConfig = $derived(normalizeChordProgressionDrillConfig({ progression: progressionId, bpm }));

  $effect(() => {
    syncConfigUrl();
  });

  function selectProgression(value: string): void {
    progressionId = normalizeChordProgressionDrillConfig({ progression: value, bpm }).progressionId;
  }

  function chordGrade(index: number) {
    return followerState?.grades[index];
  }

  function chordBadge(index: number): string {
    const grade = chordGrade(index);
    if (!grade) return "pending";
    if (!grade.matched) return "missed";
    return grade.timingBand === "in-time" ? "matched in-time" : "matched off-time";
  }

  function badgeTone(index: number): "default" | "good" | "accent" {
    const badge = chordBadge(index);
    if (badge === "matched in-time") return "good";
    if (badge === "matched off-time") return "accent";
    return "default";
  }

  async function start(): Promise<void> {
    if (running) return;
    running = true;
    captured = false;
    status = "Listening — strum each chord on the beat.";
    try {
      const config = normalizedConfig;
      const startAtMs = await runtime.runCountIn();
      follower = createChordFollower(expected, { bpm: config.bpm, startAtMs });
      followerState = follower.state();
      unsubscribeAnalysis = audioSource.subscribeAnalysis(onAnalysis);
      await audioSource.start();
    } catch (error) {
      running = false;
      status = message(error, "The chord-progression drill could not be started.");
    }
  }

  async function stop(): Promise<void> {
    await finish();
  }

  let onsetQueue: Promise<void> = Promise.resolve();

  async function onAnalysis(analysis: ChordAnalysis): Promise<void> {
    if (!follower) return;
    // Chroma is a weak observation: the follower honors source/confidence, so it
    // uses chroma for the detected readout only — it grades/times/advances from
    // onsets, so feeding chroma here can't false-advance with no strum.
    if (!analysis.onsetWindow) {
      const observation: ChordObservation = {
        pitchClasses: chromaToPitchClasses(analysis.chroma),
        confidence: 0.4,
        source: "chroma",
        atMs: analysis.timestamp,
      };
      followerState = follower.accept(observation);
      detected = followerState.detectedPitchClasses;
      return;
    }
    onsetQueue = onsetQueue.then(() => gradeOnset(analysis));
    await onsetQueue;
  }

  async function gradeOnset(analysis: ChordAnalysis): Promise<void> {
    if (!follower || !analysis.onsetWindow) return;
    const midi = await analyzeOnsetWindow(analysis.onsetWindow);
    const pitchClasses = toPitchClasses(midi);
    detected = pitchClasses;
    const observation: ChordObservation = {
      pitchClasses,
      confidence: 0.9,
      source: "onset",
      atMs: analysis.timestamp,
    };
    followerState = follower.accept(observation);
    if (followerState.done) await finish();
  }

  async function finish(): Promise<void> {
    if (!follower || captured) return;
    captured = true;
    running = false;
    const summary = follower.finish();
    unsubscribeAnalysis?.();
    unsubscribeAnalysis = undefined;
    await audioSource.stop();
    status = `Progression complete — ${summary.correct}/${summary.total} chords matched.`;
    void runtime.recordPractice({
      source: "drill",
      instrument: "guitar",
      tags: ["technique", "chord-changes"],
      scoringEvents: [],
      xpEarned: Math.round(summary.score * 20),
      note: `Chord progression · ${summary.correct}/${summary.total} chords`,
    });
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function pitchClassLabel(pitchClass: number): string {
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][pitchClass] ?? "?";
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("progression", config.progressionId);
    params.set("bpm", String(config.bpm));
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params.toString()}${window.location.hash}`,
    );
  }

  onMount(() => {
    audioState = audioSource.state;
    unsubscribeAudioState = audioSource.subscribeState((next) => {
      audioState = next;
    });
  });

  onDestroy(() => {
    unsubscribeAnalysis?.();
    unsubscribeAudioState?.();
    void audioSource.stop();
  });
</script>

<svelte:head>
  <title>Chord Progression | Musicianship OS</title>
  <meta
    name="description"
    content="Strum a known chord progression in time — chroma + onset-confirmed Basic Pitch grade each chord change for correctness and timing."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Chord Progression"
    subtitle="Strum a known progression on the beat — the chord follower grades each change for correctness and timing."
  />

  <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="min-w-0 space-y-4">
      <ProgressionChartStage progression={progression} currentIndex={currentIndex} tones={chartTones} />

      <Card.Root class="min-w-0">
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Card.Description>Known progression</Card.Description>
            <Card.Title>{progression.name}</Card.Title>
            <Card.Description>{progression.key} · {progression.style}</Card.Description>
          </div>
        </Card.Header>

        <Card.Content class="grid gap-6">
          <fieldset disabled={running} class="grid gap-4 disabled:opacity-70">
            <SegmentedControl
              ariaLabel="Progression"
              options={progressionOptions}
              value={progressionId}
              onChange={selectProgression}
            />
            <div class="grid gap-2">
              <Label for="tempo">Tempo</Label>
              <input
                id="tempo"
                type="number"
                min="40"
                max="220"
                bind:value={bpm}
                class="h-9 w-32 rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </fieldset>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <HudTile label="Chord" value={currentIndex} unit={`/${expected.length}`} />
            <HudTile
              label="Matched"
              value={followerState?.grades.filter((grade) => grade.matched).length ?? 0}
              unit={`/${expected.length}`}
              tone="good"
            />
            <HudTile label="Tempo" value={bpm} unit="bpm" tone="accent" />
          </div>

          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
          {#if audioState.status === "denied" || audioState.status === "error"}
            <p class="text-destructive">{audioState.message}</p>
          {/if}
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          {#if running}
            <Button type="button" variant="outline" onclick={() => void stop()}>Stop</Button>
          {:else}
            <Button type="button" onclick={() => void start()}>Start</Button>
          {/if}
        </Card.Footer>
      </Card.Root>
    </div>

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Progression grades</Card.Description>
          <Card.Title class="text-base">Chord-by-chord grading</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-2 text-sm">
          {#each expected as chord, i (i)}
            <div class="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <span class="font-semibold">{chord.symbol}</span>
              <HudTile label="Grade" value={chordBadge(i)} tone={badgeTone(i)} class="px-2 py-1" />
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Live detection</Card.Description>
          <Card.Title class="text-base">Detected tones</Card.Title>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground">
          {detectedLabels}
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
