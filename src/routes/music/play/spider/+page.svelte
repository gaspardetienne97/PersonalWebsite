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
  import {
    curatedTunings,
    type StringInstrumentId,
    type TuningProfile,
  } from "@repo/music-core/engines/tunings";
  import type {
    StringSpiderAnswer,
    StringSpiderPrompt,
  } from "@repo/music-core/exercises/string-spider";
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
  const tempoOptions = [60, 80, 100, 120].map((value) => ({
    value: String(value),
    label: `${value} BPM`,
  }));
  const defaultInstrument: StringInstrumentId =
    runtime.activeInstrument === "ukulele" ? "ukulele" : "guitar";

  let instrument = $state<StringInstrumentId>(defaultInstrument);
  let tuningId = $state(curatedTunings(defaultInstrument)[0]!.id);
  let stringNumber = $state(defaultInstrument === "guitar" ? 6 : 4);
  let startFret = $state(5);
  let bpm = $state("80");
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing string technique.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const tunings = $derived(curatedTunings(instrument));
  const tuning = $derived(
    tunings.find((profile) => profile.id === tuningId) ?? tunings[0]!,
  );
  const prompt = $derived(
    sessionState?.currentPrompt && "startFret" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as StringSpiderPrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const result = $derived(summary?.results[0]);
  const answer = $derived(result?.result.answer as StringSpiderAnswer | undefined);
  const completedNotes = $derived(
    Math.min(4, Math.round((sessionState?.live?.progress ?? 0) * 4)),
  );
  const nextMidi = $derived(prompt?.midiNotes[completedNotes]);
  const targetMidi = $derived(prompt?.midiNotes ?? []);
  const correctMidi = $derived(prompt?.midiNotes.slice(0, completedNotes) ?? []);
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : runtime.midi.state.error ?? "MIDI permission has not been requested.",
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
          const completed = state.summary.results[0];
          const detail = completed?.result.answer as StringSpiderAnswer | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument,
            tags: ["technique", "spider", instrument],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `${instrument === "guitar" ? "Guitar" : "Ukulele"} spider · ${Math.round(detail.pitchAccuracy * 100)}% notes · ${Math.round(detail.meanTimingErrorMs)}ms timing`
              : "String spider drill",
          });
        }
      });
      ready = true;
      status = "Ready for a 1-2-3-4 chromatic pattern.";
    } catch (error) {
      status = message(error, "String technique could not be prepared.");
    }
  }

  function selectInstrument(value: string): void {
    instrument = value as StringInstrumentId;
    const profiles = curatedTunings(instrument);
    tuningId = profiles[0]!.id;
    stringNumber = instrument === "guitar" ? 6 : 4;
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
      await session.startSpider({
        tuning,
        stringNumber,
        startFret,
        bpm: Number(bpm),
      });
      status = `Play frets ${startFret}-${startFret + 3} on string ${stringNumber}.`;
    } catch (error) {
      status = message(error, "The spider drill could not be started.");
    } finally {
      pending = false;
    }
  }

  function cancel(): void {
    session?.abandon();
    status = "Spider cancelled. You can start again.";
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
  <title>Spider Drill | Musicianship OS</title>
  <meta
    name="description"
    content="Practice a graded 1-2-3-4 chromatic spider pattern on guitar or ukulele."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Spider Drill"
    subtitle="Build fretting-hand independence with a clean 1-2-3-4 chromatic pattern."
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
          <Card.Description>Chromatic fretting</Card.Description>
          <Card.Title>1-2-3-4 on one string</Card.Title>
        </div>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </Card.Header>

      <Card.Content class="grid gap-6">
        <fieldset
          disabled={sessionState?.status === "active"}
          class="grid gap-4 disabled:opacity-70"
        >
          <SegmentedControl
            ariaLabel="Instrument"
            options={instrumentOptions}
            value={instrument}
            onChange={selectInstrument}
          />

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="grid gap-2">
              <Label for="spider-tuning">Tuning</Label>
              <select
                id="spider-tuning"
                aria-label="Tuning"
                bind:value={tuningId}
                class="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {#each tunings as profile (profile.id)}
                  <option value={profile.id}>{profile.name}</option>
                {/each}
              </select>
            </div>
            <div class="grid gap-2">
              <Label for="spider-string">String</Label>
              <select
                id="spider-string"
                aria-label="String"
                bind:value={stringNumber}
                class="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {#each tuning.openStrings as _, index}
                  <option value={index + 1}>String {index + 1}</option>
                {/each}
              </select>
            </div>
            <div class="grid gap-2">
              <Label for="spider-fret">Starting fret</Label>
              <select
                id="spider-fret"
                aria-label="Starting fret"
                bind:value={startFret}
                class="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {#each Array.from({ length: Math.min(10, tuning.fretCount - 2) }, (_, fret) => fret) as fret}
                  <option value={fret}>Fret {fret}</option>
                {/each}
              </select>
            </div>
          </div>

          <SegmentedControl ariaLabel="Tempo" options={tempoOptions} bind:value={bpm} />
        </fieldset>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile label="Next fret" value={nextMidi === undefined ? "—" : startFret + completedNotes} tone="accent" />
          <HudTile label="Notes" value={completedNotes} unit="/4" />
          <HudTile label="Quality" value={Math.round((sessionState?.live?.runningScore ?? 0) * 100)} unit="%" tone="good" />
          <HudTile label="Tempo" value={bpm} unit="BPM" />
        </div>

        {#if prompt}
          <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium">{prompt.label}</span>
              <span class="tabular-nums text-muted-foreground">{completedNotes}/4</span>
            </div>
            <Progress value={completedNotes} max={4} />
            <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
          </div>
        {/if}

        {#if summary && answer}
          <SessionFeedback
            kind={summary.correct === summary.total ? "correct" : "wrong"}
            message="Spider complete"
            detail={`${Math.round(answer.pitchAccuracy * 100)}% notes · ${Math.round(answer.meanTimingErrorMs)}ms mean timing error`}
            xp={summary.xp}
          />
        {/if}
      </Card.Content>

      <Card.Footer class="flex-wrap gap-3">
        {#if sessionState?.status === "active"}
          <Button type="button" variant="outline" onclick={cancel}>Cancel spider</Button>
        {:else}
          <Button type="button" disabled={!ready || pending} onclick={start}>
            {pending ? "Starting..." : summary ? "Repeat spider" : "Start spider"}
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
          visibleFrets={12}
          visibleStrings={[stringNumber]}
          onAccepted={playAccepted}
        />
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
