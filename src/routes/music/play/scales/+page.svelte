<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { tempoLadderProjection } from "@repo/music-core/engines/projection";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your technique history.");
  let tempo = $state(100);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let captured = false;

  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const activePrompt = $derived(sessionState?.currentPrompt);
  const summary = $derived(sessionState?.summary);
  const currentTempo = $derived(sessionState?.nextTargetBpm ?? tempo);
  const ladderState = $derived(sessionState ?? session?.state);
  const tempoLadder = $derived(
    ladderState ? tempoLadderProjection(ladderState, { startBpm: 100, stepBpm: 10, rungs: 6 }) : [],
  );

  void initialize();

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      session = new TechniqueSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe((state) => {
        sessionState = state;
        status = state.error ?? "";
        tempo = state.nextTargetBpm;
        // Auto-capture the finished scale run into the journal (once).
        if (state.summary && !captured) {
          captured = true;
          void runtime.recordPractice({
            source: "drill",
            instrument: runtime.activeInstrument,
            tags: ["scales"],
            scoringEvents: state.summary.results.map((result) => result.event),
            xpEarned: state.summary.xp,
            note: `Scales · ${Math.round(state.summary.noteAccuracy * 100)}% notes clean`,
          });
        }
      });
      ready = true;
      status = "Ready for scale practice.";
    } catch (error) {
      status = message(error, "Technique history could not be loaded.");
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

  async function startScale(): Promise<void> {
    if (!ready || pending || !session) return;
    pending = true;
    status = "";

    try {
      captured = false;
      await session.startScale({
        tonic: "C4",
        scale: "major",
        bpm: tempo,
      });
      status = "Play the notes evenly from C4 to C5.";
    } catch (error) {
      status = message(error, "The scale session could not be started.");
    } finally {
      pending = false;
    }
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type !== "noteOn") return;
    if (runtime.audioEnabled) runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
  }

  function repeat(): void {
    sessionState = session?.state;
    status = "Ready for scale practice.";
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
  <title>Scales & Technique | Musicianship OS</title>
  <meta
    name="description"
    content="Practice scale technique with MIDI or on-screen input, evenness feedback, and tempo unlocks."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Scales & Technique"
    subtitle="Clean at tempo unlocks the next. Note accuracy and evenness, scored per rep."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · Guitar" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  {#if summary}
    <Card.Root>
      <Card.Header>
        <Card.Description>Scale complete</Card.Description>
        <Card.Title>
          {Math.round(summary.noteAccuracy * 100)}% notes · {summary.xp} XP
        </Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-2 text-sm text-muted-foreground">
        <p>Evenness error: {Math.round(summary.meanEvennessErrorMs)}ms average.</p>
        <p>Next target: {summary.nextTargetBpm} BPM</p>
        <p>{summary.results[0]?.result.feedback[0]?.message}</p>
      </Card.Content>
      <Card.Footer>
        <Button type="button" onclick={repeat}>Practice next tempo</Button>
      </Card.Footer>
    </Card.Root>
  {:else}
    <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card.Root>
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-1">
            <Card.Description>Scale practice</Card.Description>
            <Card.Title>C major technique</Card.Title>
          </div>
          <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
            {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
          </Button>
        </Card.Header>
        <Card.Content class="grid gap-6">
          <p class="text-sm text-muted-foreground" aria-live="polite">{midiStatus}</p>

          <div class="grid max-w-xs gap-2">
            <Label for="scale-tempo">Tempo</Label>
            <Input
              id="scale-tempo"
              aria-label="Tempo"
              type="number"
              min="60"
              max={sessionState?.highestUnlockedBpm ?? 100}
              step="10"
              bind:value={tempo}
              disabled={sessionState?.status === "active"}
            />
            <p class="text-xs text-muted-foreground">
              Current unlocked target: {currentTempo} BPM
            </p>
          </div>

          {#if sessionState?.status === "active" && activePrompt}
            <div class="grid gap-4 rounded-md border p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">{activePrompt.label}</p>
                  <p class="text-xs text-muted-foreground">{activePrompt.bpm} BPM</p>
                </div>
                <p class="text-sm text-muted-foreground">{liveProgress}%</p>
              </div>
              <Progress value={liveProgress} max={100} />
              <OnScreenKeyboard
                router={runtime.router}
                notes={activePrompt.noteLabels}
                onAccepted={playAccepted}
              />
            </div>
          {/if}
        </Card.Content>
        <Card.Footer class="flex-wrap gap-3">
          <Button
            type="button"
            disabled={!ready || pending || sessionState?.status === "active"}
            onclick={startScale}
          >
            {pending ? "Starting..." : "Start Scale"}
          </Button>
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>

      <aside class="grid content-start gap-4">
        <Card.Root>
          <Card.Header>
            <Card.Description>Tempo ladder</Card.Description>
            <Card.Title>{currentTempo} BPM target</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-2">
            {#each tempoLadder as rung}
              <div
                class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm
                  {rung.status === 'target'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : rung.status === 'unlocked'
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'text-muted-foreground'}"
              >
                <span class="font-semibold tabular-nums">{rung.bpm} BPM</span>
                <span class="text-xs uppercase tracking-wide">
                  {rung.status === "target" ? "Next" : rung.status === "unlocked" ? "Unlocked" : "Locked"}
                </span>
              </div>
            {/each}
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
</PracticeScreen>
