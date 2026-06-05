<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import {
    RhythmSession,
    type RhythmSessionState,
  } from "@repo/music-core/engines/rhythm-session";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your rhythm history.");
  let bpm = $state(100);
  let beats = $state(4);
  let tapTempoMarks = $state<number[]>([]);
  let session = $state<RhythmSession | undefined>();
  let sessionState = $state<RhythmSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());

  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const summary = $derived(sessionState?.summary);

  void initialize();

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      ready = true;
      status = "Ready for a pulse session.";
    } catch (error) {
      status = message(error, "Rhythm history could not be loaded.");
    }
  }

  function midiMessage(): string {
    if (runtime.midi.state.enabled) {
      return `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`;
    }
    return runtime.midi.state.error ?? "MIDI permission has not been requested.";
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function startPulse(): Promise<void> {
    if (!ready || pending) return;
    pending = true;
    status = "";

    try {
      session?.dispose();
      unsubscribeSession?.();
      session = new RhythmSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe((state) => {
        sessionState = state;
        status = state.error ?? "";
      });

      const delayMs = runtime.audioEnabled
        ? runtime.sound.playCountIn({ bpm, beats: 4, beatsPerMeasure: 4 }).delayMs
        : 1_000;
      await session.start({
        bpm,
        beats,
        startTimestampMs: performance.now() + delayMs,
      });
      status =
        delayMs > 0
          ? `Count in, then tap ${beats} quarter notes.`
          : `Tap ${beats} quarter notes.`;
    } catch (error) {
      status = message(error, "The rhythm session could not be started.");
    } finally {
      pending = false;
    }
  }

  function tapBeat(): void {
    const event = runtime.router.noteOn(60, "onscreen", "piano");
    if (runtime.audioEnabled) runtime.sound.playNote(event.midiNote, 0.08, undefined, 0.5);
  }

  function tapTempo(): void {
    const now = performance.now();
    const marks = [...tapTempoMarks.filter((mark) => now - mark <= 3_000), now].slice(-5);
    tapTempoMarks = marks;
    if (marks.length < 2) {
      status = "Tap tempo again to estimate BPM.";
      return;
    }

    const intervals = marks.slice(1).map((mark, index) => mark - marks[index]!);
    const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    bpm = Math.min(220, Math.max(40, Math.round(60_000 / average)));
    status = `Tap tempo set to ${bpm} BPM.`;
  }

  function repeat(): void {
    sessionState = undefined;
    status = "Ready for a pulse session.";
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Rhythm Trainer | Musicianship OS</title>
  <meta
    name="description"
    content="Practice quarter-note pulse with MIDI, on-screen, and metronome-anchored timing feedback."
  />
</svelte:head>

<main class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-8">
  <header class="space-y-2">
    <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Learn</p>
    <h1 class="text-4xl font-bold tracking-tight">Rhythm Trainer</h1>
    <p class="max-w-2xl text-muted-foreground">
      Tap quarter-note pulse against a metronome anchor and review whether you played ahead,
      behind, or centered.
    </p>
  </header>

  {#if summary}
    <Card.Root>
      <Card.Header>
        <Card.Description>Pulse complete</Card.Description>
        <Card.Title>{Math.round(summary.accuracy * 100)}% accuracy · {summary.xp} XP</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-2 text-sm text-muted-foreground">
        <p>
          Average timing error:
          {Math.round(summary.meanSignedErrorMs)}ms signed,
          {Math.round(summary.meanAbsoluteErrorMs)}ms absolute.
        </p>
        <p>{summary.results[0]?.result.feedback[0]?.message}</p>
      </Card.Content>
      <Card.Footer>
        <Button type="button" onclick={repeat}>Try again</Button>
      </Card.Footer>
    </Card.Root>
  {:else}
    <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card.Root>
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-1">
            <Card.Description>Pulse practice</Card.Description>
            <Card.Title>Quarter-note timing</Card.Title>
          </div>
          <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
            {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
          </Button>
        </Card.Header>
        <Card.Content class="grid gap-6">
          <p class="text-sm text-muted-foreground" aria-live="polite">{midiStatus}</p>

          <div class="grid gap-5 sm:grid-cols-3">
            <div class="grid gap-2">
              <Label for="rhythm-bpm">BPM</Label>
              <Input
                id="rhythm-bpm"
                aria-label="BPM"
                type="number"
                min="40"
                max="220"
                step="1"
                bind:value={bpm}
              />
            </div>
            <div class="grid gap-2">
              <Label for="rhythm-beats">Beats</Label>
              <Input
                id="rhythm-beats"
                aria-label="Beats"
                type="number"
                min="2"
                max="16"
                step="1"
                bind:value={beats}
              />
            </div>
            <div class="grid content-end gap-2">
              <Button type="button" variant="outline" onclick={tapTempo}>Tap tempo</Button>
            </div>
          </div>

          {#if sessionState?.status === "active"}
            <div class="grid gap-4 rounded-md border p-4">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">Progress</p>
                <p class="text-sm text-muted-foreground">{liveProgress}%</p>
              </div>
              <Progress value={liveProgress} max={100} />
              <Button type="button" size="lg" data-testid="tap-beat" onclick={tapBeat}>
                Tap beat
              </Button>
            </div>
          {/if}
        </Card.Content>
        <Card.Footer class="flex-wrap gap-3">
          <Button
            type="button"
            disabled={!ready || pending || sessionState?.status === "active"}
            onclick={startPulse}
          >
            {pending ? "Starting..." : "Start Pulse"}
          </Button>
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>

      <aside class="grid content-start gap-4">
        <Card.Root>
          <Card.Header>
            <Card.Description>Current target</Card.Description>
            <Card.Title>{bpm} BPM</Card.Title>
          </Card.Header>
          <Card.Content class="text-sm text-muted-foreground">
            {beats} quarter-note taps
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Streak</Card.Description>
            <Card.Title>{progress.state.streakDays} days</Card.Title>
          </Card.Header>
        </Card.Root>
      </aside>
    </section>
  {/if}
</main>
