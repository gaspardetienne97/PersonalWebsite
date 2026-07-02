<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import { monotonicMs, type NoteEvent, type ScoringEvent } from "@repo/music-core/domain";
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
  import { runExerciseThroughPipeline } from "@repo/music-core/engines/exercise";
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
    createOpenChordIdentificationExercise,
    normalizeChordPerfectDrillConfig,
    type ChordPerfectAnswer,
    type ChordPerfectMode,
    type ChordPerfectPrompt,
    type OpenChordIdentificationAnswer,
  } from "@repo/music-core/exercises/chord-perfect";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import FretboardInput from "../../learn/reading/_components/FretboardInput.svelte";
  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
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

  interface ToneMapItem {
    pitchClass: number;
    label: string;
    status: "matched" | "missing" | "extra";
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
  const modeOptions = [
    { value: "build", label: "Build shape" },
    { value: "pick", label: "Pick strings cleanly" },
    { value: "strum", label: "Strum and identify" },
  ];
  const defaultInstrument: StringInstrumentId =
    runtime.activeInstrument === "ukulele" ? "ukulele" : "guitar";
  const initialConfig = normalizeChordPerfectDrillConfig(
    browser ? new URLSearchParams(window.location.search) : {},
    defaultInstrument,
  );

  let instrument = $state<StringInstrumentId>(initialConfig.instrument);
  let mode = $state<ChordPerfectMode>(initialConfig.mode);
  let shapeId = $state(initialConfig.shapeId);
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
  const shapeGuide = $derived(
    shape.frets
      .map((fret, index) => ({
        key: `${shape.id}-${index}`,
        stringNumber: index + 1,
        fret,
        finger: shape.fingers[index] ?? null,
      }))
      .reverse(),
  );
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
  const verifierToneMap = $derived(toneMap(verification));
  const verifierFeedbackDetail = $derived(feedbackDetail(verification));
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

  $effect(() => {
    syncConfigUrl();
  });

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
    const config = normalizeChordPerfectDrillConfig({ mode, instrument: value });
    instrument = config.instrument;
    shapeId = config.shapeId;
    clearVerifier();
    runtime.setActiveInstrument(instrument);
  }

  function selectMode(value: string): void {
    mode = normalizeChordPerfectDrillConfig({ mode: value, instrument, shape: shapeId }).mode;
    if (mode !== "pick") stopVerifier();
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

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeChordPerfectDrillConfig({ mode, instrument, shape: shapeId });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("mode", config.mode);
    params.set("instrument", config.instrument);
    params.set("tuning", config.tuningId);
    params.set("shape", config.shapeId);
    window.history.replaceState({}, "", `${url.pathname}?${params.toString()}${url.hash}`);
  }

  let strumBusy = $state(false);
  let strumStatus = $state("");
  let strumPitchClasses = $state<number[]>([]);
  let strumCandidates = $state<ChordCandidate[]>([]);
  let strumVerification = $state<ChordVerificationResult | undefined>();
  let strumScore = $state<
    | {
        correct: boolean;
        score: number;
        xp: number;
        event: ScoringEvent;
        answer: OpenChordIdentificationAnswer;
        feedback: string;
      }
    | undefined
  >();

  // Buffered polyphonic identification: record one strum, analyze the whole
  // clip, then both name the chord and verify it against the selected shape.
  async function strumAndIdentify(): Promise<void> {
    if (strumBusy) return;
    strumBusy = true;
    strumStatus = "Listening — strum the chord once.";
    strumCandidates = [];
    strumVerification = undefined;
    strumScore = undefined;
    try {
      const midiNotes = await analyzeStrum();
      strumPitchClasses = toPitchClasses(midiNotes);
      strumCandidates = identifyChord(strumPitchClasses);
      strumVerification = verifyChordTarget({
        expectedMidiNotes: shapeMidi,
        observedMidiNotes: midiNotes,
      });
      if (ready) {
        const exercise = createOpenChordIdentificationExercise({ tuning, shape });
        const outcome = await runExerciseThroughPipeline({
          exercise,
          input: midiNotes.map((midiNote, index) => ({
            type: "noteOn" as const,
            midiNote,
            velocity: 1,
            source: "audio" as const,
            instrument,
            timestamp: monotonicMs(index * 10),
            clock: "performance" as const,
          })),
          services: { skills, analytics, progress },
          sessionId: `open-chord-id-${Date.now()}`,
          runId: `open-chord-id-${shape.id}-${Date.now()}`,
          context: {
            targetSkillIds: exercise.skillIds,
            difficulty: 0.45,
            instrument,
          },
        });
        const answer = outcome.result.answer as OpenChordIdentificationAnswer;
        strumScore = {
          correct: outcome.result.correct,
          score: outcome.result.score,
          xp: outcome.xp,
          event: outcome.event,
          answer,
          feedback: outcome.result.feedback[0]?.message ?? "",
        };
        void runtime.recordPractice({
          source: "drill",
          instrument,
          tags: ["technique", "open-chord-id", "chord-perfect", instrument],
          scoringEvents: [outcome.event],
          xpEarned: outcome.xp,
          note: `${instrument === "guitar" ? "Guitar" : "Ukulele"} open chord ID · ${shape.name} · ${answer.detectedSymbol ?? "unclear"}`,
        });
      }
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
  const strumToneMap = $derived(strumVerification ? toneMap(strumVerification) : []);
  const modeCopy = $derived(
    mode === "build"
      ? {
          description: "Clean chord changes",
          title: "Build shape",
          detail: "Sound each voiced string from low to high.",
        }
      : mode === "pick"
        ? {
            description: "Expected-target verifier",
            title: verificationStatus,
            detail: "Pick strings or play into the mic until every chord tone is covered.",
          }
        : {
            description: "Strum and identify",
            title: strumCandidates[0] ? strumCandidates[0].symbol : "What did you just play?",
            detail: `Record one strum, identify the chord, then check it against ${shape.name}.`,
          },
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

  function toneMap(result: ChordVerificationResult): ToneMapItem[] {
    const expected = result.expectedPitchClasses.map((pitchClass) => ({
      pitchClass,
      label: pitchClassLabel(pitchClass),
      status: result.matchedPitchClasses.includes(pitchClass) ? "matched" : "missing",
    }));
    const extra = result.extraPitchClasses.map((pitchClass) => ({
      pitchClass,
      label: pitchClassLabel(pitchClass),
      status: "extra" as const,
    }));
    return [...expected, ...extra];
  }

  function feedbackDetail(result: ChordVerificationResult): string {
    const covered = result.matchedPitchClasses.length;
    const total = result.expectedPitchClasses.length;
    const missing = result.missingPitchClasses.map(pitchClassLabel);
    const extra = result.extraPitchClasses.map(pitchClassLabel);
    const parts = [`${covered}/${total} tones covered`, `${Math.round(result.score * 100)}% score`];
    if (missing.length) parts.push(`Missing: ${missing.join(", ")}`);
    if (extra.length) parts.push(`Extra: ${extra.join(", ")}`);
    return parts.join(" · ");
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
          <Card.Description>{modeCopy.description}</Card.Description>
          <Card.Title>{modeCopy.title}</Card.Title>
          <Card.Description>{modeCopy.detail}</Card.Description>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="Chord-perfect workflow"
            options={modeOptions}
            value={mode}
            onChange={selectMode}
          />
          <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
            {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
          </Button>
        </div>
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

        <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
          <div>
            <p class="text-sm font-medium">Suggested fingering</p>
            <p class="text-xs text-muted-foreground">Low string to high string</p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each shapeGuide as string (string.key)}
              <div class="rounded-md border bg-background px-3 py-2 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span class="font-medium">String {string.stringNumber}</span>
                  {#if string.fret === null}
                    <span class="text-muted-foreground">Muted</span>
                  {:else if string.fret === 0}
                    <span class="text-muted-foreground">Open</span>
                  {:else}
                    <span>Fret {string.fret}</span>
                  {/if}
                </div>
                {#if string.finger !== null}
                  <p class="text-xs text-muted-foreground">Finger {string.finger}</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        {#if mode === "build"}
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
            <AdaptiveRetryBar onRetry={() => void start()} retryLabel="Repeat chord" />
          {/if}
        {:else if mode === "pick"}
          <div class="grid gap-4 rounded-lg border bg-muted/30 p-4">
            {#if verifierActive || verifiedMidiNotes.length > 0}
              <SessionFeedback
                kind={verification.correct ? "correct" : "wrong"}
                message="Target chord tones"
                detail={verifierFeedbackDetail}
              />
            {/if}
            <div class="grid gap-2 text-sm">
              <p class="font-medium">Tone map</p>
              <div class="flex flex-wrap gap-2">
                {#each verifierToneMap as tone (`${tone.pitchClass}-${tone.status}`)}
                  <span
                    class="rounded-full border px-2.5 py-1 text-xs font-medium {tone.status ===
                    'matched'
                      ? 'border-success/30 bg-success/10 text-success'
                      : tone.status === 'extra'
                        ? 'border-warn/30 bg-warn/10 text-warn'
                        : 'border-muted-foreground/25 bg-background text-muted-foreground'}"
                  >
                    {tone.label} {tone.status}
                  </span>
                {/each}
              </div>
              <p class="text-muted-foreground">Observed: {observedToneLabels}</p>
              <p class="text-muted-foreground">Missing: {missingToneLabels}</p>
            </div>
            {#if audioState.status === "denied" || audioState.status === "error"}
              <p class="text-destructive">{audioState.message}</p>
            {/if}
          </div>
        {:else}
          <div class="grid gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
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
                    .map(
                      (candidate) =>
                        `${candidate.symbol} (${Math.round(candidate.confidence * 100)}%)`,
                    )
                    .join(", ")}
                </p>
              {/if}
            {/if}
            <p class="text-muted-foreground">Detected tones: {strumDetectedLabels}</p>
            {#if strumVerification}
              <div class="grid gap-2">
                <p class="font-medium">Tone map</p>
                <div class="flex flex-wrap gap-2">
                  {#each strumToneMap as tone (`${tone.pitchClass}-${tone.status}`)}
                    <span
                      class="rounded-full border px-2.5 py-1 text-xs font-medium {tone.status ===
                      'matched'
                        ? 'border-success/30 bg-success/10 text-success'
                        : tone.status === 'extra'
                          ? 'border-warn/30 bg-warn/10 text-warn'
                          : 'border-muted-foreground/25 bg-background text-muted-foreground'}"
                    >
                      {tone.label} {tone.status}
                    </span>
                  {/each}
                </div>
              </div>
              <p class="text-muted-foreground">
                vs {shape.name}: {strumVerification.correct
                  ? "matches the target"
                  : `${Math.round(strumVerification.coverage * 100)}% of the target`}
              </p>
            {/if}
            {#if strumScore}
              <SessionFeedback
                kind={strumScore.correct ? "correct" : "wrong"}
                message="Open chord ID scored"
                detail={`${strumScore.feedback} · ${Math.round(strumScore.score * 100)}% credit`}
                xp={strumScore.xp}
              />
            {/if}
            {#if strumStatus}
              <p class="text-muted-foreground" aria-live="polite">{strumStatus}</p>
            {/if}
            {#if audioState.status === "denied" || audioState.status === "error"}
              <p class="text-destructive">{audioState.message}</p>
            {/if}
          </div>
        {/if}
      </Card.Content>

      <Card.Footer class="flex-wrap gap-3">
        {#if mode === "build"}
          {#if sessionState?.status === "active"}
            <Button type="button" variant="outline" onclick={cancel}>Cancel drill</Button>
          {:else if !summary}
            <Button type="button" disabled={!ready || pending} onclick={() => void start()}>
              {pending ? "Starting..." : "Start drill"}
            </Button>
          {/if}
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        {:else if mode === "pick"}
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
        {:else}
          <Button
            type="button"
            disabled={!ready || !audioSupported || strumBusy}
            onclick={() => void strumAndIdentify()}
          >
            {strumBusy ? "Listening..." : "Strum & identify"}
          </Button>
        {/if}
      </Card.Footer>
    </Card.Root>

    <aside class="grid content-start gap-4">
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
