<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    normalizeTwoHandDrillConfig,
    TechniqueSession,
    TWO_HAND_DRILL_TEMPOS,
    TWO_HAND_DRILL_TONICS,
    type TwoHandDrillConfig,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import {
    createTwoHandIndependenceExercise,
    type TwoHandIndependenceAnswer,
    type TwoHandIndependencePrompt,
  } from "@repo/music-core/exercises/two-hand-independence";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { suggestedFingerings } from "../../_components/piano-visual";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const initialConfig = normalizeTwoHandDrillConfig(
    browser ? new URLSearchParams(window.location.search) : {},
  );
  const keyOptions = TWO_HAND_DRILL_TONICS.map((value) => ({
    value,
    label: value.replace(/\d+$/, ""),
  }));
  const tempoOptions = TWO_HAND_DRILL_TEMPOS.map((value) => ({
    value: String(value),
    label: `${value} BPM`,
  }));

  let tonic = $state(initialConfig.tonic);
  let bpm = $state(String(initialConfig.bpm));
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing piano technique.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const activePrompt = $derived(
    sessionState?.currentPrompt && "leftMidiNotes" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as TwoHandIndependencePrompt)
      : undefined,
  );
  // A preview prompt so the keyboards render before the drill starts.
  const previewPrompt = $derived(
    createTwoHandIndependenceExercise({ tonic, bpm: Number(bpm), bars: 2 }).generate({
      targetSkillIds: [],
      difficulty: 0.4,
    }).payload,
  );
  const display = $derived(activePrompt ?? previewPrompt);
  const leftKeys = $derived([...new Set(display.leftNoteLabels)]);
  const rightKeys = $derived([...new Set(display.rightNoteLabels)]);
  const leftFingerings = $derived(suggestedFingerings(display.leftMidiNotes, "left"));
  const rightFingerings = $derived(suggestedFingerings(display.rightMidiNotes, "right"));
  const totalNotes = $derived(display.leftMidiNotes.length + display.rightMidiNotes.length);
  const playedNotes = $derived(Math.round((sessionState?.live?.progress ?? 0) * totalNotes));

  const summary = $derived(sessionState?.summary);
  const answer = $derived(
    summary?.results[0]?.result.answer as TwoHandIndependenceAnswer | undefined,
  );
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : (runtime.midi.state.error ?? "MIDI permission has not been requested."),
  );

  void initialize();

  $effect(() => {
    syncConfigUrl();
  });

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
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
        if (state.error) status = state.error;
        if (state.summary && !captured) {
          captured = true;
          const detail = state.summary.results[0]?.result.answer as
            | TwoHandIndependenceAnswer
            | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument: "piano",
            tags: ["technique", "two-hand", "piano"],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `Two-hand independence · LH ${Math.round(detail.leftAccuracy * 100)}% · RH ${Math.round(detail.rightAccuracy * 100)}%`
              : "Two-hand independence drill",
          });
        }
      });
      ready = true;
      status = "Hold the left-hand pulse while the right hand runs the line.";
    } catch (error) {
      status = message(error, "Piano technique could not be prepared.");
    }
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function start(config: TwoHandDrillConfig = normalizeTwoHandDrillConfig({ tonic, bpm })): Promise<void> {
    if (!ready || pending || !session) return;
    pending = true;
    captured = false;
    tonic = config.tonic;
    bpm = String(config.bpm);
    status = "";
    try {
      await session.startTwoHand({ tonic: config.tonic, bpm: config.bpm, bars: 2 });
      status = "Left hand on each beat, right hand twice as fast.";
    } catch (error) {
      status = message(error, "The two-hand drill could not be started.");
    } finally {
      pending = false;
    }
  }

  function slowDown(): void {
    const current = normalizeTwoHandDrillConfig({ tonic, bpm }).bpm;
    const nextBpm =
      [...TWO_HAND_DRILL_TEMPOS].reverse().find((tempo) => tempo < current) ??
      TWO_HAND_DRILL_TEMPOS[0];
    void start(normalizeTwoHandDrillConfig({ tonic, bpm: nextBpm }));
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeTwoHandDrillConfig({ tonic, bpm });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("tonic", config.tonic);
    params.set("bpm", String(config.bpm));
    window.history.replaceState({}, "", `${url.pathname}?${params.toString()}${url.hash}`);
  }

  function cancel(): void {
    session?.abandon();
    status = "Drill cancelled. You can start again.";
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
    }
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
  <title>Two-Hand Independence | Musicianship OS</title>
  <meta
    name="description"
    content="A graded piano drill: hold a steady left-hand pulse while the right hand plays a faster line."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Two-Hand Independence"
    subtitle="Keep the left hand steady on each beat while the right hand runs a faster scale line."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · piano" : "On-screen keys"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <Card.Root class="min-w-0">
      <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Card.Description>Hand independence</Card.Description>
          <Card.Title>Steady pulse vs. running line</Card.Title>
        </div>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </Card.Header>

      <Card.Content class="grid gap-6">
        <fieldset disabled={sessionState?.status === "active"} class="grid gap-4 disabled:opacity-70">
          <SegmentedControl ariaLabel="Key" options={keyOptions} bind:value={tonic} />
          <SegmentedControl ariaLabel="Tempo" options={tempoOptions} bind:value={bpm} />
        </fieldset>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile label="Notes" value={Math.min(totalNotes, playedNotes)} unit={`/${totalNotes}`} />
          <HudTile
            label="LH"
            value={Math.round((answer?.leftAccuracy ?? 0) * 100)}
            unit="%"
            tone="accent"
          />
          <HudTile
            label="RH"
            value={Math.round((answer?.rightAccuracy ?? 0) * 100)}
            unit="%"
            tone="good"
          />
          <HudTile label="Tempo" value={bpm} unit="BPM" />
        </div>

        {#if activePrompt}
          <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium">{activePrompt.label}</span>
              <span class="tabular-nums text-muted-foreground"
                >{Math.min(totalNotes, playedNotes)}/{totalNotes}</span
              >
            </div>
            <Progress value={Math.min(totalNotes, playedNotes)} max={totalNotes} />
            <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
          </div>
        {/if}

        {#if summary && answer}
          <SessionFeedback
            kind={summary.correct === summary.total ? "correct" : "wrong"}
            message="Drill complete"
            detail={`LH ${Math.round(answer.leftAccuracy * 100)}% · RH ${Math.round(answer.rightAccuracy * 100)}% · ${Math.round(answer.meanEvennessErrorMs)}ms evenness`}
            xp={summary.xp}
          />
          <AdaptiveRetryBar onRetry={() => void start()} onSlower={slowDown} retryLabel="Repeat drill" />
        {/if}
      </Card.Content>

      <Card.Footer class="flex-wrap gap-3">
        {#if sessionState?.status === "active"}
          <Button type="button" variant="outline" onclick={cancel}>Cancel drill</Button>
        {:else if !summary}
          <Button type="button" disabled={!ready || pending} onclick={() => void start()}>
            {pending ? "Starting..." : "Start drill"}
          </Button>
        {/if}
        <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
      </Card.Footer>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <Card.Title>Piano keys</Card.Title>
        <Card.Description>{midiStatus}</Card.Description>
      </Card.Header>
      <Card.Content class="grid min-w-0 gap-4">
        <div class="grid gap-2">
          <span class="text-xs font-medium text-muted-foreground">Left hand</span>
          <OnScreenKeyboard
            router={runtime.router}
            notes={leftKeys}
            suggestedFingerings={leftFingerings}
            onAccepted={playAccepted}
          />
        </div>
        <div class="grid gap-2">
          <span class="text-xs font-medium text-muted-foreground">Right hand</span>
          <OnScreenKeyboard
            router={runtime.router}
            notes={rightKeys}
            suggestedFingerings={rightFingerings}
            onAccepted={playAccepted}
          />
        </div>
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
