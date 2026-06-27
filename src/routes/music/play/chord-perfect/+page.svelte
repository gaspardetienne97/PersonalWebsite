<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    AudioPitchSource,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import {
    identifyChord,
    toPitchClasses,
    type ChordCandidate,
  } from "@repo/music-core/engines/chord-id";
  import {
    verifyChordTarget,
    type ChordVerificationResult,
  } from "@repo/music-core/engines/chord-verification";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { curatedTunings, type StringInstrumentId } from "@repo/music-core/engines/tunings";
  import {
    chordShapeMidiNotes,
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

  interface ChordVerifierAudioSource {
    readonly state: AudioPitchState;
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribeState(listener: (state: AudioPitchState) => void): () => void;
    subscribeEvents(listener: (event: NoteEvent) => void): () => void;
  }

  const {
    audioSource = new AudioPitchSource(),
    audioSupported = AudioPitchSource.supported,
    analyzeStrum = defaultAnalyzeStrum,
  }: {
    audioSource?: ChordVerifierAudioSource;
    audioSupported?: boolean;
    /** Record a strum and return the detected MIDI notes. Injectable for tests. */
    analyzeStrum?: () => Promise<number[]>;
  } = $props();

  // ponytail: reuse the transcribe route's Basic Pitch adapter — one shared
  // polyphonic extractor, loaded only when a strum is actually analyzed.
  async function defaultAnalyzeStrum(): Promise<number[]> {
    const { recordMicClip } = await import("@repo/music-core/engines/audio-in");
    const blob = await recordMicClip({ durationMs: 1300 });
    const { extractBasicPitchNotes } = await import("../../transcribe/basic-pitch-extractor");
    const file = new File([blob], "strum.webm", { type: blob.type || "audio/webm" });
    const notes = await extractBasicPitchNotes(file);
    return notes.map((note) => note.midiNote);
  }

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
  let verifierActive = $state(false);
  let micVerifierActive = $state(false);
  let audioState = $state<AudioPitchState>({ status: "idle" });
  let verifiedMidiNotes = $state<number[]>([]);
  let unsubscribeSession: (() => void) | undefined;
  let unsubscribeAudioState: (() => void) | undefined;
  let unsubscribeAudioEvents: (() => void) | undefined;

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
  const shapeMidi = $derived(chordShapeMidiNotes(tuning, shape));
  const targetMidi = $derived(prompt?.shapeMidiNotes ?? shapeMidi);
  const correctMidi = $derived(prompt?.midiNotes.slice(0, completedNotes) ?? []);
  const verification = $derived(
    verifyChordTarget({ expectedMidiNotes: shapeMidi, observedMidiNotes: verifiedMidiNotes }),
  );
  const verificationStatus = $derived(
    verification.correct
      ? "Target complete"
      : verifierActive || micVerifierActive
        ? "Listening for chord tones"
        : "Start the verifier, then pick or play the chord tones.",
  );
  const missingToneLabels = $derived(
    verification.missingPitchClasses.map(pitchClassLabel).join(", ") || "None",
  );
  const observedToneLabels = $derived(
    verification.observedPitchClasses.map(pitchClassLabel).join(", ") || "None yet",
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
  const unsubscribeVerifierInput = runtime.router.subscribe((event) => {
    if (!verifierActive || event.type !== "noteOn") return;
    verifiedMidiNotes = [...verifiedMidiNotes, event.midiNote].slice(-24);
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
    clearVerifier();
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

  function startVerifier(): void {
    verifierActive = true;
    verifiedMidiNotes = [];
  }

  async function startMicVerifier(): Promise<void> {
    verifierActive = true;
    micVerifierActive = true;
    verifiedMidiNotes = [];
    await audioSource.start();
  }

  function stopVerifier(): void {
    verifierActive = false;
    if (micVerifierActive) void stopMicVerifier();
  }

  async function stopMicVerifier(): Promise<void> {
    micVerifierActive = false;
    await audioSource.stop();
  }

  function clearVerifier(): void {
    verifiedMidiNotes = [];
  }

  let strumBusy = $state(false);
  let strumStatus = $state("");
  let strumPitchClasses = $state<number[]>([]);
  let strumCandidates = $state<ChordCandidate[]>([]);
  let strumVerification = $state<ChordVerificationResult | undefined>();

  // Buffered polyphonic identification: record one strum, analyze the whole
  // clip, then both name the chord and verify it against the selected shape.
  async function strumAndIdentify(): Promise<void> {
    if (strumBusy) return;
    strumBusy = true;
    strumStatus = "Listening — strum the chord once.";
    strumCandidates = [];
    strumVerification = undefined;
    try {
      const midiNotes = await analyzeStrum();
      strumPitchClasses = toPitchClasses(midiNotes);
      strumCandidates = identifyChord(strumPitchClasses);
      strumVerification = verifyChordTarget({
        expectedMidiNotes: shapeMidi,
        observedMidiNotes: midiNotes,
      });
      strumStatus = strumPitchClasses.length
        ? "Heard it."
        : "No clear pitches — try again closer to the mic.";
    } catch (error) {
      strumStatus = message(error, "Could not analyze the strum.");
    } finally {
      strumBusy = false;
    }
  }

  const strumDetectedLabels = $derived(
    strumPitchClasses.map(pitchClassLabel).join(", ") || "None yet",
  );

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
    }
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function pitchClassLabel(pitchClass: number): string {
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][pitchClass] ?? "?";
  }

  onMount(() => {
    runtime.setActiveInstrument(instrument);
    audioState = audioSource.state;
    unsubscribeAudioState = audioSource.subscribeState((next) => {
      audioState = next;
      if (next.status !== "running" && next.status !== "requesting") micVerifierActive = false;
    });
    unsubscribeAudioEvents = audioSource.subscribeEvents((event) => {
      if (!micVerifierActive || event.type !== "noteOn") return;
      runtime.router.push(event);
    });
  });

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
    unsubscribeVerifierInput();
    unsubscribeAudioState?.();
    unsubscribeAudioEvents?.();
    void audioSource.stop();
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

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Expected-target verifier</Card.Description>
          <Card.Title class="text-base">{verificationStatus}</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <HudTile label="Coverage" value={Math.round(verification.coverage * 100)} unit="%" />
            <HudTile label="Score" value={Math.round(verification.score * 100)} unit="%" />
          </div>
          <p class="text-muted-foreground">Observed: {observedToneLabels}</p>
          <p class="text-muted-foreground">Missing: {missingToneLabels}</p>
          {#if audioState.status === "denied" || audioState.status === "error"}
            <p class="text-destructive">{audioState.message}</p>
          {/if}
        </Card.Content>
        <Card.Footer class="flex-wrap gap-2">
          {#if verifierActive}
            <Button type="button" variant="outline" onclick={stopVerifier}>Stop verifier</Button>
          {:else}
            <Button type="button" disabled={!ready} onclick={startVerifier}>Start verifier</Button>
          {/if}
          {#if micVerifierActive}
            <Button type="button" variant="outline" onclick={() => void stopMicVerifier()}>
              Stop mic verifier
            </Button>
          {:else}
            <Button
              type="button"
              variant="secondary"
              disabled={!ready || !audioSupported || audioState.status === "requesting"}
              onclick={() => void startMicVerifier()}
            >
              {audioState.status === "requesting" ? "Starting mic..." : "Start mic verifier"}
            </Button>
          {/if}
          <Button type="button" variant="ghost" onclick={clearVerifier}>Reset</Button>
        </Card.Footer>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Strum &amp; identify</Card.Description>
          <Card.Title class="text-base">
            {strumCandidates[0] ? strumCandidates[0].symbol : "What did you just play?"}
          </Card.Title>
          <Card.Description>
            Record one strum — Basic Pitch hears the whole chord, names it, and checks it against
            {shape.name}.
          </Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3 text-sm">
          {#if strumCandidates.length}
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="text-2xl font-semibold">{strumCandidates[0]!.symbol}</span>
              <span class="text-muted-foreground">
                {Math.round(strumCandidates[0]!.confidence * 100)}% match
              </span>
            </div>
            {#if strumCandidates.length > 1}
              <p class="text-xs text-muted-foreground">
                Other readings:
                {strumCandidates
                  .slice(1, 3)
                  .map((candidate) => `${candidate.symbol} (${Math.round(candidate.confidence * 100)}%)`)
                  .join(", ")}
              </p>
            {/if}
          {/if}
          <p class="text-muted-foreground">Detected tones: {strumDetectedLabels}</p>
          {#if strumVerification}
            <p class="text-muted-foreground">
              vs {shape.name}: {strumVerification.correct
                ? "matches the target"
                : `${Math.round(strumVerification.coverage * 100)}% of the target`}
            </p>
          {/if}
          {#if strumStatus}
            <p class="text-muted-foreground" aria-live="polite">{strumStatus}</p>
          {/if}
          {#if audioState.status === "denied" || audioState.status === "error"}
            <p class="text-destructive">{audioState.message}</p>
          {/if}
        </Card.Content>
        <Card.Footer>
          <Button
            type="button"
            disabled={!audioSupported || strumBusy}
            onclick={() => void strumAndIdentify()}
          >
            {strumBusy ? "Listening..." : "Strum & identify"}
          </Button>
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
    </aside>
  </section>
</PracticeScreen>
