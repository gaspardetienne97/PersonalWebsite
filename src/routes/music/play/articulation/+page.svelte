<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { noteToMidi } from "@repo/music-core/engines/theory";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import {
    type AerophoneArticulationAnswer,
    type AerophoneArticulationPrompt,
    type ArticulationStyle,
  } from "@repo/music-core/exercises/aerophone-articulation";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AerophoneFingering from "../../_components/AerophoneFingering.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const styleOptions = [
    { value: "staccato", label: "Staccato" },
    { value: "legato", label: "Legato" },
  ];
  const noteOptions = ["G4", "C4", "F4"].map((value) => ({ value, label: value }));
  const tempoOptions = [70, 90, 110].map((value) => ({ value: String(value), label: `${value} BPM` }));

  let style = $state<ArticulationStyle>("staccato");
  let noteName = $state("G4");
  let bpm = $state("90");
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing articulation drill.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const targetMidi = $derived(noteToMidi(noteName));
  const prompt = $derived(
    sessionState?.currentPrompt && "style" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as AerophoneArticulationPrompt)
      : undefined,
  );
  const total = $derived(prompt?.count ?? 8);
  const completedNotes = $derived(
    Math.min(total, Math.round((sessionState?.live?.progress ?? 0) * total)),
  );
  const summary = $derived(sessionState?.summary);
  const answer = $derived(
    summary?.results[0]?.result.answer as AerophoneArticulationAnswer | undefined,
  );
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : (runtime.midi.state.error ?? "MIDI permission has not been requested."),
  );

  void initialize();

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
            | AerophoneArticulationAnswer
            | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument: "aerophone",
            tags: ["technique", "articulation", "aerophone"],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `Aerophone ${style} · ${noteName} · ${Math.round(detail.articulationScore * 100)}% articulation`
              : "Aerophone articulation drill",
          });
        }
      });
      ready = true;
      status = "Tongue the note in the target style — short for staccato, connected for legato.";
    } catch (error) {
      status = message(error, "Articulation drill could not be prepared.");
    }
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    pending = true;
    captured = false;
    status = "";
    try {
      await session.startArticulation({ targetMidi, style, count: 8, bpm: Number(bpm) });
      status = `Play ${noteName} ${style}, eight times.`;
    } catch (error) {
      status = message(error, "The articulation drill could not be started.");
    } finally {
      pending = false;
    }
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
  <title>Aerophone Articulation | Musicianship OS</title>
  <meta
    name="description"
    content="A graded Aerophone drill: tongue a repeated note staccato or legato, scored on articulation from note length and breath."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Aerophone Articulation"
    subtitle="Tongue a repeated note in a target style — staccato (short, detached) or legato (connected)."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · aerophone" : "On-screen keys"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <Card.Root class="min-w-0">
      <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Card.Description>Tonguing &amp; breath</Card.Description>
          <Card.Title>Staccato vs. legato</Card.Title>
        </div>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </Card.Header>

      <Card.Content class="grid gap-6">
        <fieldset disabled={sessionState?.status === "active"} class="grid gap-4 disabled:opacity-70">
          <SegmentedControl
            ariaLabel="Articulation"
            options={styleOptions}
            value={style}
            onChange={(value) => (style = value as ArticulationStyle)}
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <SegmentedControl ariaLabel="Note" options={noteOptions} bind:value={noteName} />
            <SegmentedControl ariaLabel="Tempo" options={tempoOptions} bind:value={bpm} />
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HudTile label="Notes" value={completedNotes} unit={`/${total}`} />
          <HudTile
            label="Articulation"
            value={Math.round((answer?.articulationScore ?? 0) * 100)}
            unit="%"
            tone="good"
          />
          <HudTile label="Style" value={style === "staccato" ? "Staccato" : "Legato"} tone="accent" />
        </div>

        <p class="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          Articulation grading reads note length and breath (CC2), so a wind controller
          (Aerophone) scores it fully. On-screen taps complete the pitch dimension only.
        </p>

        {#if prompt}
          <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium">{prompt.label}</span>
              <span class="tabular-nums text-muted-foreground">{completedNotes}/{total}</span>
            </div>
            <Progress value={completedNotes} max={total} />
            <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
          </div>
        {/if}

        {#if summary && answer}
          <SessionFeedback
            kind={summary.correct === summary.total ? "correct" : "wrong"}
            message="Articulation check"
            detail={`${Math.round(answer.articulationScore * 100)}% ${style} · ${Math.round(answer.pitchAccuracy * 100)}% on ${noteName}`}
            xp={summary.xp}
          />
        {/if}
      </Card.Content>

      <Card.Footer class="flex-wrap gap-3">
        {#if sessionState?.status === "active"}
          <Button type="button" variant="outline" onclick={cancel}>Cancel drill</Button>
        {:else}
          <Button type="button" disabled={!ready || pending} onclick={start}>
            {pending ? "Starting..." : summary ? "Repeat drill" : "Start drill"}
          </Button>
        {/if}
        <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
      </Card.Footer>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <Card.Title>Fingering — {noteName}</Card.Title>
        <Card.Description>{midiStatus}</Card.Description>
      </Card.Header>
      <Card.Content class="grid min-w-0 justify-items-center gap-4">
        <AerophoneFingering midi={targetMidi} size={180} />
        <OnScreenKeyboard router={runtime.router} notes={[noteName]} onAccepted={playAccepted} />
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
