<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { curatedTunings, type StringInstrumentId } from "@repo/music-core/engines/tunings";
  import {
    chordShapesFor,
    type ChordPerfectAnswer,
    type ChordPerfectPrompt,
  } from "@repo/music-core/exercises/chord-perfect";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import FretboardInput from "../../learn/reading/_components/FretboardInput.svelte";
  import HudTile from "../../_components/HudTile.svelte";
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
  const instrumentOptions = [
    { value: "guitar", label: "Guitar" },
    { value: "ukulele", label: "Ukulele" },
  ];
  const defaultInstrument: StringInstrumentId =
    runtime.activeInstrument === "ukulele" ? "ukulele" : "guitar";

  let instrument = $state<StringInstrumentId>(defaultInstrument);
  let shapeId = $state(chordShapesFor(defaultInstrument)[0]!.id);
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing chord technique.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const shapes = $derived(chordShapesFor(instrument));
  const shape = $derived(shapes.find((entry) => entry.id === shapeId) ?? shapes[0]!);
  const tuning = $derived(
    curatedTunings(instrument).find((entry) => entry.id === shape.tuningId) ??
      curatedTunings(instrument)[0]!,
  );
  const prompt = $derived(
    sessionState?.currentPrompt && "shapeId" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as ChordPerfectPrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const answer = $derived(
    summary?.results[0]?.result.answer as ChordPerfectAnswer | undefined,
  );
  const total = $derived(prompt?.midiNotes.length ?? 0);
  const completedNotes = $derived(
    Math.min(total, Math.round((sessionState?.live?.progress ?? 0) * total)),
  );
  const nextMidi = $derived(prompt?.midiNotes[completedNotes]);
  const targetMidi = $derived(prompt?.shapeMidiNotes ?? []);
  const correctMidi = $derived(prompt?.midiNotes.slice(0, completedNotes) ?? []);
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
          const detail = state.summary.results[0]?.result.answer as ChordPerfectAnswer | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument,
            tags: ["technique", "chord-perfect", instrument],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `${instrument === "guitar" ? "Guitar" : "Ukulele"} chord-perfect · ${shape.name} · ${Math.round(detail.pitchAccuracy * 100)}% clean`
              : "Chord-perfect drill",
          });
        }
      });
      ready = true;
      status = "Fret the shape, then sound each string from low to high.";
    } catch (error) {
      status = message(error, "Chord technique could not be prepared.");
    }
  }

  function selectInstrument(value: string): void {
    instrument = value as StringInstrumentId;
    shapeId = chordShapesFor(instrument)[0]!.id;
    runtime.setActiveInstrument(instrument);
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
      await session.startChordPerfect({ tuning, shape });
      status = `Sound each string of ${shape.name}, low to high.`;
    } catch (error) {
      status = message(error, "The chord-perfect drill could not be started.");
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

  onMount(() => {
    runtime.setActiveInstrument(instrument);
  });

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Chord-Perfect | Musicianship OS</title>
  <meta
    name="description"
    content="Practice clean chord changes: fret a shape and sound each string from low to high, graded note by note."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Chord-Perfect"
    subtitle="Fret a chord shape, then sound each string from low to high — every voiced string graded for a clean ring."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? `MIDI · ${instrument}` : "On-screen fretboard"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <Card.Root class="min-w-0">
      <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Card.Description>Clean chord changes</Card.Description>
          <Card.Title>One string at a time</Card.Title>
        </div>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </Card.Header>

      <Card.Content class="grid gap-6">
        <fieldset disabled={sessionState?.status === "active"} class="grid gap-4 disabled:opacity-70">
          <SegmentedControl
            ariaLabel="Instrument"
            options={instrumentOptions}
            value={instrument}
            onChange={selectInstrument}
          />
          <div class="grid gap-2">
            <Label for="chord-shape">Chord</Label>
            <select
              id="chord-shape"
              aria-label="Chord"
              bind:value={shapeId}
              class="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {#each shapes as entry (entry.id)}
                <option value={entry.id}>{entry.name}</option>
              {/each}
            </select>
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HudTile label="Strings" value={completedNotes} unit={`/${total || "—"}`} />
          <HudTile
            label="Clean"
            value={Math.round((sessionState?.live?.runningScore ?? 0) * 100)}
            unit="%"
            tone="good"
          />
          <HudTile label="Chord" value={shape.name} tone="accent" />
        </div>

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
            message="Chord-perfect check"
            detail={`${Math.round(answer.pitchAccuracy * 100)}% of strings rang clean`}
            xp={summary.xp}
          />
        {/if}
      </Card.Content>

      <Card.Footer class="flex-wrap gap-3">
        {#if sessionState?.status === "active"}
          <Button type="button" variant="outline" onclick={cancel}>Cancel drill</Button>
        {:else}
          <Button type="button" disabled={!ready || pending} onclick={start}>
            {pending ? "Starting..." : summary ? "Repeat chord" : "Start drill"}
          </Button>
        {/if}
        <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
      </Card.Footer>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <Card.Title>{instrument === "guitar" ? "Guitar" : "Ukulele"} fretboard</Card.Title>
        <Card.Description>{midiStatus}</Card.Description>
      </Card.Header>
      <Card.Content class="min-w-0 overflow-hidden">
        <FretboardInput
          {tuning}
          router={runtime.router}
          targetMidiNotes={targetMidi}
          activeMidiNotes={nextMidi === undefined ? [] : [nextMidi]}
          correctMidiNotes={correctMidi}
          visibleFrets={5}
          onAccepted={playAccepted}
        />
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
