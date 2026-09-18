<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick } from "svelte";

  import { monotonicMs, type NoteEvent, type ScoringEvent, unixMs } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    AudioPitchSource,
    prepareMicClip,
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
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { inputSourceLabel } from "@repo/music-core/engines/device-profiles";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import {
    commitPreparedExerciseOutcome,
    prepareExerciseThroughPipeline,
  } from "@repo/music-core/engines/exercise";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { curatedTunings, type StringInstrumentId } from "@repo/music-core/engines/tunings";
  import {
    CHORD_CHANGE_REPETITION_OPTIONS,
    chordShapeMidiNotes,
    chordShapesFor,
    createOpenChordIdentificationExercise,
    normalizeChordPerfectDrillConfig,
    type ChordPerfectAnswer,
    type ChordPerfectMode,
    type ChordPerfectPrompt,
    type OpenChordIdentificationAnswer,
  } from "@repo/music-core/exercises/chord-perfect";
  import type {
    ChordChangeAnswer,
    ChordChangePrompt,
  } from "@repo/music-core/exercises/chord-change";
  import { chordChangeHistory } from "@repo/music-core/exercises/chord-change";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import FretboardInput from "../../learn/reading/_components/FretboardInput.svelte";
  import PositionStepper from "../../_components/PositionStepper.svelte";
  import MidiStatus from "../../_components/MidiStatus.svelte";
  import { fretWindowAround } from "@repo/music-core/engines/projection";
  import { chordPositionAt, chordPositionsFor, type ChordPosition } from "@repo/music-core/exercises/chord-positions";
  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface ChordVerifierAudioSource {
    readonly state: AudioPitchState;
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribeState(listener: (state: AudioPitchState) => void): () => void;
    subscribeEvents(listener: (event: NoteEvent) => void): () => void;
  }

  interface PreparedStrumCapture {
    record(): Promise<number[]>;
    dispose(): void;
  }

  interface ToneMapItem {
    pitchClass: number;
    label: string;
    status: "matched" | "missing" | "extra";
  }

  const {
    audioSource = new AudioPitchSource(),
    audioSupported = AudioPitchSource.supported,
    analyzeStrum,
    prepareStrum: prepareStrumProp,
    changeDurationSeconds = 60,
    runtime: runtimeProp,
    store: storeProp,
    loadHistory,
  }: {
    audioSource?: ChordVerifierAudioSource;
    audioSupported?: boolean;
    /** Record a strum and return the detected MIDI notes. Injectable for tests. */
    analyzeStrum?: () => Promise<number[]>;
    /** Prepare capture now, then record only after the shared downbeat. */
    prepareStrum?: () => Promise<PreparedStrumCapture>;
    /** One-minute-changes clock length. Injectable for tests. */
    changeDurationSeconds?: number;
    runtime?: MusicRuntime;
    store?: PracticeStore;
    loadHistory?: () => Promise<ScoringEvent[]>;
  } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();
  // svelte-ignore state_referenced_locally -- injected capture ownership is fixed for a route mount
  const prepareStrum =
    prepareStrumProp ??
    (analyzeStrum
      ? async () => ({ record: analyzeStrum, dispose: () => undefined })
      : defaultPrepareStrum);

  // ponytail: reuse the transcribe route's Basic Pitch adapter — one shared
  // polyphonic extractor, loaded only when a strum is actually analyzed.
  async function defaultPrepareStrum(): Promise<PreparedStrumCapture> {
    const prepared = await prepareMicClip();
    return {
      async record() {
        const blob = await prepared.record({ durationMs: 1300 });
        const { extractBasicPitchNotes } = await import("../../transcribe/basic-pitch-extractor");
        const file = new File([blob], "strum.webm", { type: blob.type || "audio/webm" });
        const notes = await extractBasicPitchNotes(file);
        return notes.map((note) => note.midiNote);
      },
      dispose: () => prepared.dispose(),
    };
  }

  // svelte-ignore state_referenced_locally -- storage ownership is fixed for a route mount
  const store = storeProp ?? (browser ? new PracticeStore() : undefined);
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
    { value: "changes", label: "Change trainer" },
  ];
  const defaultInstrument: StringInstrumentId =
    runtime.activeInstrument === "ukulele" ? "ukulele" : "guitar";
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeChordPerfectDrillConfig(initialSearch, defaultInstrument);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;

  let instrument = $state<StringInstrumentId>(initialConfig.instrument);
  runtime.setActiveInstrument(initialConfig.instrument);
  let mode = $state<ChordPerfectMode>(initialConfig.mode);
  let shapeId = $state(initialConfig.shapeId);
  let toShapeId = $state(initialConfig.toShapeId);
  let position = $state(initialConfig.position);
  let toPosition = $state(initialConfig.toPosition);
  let repetitions = $state(initialConfig.repetitions);
  let timed = $state(initialConfig.timed);
  /** Beats between chord targets; 0 leaves the change trainer off the clock. */
  let clockBeats = $state(
    [2, 4].includes(Number(initialSearch.get("clock"))) ? Number(initialSearch.get("clock")) : 0,
  );
  let bpm = $state(80);
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let ready = $state(false);
  let pending = $state(false);
  let destroyed = false;
  let verifierPending = false;
  let routeGeneration = 0;
  let startRequest = 0;
  let practiceContextReady: Promise<void> = Promise.resolve();
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
  let historyEvents = $state<ScoringEvent[]>([]);
  let historyLoaded = $state(false);
  let historyFailed = $state(false);

  const shapes = $derived(chordShapesFor(instrument));
  const shape = $derived(shapes.find((entry) => entry.id === shapeId) ?? shapes[0]!);
  const transitionShapes = $derived(shapes.filter((entry) => entry.id !== shape.id));
  const toShape = $derived(
    transitionShapes.find((entry) => entry.id === toShapeId) ??
      transitionShapes.find((entry) => shape.commonTransitions.includes(entry.id)) ??
      transitionShapes[0] ??
      shape,
  );
  const tuning = $derived(
    curatedTunings(instrument).find((entry) => entry.id === shape.tuningId) ??
      curatedTunings(instrument)[0]!,
  );
  // One chord position at a time: the curated shape plus the engine's barre and
  // closed voicings up the neck. Positions are ChordShapes, so the session,
  // fingering guide and fretboard all read the active one.
  const positions = $derived(chordPositionsFor(shape, tuning));
  const activePosition = $derived(chordPositionAt(shape, tuning, position));
  const toPositions = $derived(chordPositionsFor(toShape, tuning));
  const activeToPosition = $derived(chordPositionAt(toShape, tuning, toPosition));
  const shapeGuide = $derived(
    activePosition.frets
      .map((fret, index) => ({
        key: `${activePosition.id}-${index}`,
        stringNumber: index + 1,
        fret,
        finger: activePosition.fingers[index] ?? null,
      }))
      .reverse(),
  );
  const positionDetail = (entry: ChordPosition) =>
    `${entry.positionLabel} · frets ${entry.fretWindow.start} to ${entry.fretWindow.end}`;
  // The board shows the frets of the position(s) in play plus one of context.
  const fretWindow = $derived(
    fretWindowAround(
      [
        ...activePosition.frets,
        ...(mode === "changes" ? activeToPosition.frets : []),
      ].filter((fret): fret is number => fret !== null),
      tuning.fretCount,
    ),
  );
  // Finger numbers on the target dots (open strings keep the note name).
  const dotLabels = $derived.by(() => {
    const labels: Record<number, string> = {};
    const add = (entry: ChordPosition) =>
      entry.frets.forEach((fret, index) => {
        const finger = entry.fingers[index];
        if (fret !== null && fret > 0 && finger !== null && finger !== undefined) {
          labels[tuning.openStrings[index]! + fret] ??= String(finger);
        }
      });
    if (mode === "changes") add(activeToPosition);
    add(activePosition);
    return labels;
  });
  const prompt = $derived(
    sessionState?.currentPrompt &&
      "shapeId" in sessionState.currentPrompt &&
      "midiNotes" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as ChordPerfectPrompt)
      : undefined,
  );
  const changePrompt = $derived(
    sessionState?.currentPrompt && "targets" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as ChordChangePrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const buildResultPrompt = $derived(summary?.results[0]?.prompt as ChordPerfectPrompt | undefined);
  const answer = $derived(
    summary?.results[0]?.result.answer as ChordPerfectAnswer | undefined,
  );
  const changeAnswer = $derived(
    summary?.results[0]?.result.answer as ChordChangeAnswer | undefined,
  );
  // Set true while setup or start preflight owns the view. A successful current
  // activation clears it after the old summary can no longer resurface.
  let resultsDismissed = $state(false);
  // The shell phase, computed from route state. Only the graded build/changes
  // drills have a summary; pick (verifier) and strum (identify) stay in setup.
  const phase = $derived<"setup" | "stage" | "summary">(
    summary && (mode === "build" || mode === "changes") && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active" || verifierActive
        ? "stage"
        : "setup",
  );
  const liveAnnouncement = $derived(
    phase === "summary"
      ? mode === "build"
        ? `Chord-perfect results ready. ${Math.round((answer?.pitchAccuracy ?? 0) * 100)}% target notes matched.`
        : `Chord-change results ready. ${changeAnswer?.cleanChanges ?? 0} clean changes.`
      : status,
  );
  // Route keeps focus authority across every keyed phase swap.
  let setupHeading = $state<HTMLElement | null>(null);
  let stageHeading = $state<HTMLHeadingElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let previousPhase: "setup" | "stage" | "summary" | undefined;
  const shapeMidi = $derived(chordShapeMidiNotes(tuning, activePosition));
  const transitionMidi = $derived([
    ...new Set([...shapeMidi, ...chordShapeMidiNotes(tuning, activeToPosition)]),
  ]);
  const pairHistory = $derived(
    chordChangeHistory(historyEvents, {
      instrument,
      tuningId: tuning.id,
      durationSeconds: changeDurationSeconds,
      fromShapeId: activePosition.id,
      fromMidiNotes: chordShapeMidiNotes(tuning, activePosition),
      toShapeId: activeToPosition.id,
      toMidiNotes: chordShapeMidiNotes(tuning, activeToPosition),
    }),
  );
  const changeMidiNotes = $derived(
    changePrompt?.targets.flatMap((target) => target.midiNotes) ?? [],
  );
  const total = $derived(prompt?.midiNotes.length ?? changeMidiNotes.length);
  const completedNotes = $derived(
    Math.min(total, Math.round((sessionState?.live?.progress ?? 0) * total)),
  );
  const nextMidi = $derived((prompt?.midiNotes ?? changeMidiNotes)[completedNotes]);
  const targetMidi = $derived(
    changePrompt
      ? changeMidiNotes
      : mode === "changes"
        ? transitionMidi
        : (prompt?.shapeMidiNotes ?? shapeMidi),
  );
  const correctMidi = $derived((prompt?.midiNotes ?? changeMidiNotes).slice(0, completedNotes));
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
  const variantKey = $derived(
    `v1:chord-perfect:${instrument}:${mode}${mode === "changes" && !timed && clockBeats > 0 ? `:clock${clockBeats}` : ""}`,
  );
  const instrumentLabel = $derived(instrument === "guitar" ? "Guitar" : "Ukulele");
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  void initialize();
  void initializeHistory();

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    const key = variantKey;
    routeGeneration += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "chord-perfect",
        variantKey: key,
        defaultBpm: 80,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: ["guitar", "ukulele"],
        onBpmChange: (next) => (bpm = next),
        onInstrumentChange: selectInstrument,
      })
      .then((nextCleanup) => {
        cleanup = nextCleanup;
        if (disposed) cleanup();
      });
    return () => {
      disposed = true;
      routeGeneration += 1;
      releasePreparedStrum();
      cleanup();
    };
  });

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
  });
  const unsubscribeVerifierInput = runtime.router.subscribe((event) => {
    if (!verifierActive || event.type !== "noteOn") return;
    verifiedMidiNotes = [...verifiedMidiNotes, event.midiNote].slice(-24);
  });

  $effect(() => {
    if (!verifierActive || !verification.correct) return;
    runtime.endPerformance();
    verifierActive = false;
    if (micVerifierActive) void stopMicVerifier();
  });

  $effect(() => {
    const current = phase;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") stageHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupHeading?.focus({ preventScroll: false });
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      if (destroyed) return;
      const nextSession = new TechniqueSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      if (destroyed) {
        nextSession.dispose();
        return;
      }
      session = nextSession;
      unsubscribeSession = nextSession.subscribe((state) => {
        sessionState = state;
        if (state.error) status = state.error;
        if (state.summary) {
          clearChangeTimer();
          runtime.endPerformance();
        }
        if (state.summary && !captured) {
          captured = true;
          historyEvents = [
            ...historyEvents,
            ...state.summary.results.map(({ event }) => event),
          ];
          const detail = state.summary.results[0]?.result.answer as
            | ChordPerfectAnswer
            | ChordChangeAnswer
            | undefined;
          const isChanges = detail !== undefined && "cleanChanges" in detail;
          void runtime.recordPractice({
            source: "drill",
            instrument,
            comparison: { variantKey, bpm, settings: JSON.stringify({ shapeId, toShapeId, position, toPosition, repetitions, timed, clockBeats }), dimensions: "instrument, mode, chord shapes, positions and repetitions" },
            tags: ["technique", isChanges ? "chord-changes" : "chord-perfect", instrument],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? isChanges
                ? `${instrument === "guitar" ? "Guitar" : "Ukulele"} chord changes · ${shape.name} to ${toShape.name} · ${
                    detail.changesPerMinute === undefined
                      ? `${detail.cleanChanges}/${detail.completedChanges} clean`
                      : `${detail.changesPerMinute} clean/min`
                  }`
                : `${instrument === "guitar" ? "Guitar" : "Ukulele"} chord-perfect · ${shape.name} · ${Math.round(detail.pitchAccuracy * 100)}% clean`
              : "Chord-perfect drill",
          });
        }
      });
      ready = true;
      status = "Ready. Press Start, or Space.";
    } catch (error) {
      status = message(error, "Chord technique could not be prepared.");
    }
  }

  async function initializeHistory(): Promise<void> {
    try {
      const loaded = await (loadHistory?.() ?? store?.scoringEvents.all() ?? Promise.resolve([]));
      if (destroyed) return;
      historyEvents = [...loaded, ...historyEvents];
      historyLoaded = true;
    } catch {
      if (destroyed) return;
      historyFailed = true;
      historyLoaded = true;
    }
  }

  function selectInstrument(value: string): void {
    routeGeneration += 1;
    releasePreparedStrum();
    const config = normalizeChordPerfectDrillConfig({ mode, instrument: value });
    instrument = config.instrument;
    shapeId = config.shapeId;
    toShapeId = config.toShapeId;
    position = 0;
    toPosition = 0;
    clearVerifier();
  }

  function selectMode(value: string): void {
    routeGeneration += 1;
    releasePreparedStrum();
    const config = normalizeChordPerfectDrillConfig({
      mode: value,
      instrument,
      shape: shapeId,
      to: toShapeId,
    });
    mode = config.mode;
    toShapeId = config.toShapeId;
    if (mode !== "pick") stopVerifier();
  }

  function selectShape(value: string): void {
    routeGeneration += 1;
    releasePreparedStrum();
    const config = normalizeChordPerfectDrillConfig({ mode, instrument, shape: value });
    shapeId = config.shapeId;
    toShapeId = config.toShapeId;
    position = 0;
    toPosition = 0;
    clearVerifier();
  }

  function selectPosition(index: number): void {
    routeGeneration += 1;
    releasePreparedStrum();
    position = Math.max(0, Math.min(positions.length - 1, index));
    clearVerifier();
  }

  function selectToPosition(index: number): void {
    routeGeneration += 1;
    releasePreparedStrum();
    toPosition = Math.max(0, Math.min(toPositions.length - 1, index));
  }

  function selectToShape(value: string): void {
    routeGeneration += 1;
    releasePreparedStrum();
    const config = normalizeChordPerfectDrillConfig({ mode, instrument, shape: shapeId, to: value });
    toShapeId = config.toShapeId;
    toPosition = 0;
  }

  function selectRepetitions(value: string): void {
    routeGeneration += 1;
    releasePreparedStrum();
    repetitions = normalizeChordPerfectDrillConfig({ reps: value }).repetitions;
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    const request = ++startRequest;
    pending = true;
    captured = false;
    resultsDismissed = true;
    status = "Starting chord-perfect drill.";
    try {
      await tick();
      const generation = routeGeneration;
      await practiceContextReady;
      if (request !== startRequest || generation !== routeGeneration) return;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (request === startRequest && generation === routeGeneration) {
          status = runtime.audioMessage;
        }
        return;
      }
      if (request !== startRequest || generation !== routeGeneration) return;
      const performance = await runtime.beginPerformance();
      if (request !== startRequest || generation !== routeGeneration) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      // Reps only: the timed format grades one window per strum cluster, so
      // there is no fixed beat grid to hold it to.
      const clock =
        !timed && clockBeats > 0
          ? { bpm, beatsPerChord: clockBeats, startTimestampMs: performance.downbeat }
          : {};
      if (mode === "changes" && timed) {
        await session.startChordChange({
          tuning,
          fromShape: activePosition,
          toShape: activeToPosition,
          durationSeconds: changeDurationSeconds,
          ...clock,
        });
        if (request !== startRequest || generation !== routeGeneration) {
          runtime.endPerformance();
          session.abandon();
          return;
        }
        clearChangeTimer();
        changeTimer = setTimeout(() => session?.finishNow(), changeDurationSeconds * 1_000);
        status = `Alternate ${shape.name} to ${toShape.name}: as many clean changes as you can.`;
      } else if (mode === "changes") {
        await session.startChordChange({
          tuning,
          fromShape: activePosition,
          toShape: activeToPosition,
          repetitions,
          ...clock,
        });
        if (request !== startRequest || generation !== routeGeneration) {
          runtime.endPerformance();
          session.abandon();
          return;
        }
        status = `Alternate ${shape.name} to ${toShape.name} cleanly, ${repetitions}×${clockBeats > 0 ? `, changing every ${clockBeats} beats at ${bpm} BPM` : ""}.`;
      } else {
        await session.startChordPerfect({ tuning, shape: activePosition });
        if (request !== startRequest || generation !== routeGeneration) {
          runtime.endPerformance();
          session.abandon();
          return;
        }
        status = `Sound each string of ${shape.name}, low to high.`;
      }
      resultsDismissed = false;
    } catch (error) {
      if (request === startRequest) {
        runtime.endPerformance();
        status = message(error, "The chord-perfect drill could not be started.");
      }
    } finally {
      if (request === startRequest) pending = false;
    }
  }

  function cancel(): void {
    startRequest += 1;
    pending = false;
    resultsDismissed = true;
    clearChangeTimer();
    runtime.endPerformance();
    session?.abandon();
    status = "Drill cancelled. You can start again.";
  }

  // Leave the summary phase for setup. abandon() no-ops once a run has settled
  // into its summary, so returning to setup is a route-owned view decision.
  function changeSetup(): void {
    startRequest += 1;
    pending = false;
    runtime.endPerformance();
    status = "Setup ready. Change the chord settings or start again.";
    resultsDismissed = true;
  }

  function clearChangeTimer(): void {
    if (changeTimer !== undefined) clearTimeout(changeTimer);
    changeTimer = undefined;
  }

  async function startVerifier(): Promise<void> {
    if (verifierPending) return;
    verifierPending = true;
    try {
      await tick();
      const generation = routeGeneration;
      await practiceContextReady;
      if (generation !== routeGeneration) return;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === routeGeneration) status = runtime.audioMessage;
        return;
      }
      if (generation !== routeGeneration) return;
      const performance = await runtime.beginPerformance();
      if (generation !== routeGeneration) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      verifierActive = true;
      verifiedMidiNotes = [];
    } finally {
      verifierPending = false;
    }
  }

  async function startMicVerifier(): Promise<void> {
    if (verifierPending) return;
    verifierPending = true;
    try {
      await tick();
      const generation = routeGeneration;
      await practiceContextReady;
      if (generation !== routeGeneration) return;
      await audioSource.start();
      if (generation !== routeGeneration) {
        await resetMicVerifier();
        return;
      }
      audioState = audioSource.state;
      if (audioSource.state.status !== "running") {
        status = audioSource.state.message ?? "Microphone capture could not start.";
        await resetMicVerifier();
        return;
      }
      const performance = await runtime.beginPerformance();
      if (generation !== routeGeneration) {
        await resetMicVerifier();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        await resetMicVerifier();
        return;
      }
      if (audioSource.state.status !== "running") {
        status = audioSource.state.message ?? "Microphone capture stopped before the downbeat.";
        await resetMicVerifier();
        return;
      }
      verifierActive = true;
      micVerifierActive = true;
      verifiedMidiNotes = [];
    } catch (error) {
      status = message(error, "The microphone verifier could not start.");
      await resetMicVerifier();
    } finally {
      verifierPending = false;
    }
  }

  async function resetMicVerifier(): Promise<void> {
    runtime.endPerformance();
    verifierActive = false;
    micVerifierActive = false;
    await audioSource.stop();
  }

  function stopVerifier(): void {
    runtime.endPerformance();
    verifierActive = false;
    if (micVerifierActive) void stopMicVerifier();
  }

  async function stopMicVerifier(): Promise<void> {
    await resetMicVerifier();
  }

  function clearVerifier(): void {
    verifiedMidiNotes = [];
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeChordPerfectDrillConfig({
      mode,
      instrument,
      shape: shapeId,
      to: toShapeId,
      reps: repetitions,
      timed,
      position,
      toPosition,
    });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("mode", config.mode);
    params.set("instrument", config.instrument);
    params.set("tuning", config.tuningId);
    params.set("shape", config.shapeId);
    params.set("bpm", String(bpm));
    if (config.position > 0) params.set("position", String(config.position));
    else params.delete("position");
    if (config.mode === "changes") {
      params.set("to", config.toShapeId);
      if (config.toPosition > 0) params.set("toPosition", String(config.toPosition));
      else params.delete("toPosition");
      params.set("reps", String(config.repetitions));
      if (config.timed) params.set("timed", "1");
      else params.delete("timed");
      if (!config.timed && clockBeats > 0) params.set("clock", String(clockBeats));
      else params.delete("clock");
    } else {
      params.delete("to");
      params.delete("toPosition");
      params.delete("reps");
      params.delete("timed");
      params.delete("clock");
    }
    syncRouteQuery(`${url.pathname}?${params.toString()}${url.hash}`);
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
  let preparedStrum: PreparedStrumCapture | undefined;

  function releasePreparedStrum(): void {
    const capture = preparedStrum;
    preparedStrum = undefined;
    capture?.dispose();
  }

  // Buffered polyphonic identification: record one strum, analyze the whole
  // clip, then both name the chord and verify it against the selected shape.
  async function strumAndIdentify(): Promise<void> {
    if (strumBusy) return;
    const generation = routeGeneration;
    const config = {
      instrument,
      shape,
      tuning,
      expectedMidiNotes: [...shapeMidi],
      ready,
    };
    // Invoke permission synchronously from the Start gesture; recording still
    // waits for the shared downbeat below.
    const captureFlight = prepareStrum();
    strumBusy = true;
    strumStatus = "Listening — strum the chord once.";
    strumCandidates = [];
    strumVerification = undefined;
    strumScore = undefined;
    try {
      await tick();
      const capture = await captureFlight;
      if (generation !== routeGeneration) {
        capture.dispose();
        return;
      }
      preparedStrum = capture;
      await practiceContextReady;
      if (generation !== routeGeneration) return;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === routeGeneration) strumStatus = runtime.audioMessage;
        return;
      }
      if (generation !== routeGeneration) return;
      const performance = await runtime.beginPerformance();
      if (generation !== routeGeneration) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        strumStatus = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      const midiNotes = await capture.record();
      if (generation !== routeGeneration) {
        runtime.endPerformance();
        return;
      }
      const pitchClasses = toPitchClasses(midiNotes);
      const candidates = identifyChord(pitchClasses);
      const verification = verifyChordTarget({
        expectedMidiNotes: config.expectedMidiNotes,
        observedMidiNotes: midiNotes,
      });
      if (config.ready) {
        const exercise = createOpenChordIdentificationExercise({
          tuning: config.tuning,
          shape: config.shape,
        });
        const prepared = prepareExerciseThroughPipeline({
          exercise,
          input: midiNotes.map((midiNote, index) => ({
            type: "noteOn" as const,
            midiNote,
            velocity: 1,
            source: "audio" as const,
            instrument: config.instrument,
            timestamp: monotonicMs(index * 10),
            clock: "performance" as const,
          })),
          sessionId: `open-chord-id-${Date.now()}`,
          runId: `open-chord-id-${config.shape.id}-${Date.now()}`,
          context: {
            metadata: { assistance: "guided" },
            targetSkillIds: exercise.skillIds,
            difficulty: 0.45,
            instrument: config.instrument,
          },
        });
        if (generation !== routeGeneration) {
          runtime.endPerformance();
          return;
        }
        const outcome = await commitPreparedExerciseOutcome(prepared, {
          skills,
          analytics,
          progress,
        });
        if (generation !== routeGeneration) {
          runtime.endPerformance();
          return;
        }
        const answer = outcome.result.answer as OpenChordIdentificationAnswer;
        await runtime.recordPractice({
          source: "drill",
          instrument: config.instrument,
          tags: ["technique", "open-chord-id", "chord-perfect", config.instrument],
          scoringEvents: [outcome.event],
          xpEarned: outcome.xp,
          note: `${config.instrument === "guitar" ? "Guitar" : "Ukulele"} open chord ID · ${config.shape.name} · ${answer.detectedSymbol ?? "unclear"}`,
        });
        if (generation !== routeGeneration) {
          runtime.endPerformance();
          return;
        }
        strumScore = {
          correct: outcome.result.correct,
          score: outcome.result.score,
          xp: outcome.xp,
          event: outcome.event,
          answer,
          feedback: outcome.result.feedback[0]?.message ?? "",
        };
      }
      strumPitchClasses = pitchClasses;
      strumCandidates = candidates;
      strumVerification = verification;
      strumStatus = pitchClasses.length
        ? "Heard it."
        : "No clear pitches — try again closer to the mic.";
    } catch (error) {
      if (generation === routeGeneration) {
        strumStatus = message(error, "Could not analyze the strum.");
      }
    } finally {
      runtime.endPerformance();
      releasePreparedStrum();
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
        : mode === "changes"
          ? {
              description: timed ? "One-minute changes" : "Chord-change reps",
              title: `${shape.name} to ${toShape.name}`,
              detail: timed
                ? "Alternate the two chords cleanly for the whole clock — your score is clean changes per minute."
                : "Play the first chord, switch, then play the target chord cleanly.",
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
    const expected: ToneMapItem[] = result.expectedPitchClasses.map((pitchClass) => ({
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

  function assistanceLabel(assistance: ScoringEvent["assistance"]): string {
    return assistance
      ? {
          independent: "Independent",
          hinted: "Hinted",
          guided: "Guided",
          "self-assessed": "Self-rated",
        }[assistance]
      : "Assistance not recorded";
  }

  function historyDate(event: ScoringEvent): string {
    return new Date(Number(event.at)).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  onMount(() => {
    audioState = audioSource.state;
    unsubscribeAudioState = audioSource.subscribeState((next) => {
      audioState = next;
      if (
        micVerifierActive &&
        next.status !== "running" &&
        next.status !== "requesting"
      ) {
        void resetMicVerifier();
      }
    });
    unsubscribeAudioEvents = audioSource.subscribeEvents((event) => {
      if (!micVerifierActive || event.type !== "noteOn") return;
      runtime.router.push(event);
    });
  });

  onDestroy(() => {
    destroyed = true;
    startRequest += 1;
    routeGeneration += 1;
    releasePreparedStrum();
    clearChangeTimer();
    runtime.endPerformance();
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
  <title>Chord-Perfect | Practice OS</title>
  <meta
    name="description"
    content="Practice clean chord changes: fret a shape and sound each string from low to high, graded note by note."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Chord-Perfect" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        source={runtime.activeSource}
        live={sessionState?.status === "active" || verifierActive || micVerifierActive}
      />
    {/snippet}
  </PracticeScreenHeader>

  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet setupSummaryLine()}
    {modeCopy.title} · {instrumentLabel} · {shape.name}{mode === "changes" ? ` to ${toShape.name} · ${timed ? "One-minute" : `${repetitions}×`}` : ""} · {activePosition.positionLabel} · {bpm} BPM
  {/snippet}

  <!-- Chord pickers: the chord is the drill, so they stay on the ready stage. -->
  {#snippet chordPickers()}
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="chord-shape">Chord</Label>
        <select
          id="chord-shape"
          aria-label="Chord"
          bind:value={shapeId}
          onchange={(event) => selectShape(event.currentTarget.value)}
          class="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {#each shapes as entry (entry.id)}
            <option value={entry.id}>{entry.name}</option>
          {/each}
        </select>
      </div>
      <PositionStepper
        index={position}
        count={positions.length}
        detail={positionDetail(activePosition)}
        onChange={selectPosition}
      />
      {#if mode === "changes"}
        <div class="grid gap-2">
          <Label for="target-chord-shape">To chord</Label>
          <select
            id="target-chord-shape"
            aria-label="To chord"
            bind:value={toShapeId}
            class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            onchange={(event) => selectToShape(event.currentTarget.value)}
          >
            {#each transitionShapes as entry (entry.id)}
              <option value={entry.id}>{entry.name}</option>
            {/each}
          </select>
        </div>
        <PositionStepper
          label="To position"
          index={toPosition}
          count={toPositions.length}
          detail={positionDetail(activeToPosition)}
          onChange={selectToPosition}
        />
      {/if}
    </div>
  {/snippet}

  {#snippet fingeringGuide()}
    <div class="grid gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-sm font-medium">Suggested fingering</p>
        <p class="text-xs text-stage-muted">{activePosition.positionLabel} · low string to high string</p>
      </div>
      {#if activePosition.barre}
        <p class="text-sm" data-testid="chord-barre">
          Barre: finger 1 across strings {activePosition.barre.fromString} to {activePosition.barre.toString}
          at fret {activePosition.barre.fret}.
        </p>
      {/if}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {#each shapeGuide as string (string.key)}
          <div class="rounded-md border border-stage-line bg-background/60 px-3 py-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium">String {string.stringNumber}</span>
              {#if string.fret === null}
                <span class="text-stage-muted">Muted</span>
              {:else if string.fret === 0}
                <span class="text-stage-muted">Open</span>
              {:else}
                <span>Fret {string.fret}</span>
              {/if}
            </div>
            {#if string.finger !== null}
              <p class="text-xs text-stage-muted">Finger {string.finger}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/snippet}

  <!-- One instrument surface: the fretboard lives inside the stage, not in an aside. -->
  {#snippet fretboard()}
    <div class="min-w-0 overflow-hidden rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
      <p class="mb-2 text-xs text-stage-muted">{instrumentLabel} fretboard · {midiStatus}</p>
      <FretboardInput
        {tuning}
        router={runtime.router}
        targetMidiNotes={targetMidi}
        activeMidiNotes={nextMidi === undefined ? [] : [nextMidi]}
        correctMidiNotes={correctMidi}
        visibleFrets={tuning.fretCount}
        {fretWindow}
        {dotLabels}
        onAccepted={playAccepted}
      />
    </div>
  {/snippet}

  {#snippet hudTiles()}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <HudTile size="sm" label="Strings" value={completedNotes} unit={`/${total || "0"}`} />
      <HudTile
        size="sm"
        label="Clean"
        value={Math.round((sessionState?.live?.runningScore ?? 0) * 100)}
        unit="%"
        tone="good"
      />
      <HudTile size="sm" label="Chord" value={mode === "changes" ? `${shape.name} to ${toShape.name}` : `${shape.name} · ${activePosition.positionLabel}`} tone="accent" />
      <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
    </div>
  {/snippet}

  {#snippet toneChips(items: ToneMapItem[])}
    <div class="flex flex-wrap gap-2">
      {#each items as tone (`${tone.pitchClass}-${tone.status}`)}
        <span
          class="rounded-full border px-2.5 py-1 text-xs font-medium {tone.status === 'matched'
            ? 'border-success/30 bg-success/10 text-success'
            : tone.status === 'extra'
              ? 'border-warn/30 bg-warn/10 text-warn'
              : 'border-stage-line bg-background/60 text-stage-muted'}"
        >
          {tone.label} {tone.status}
        </span>
      {/each}
    </div>
  {/snippet}

  <!-- Mode-specific body, minus the graded summaries (those live in DrillSummaryCard).
       Rendered on the ready stage for the verifier and strum modes (they have no run
       phase of their own) and on the stage during a run. -->
  {#snippet modeContent()}
    {#if mode === "build"}
      {#if prompt}
        <div class="grid gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">{prompt.label}</span>
            <span class="tabular-nums text-stage-muted">{completedNotes}/{total}</span>
          </div>
          <Progress value={completedNotes} max={total} />
        </div>
      {/if}
    {:else if mode === "pick"}
      <div class="grid gap-3 rounded-xl border border-stage-line bg-stage-2/70 p-3 text-sm sm:p-4">
        {#if verifierActive || micVerifierActive || verifiedMidiNotes.length > 0}
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-medium {verification.correct ? 'text-success' : ''}">Target chord tones</p>
            <p class="text-stage-muted">{verifierFeedbackDetail}</p>
          </div>
        {/if}
        <p class="font-medium">Tone map</p>
        {@render toneChips(verifierToneMap)}
        <p class="text-stage-muted">Observed: {observedToneLabels}</p>
        <p class="text-stage-muted">Missing: {missingToneLabels}</p>
        {#if audioState.status === "denied" || audioState.status === "error"}
          <p class="text-destructive">{audioState.message}</p>
        {/if}
      </div>
    {:else if mode === "changes"}
      {#if changePrompt}
        <div class="grid gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">{changePrompt.label}</span>
            {#if changePrompt.durationSeconds !== undefined}
              <span class="tabular-nums text-stage-muted" data-testid="change-clock">
                {changePrompt.durationSeconds}s timed run
              </span>
            {:else}
              <span class="tabular-nums text-stage-muted">{completedNotes}/{total}</span>
            {/if}
          </div>
          {#if changePrompt.durationSeconds !== undefined}
            <p class="text-xs text-stage-muted">Keep changing until the timed run ends.</p>
          {:else}
            <Progress value={completedNotes} max={total} />
          {/if}
          <div class="flex flex-wrap gap-2 text-xs font-medium">
            {#each changePrompt.targets as target (target.index)}
              <span
                class="rounded-full border px-2.5 py-1 {target.index ===
                Math.floor(completedNotes / Math.max(1, target.midiNotes.length))
                  ? 'border-practice-accent bg-practice-accent/15 text-foreground'
                  : 'border-stage-line bg-background/60 text-stage-muted'}"
              >
                {target.label}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <div class="grid gap-3 rounded-xl border border-stage-line bg-stage-2/70 p-3 text-sm sm:p-4">
        {#if strumCandidates.length}
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="text-2xl font-semibold">{strumCandidates[0]!.symbol}</span>
            <span class="text-stage-muted">{Math.round(strumCandidates[0]!.confidence * 100)}% match</span>
          </div>
          {#if strumCandidates.length > 1}
            <p class="text-xs text-stage-muted">
              Other readings:
              {strumCandidates
                .slice(1, 3)
                .map((candidate) => `${candidate.symbol} (${Math.round(candidate.confidence * 100)}%)`)
                .join(", ")}
            </p>
          {/if}
        {/if}
        <p class="text-stage-muted">Detected tones: {strumDetectedLabels}</p>
        {#if strumVerification}
          <p class="font-medium">Tone map</p>
          {@render toneChips(strumToneMap)}
          <p class="text-stage-muted">
            vs {shape.name}: {strumVerification.correct
              ? "matches the target"
              : `${Math.round(strumVerification.coverage * 100)}% of the target`}
          </p>
        {/if}
        {#if strumScore}
          <div class="grid gap-1 rounded-lg border {strumScore.correct ? 'border-success/30' : 'border-stage-line'} bg-background/60 p-3">
            <p class="font-medium">Open chord ID scored</p>
            <p class="text-stage-muted">{strumScore.feedback} · {Math.round(strumScore.score * 100)}% credit</p>
            <p class="text-xs text-stage-muted">+{strumScore.xp} XP</p>
          </div>
        {/if}
        {#if strumStatus}
          <p class="text-stage-muted">{strumStatus}</p>
        {/if}
        {#if audioState.status === "denied" || audioState.status === "error"}
          <p class="text-destructive">{audioState.message}</p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet modeActions()}
    {#if mode === "build"}
      <Button type="button" size="lg" disabled={!ready || pending} onclick={() => void start()}>
        {pending ? "Starting..." : "Start"}
      </Button>
      <StartShortcut onStart={() => void start()} enabled={ready && !pending} />
    {:else if mode === "pick"}
      <Button type="button" size="lg" disabled={!ready} onclick={() => void startVerifier()}>Start</Button>
      <Button
        type="button"
        variant="outline"
        disabled={!ready || !audioSupported || audioState.status === "requesting"}
        onclick={() => void startMicVerifier()}
      >
        {audioState.status === "requesting" ? "Starting..." : "Start with microphone"}
      </Button>
      <Button type="button" variant="ghost" onclick={clearVerifier}>Reset</Button>
    {:else if mode === "changes"}
      <Button type="button" size="lg" disabled={!ready || pending} onclick={() => void start()}>
        {pending ? "Starting..." : "Start"}
      </Button>
      <StartShortcut onStart={() => void start()} enabled={ready && !pending} />
    {:else}
      <Button
        type="button"
        size="lg"
        disabled={!ready || !audioSupported || strumBusy}
        onclick={() => void strumAndIdentify()}
      >
        {strumBusy ? "Listening..." : "Start"}
      </Button>
    {/if}
  {/snippet}

  {#snippet chordPairHistory(stage: boolean)}
    <section
      aria-label="Chord-pair history"
      class="grid gap-2 rounded-xl border p-3 text-sm {stage
        ? 'border-stage-line bg-stage-2/70'
        : 'bg-muted/20'}"
    >
      <h3 class="font-semibold">Chord-pair history</h3>
      <p class={stage ? "text-stage-muted" : "text-muted-foreground"}>
        Counts are pitch-matched chord targets; physical string cleanliness is not measured.
      </p>
      {#if historyFailed}
        <p class={stage ? "text-stage-muted" : "text-muted-foreground"}>
          Chord-pair history could not be loaded. Your next result will still be saved.
        </p>
      {:else if !historyLoaded}
        <p class={stage ? "text-stage-muted" : "text-muted-foreground"}>Loading chord-pair history…</p>
      {/if}
      {#if pairHistory.length}
        <ul class="grid gap-2">
          {#each pairHistory as entry (entry.event.id)}
            <li class="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md border border-current/15 px-3 py-2">
              <span class="font-medium tabular-nums">{entry.metric.changesPerMinute} changes/min</span>
              <span class={stage ? "text-stage-muted" : "text-muted-foreground"}>
                {historyDate(entry.event)} · {inputSourceLabel(entry.event.source)} · {assistanceLabel(entry.event.assistance)}
              </span>
            </li>
          {/each}
        </ul>
      {:else if historyLoaded && !historyFailed}
        <p class={stage ? "text-stage-muted" : "text-muted-foreground"}>
          Complete a one-minute run to start this pair’s history.
        </p>
      {/if}
    </section>
  {/snippet}

  <!-- Consolidated results frame: the build and changes summaries share one
       DrillSummaryCard (route keeps focus authority via headingRef). -->
  {#snippet summaryCard()}
    {@const buildPct = Math.round((answer?.pitchAccuracy ?? 0) * 100)}
    {@const changePct =
      changeAnswer && changeAnswer.completedChanges > 0
        ? Math.round((changeAnswer.cleanChanges / changeAnswer.completedChanges) * 100)
        : 0}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        {#if mode === "build"}
          <Card.Description>{shape.name} · {buildPct}% target notes matched</Card.Description>
          <Card.Title>Chord-perfect check</Card.Title>
        {:else}
          <Card.Description>{shape.name} to {toShape.name}</Card.Description>
          <Card.Title>Chord changes complete</Card.Title>
        {/if}
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          {#if mode === "build"}
            <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
              {buildPct}<span class="text-3xl text-muted-foreground">%</span>
            </span>
            <span class="sr-only"> of target notes matched</span>
          {:else if changeAnswer?.changesPerMinute !== undefined}
            <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
              {changeAnswer.changesPerMinute}
            </span>
            <span class="ml-2 text-lg text-muted-foreground">clean changes/min</span>
          {:else}
            <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
              {changePct}<span class="text-3xl text-muted-foreground">%</span>
            </span>
            <span class="sr-only"> of changes clean</span>
          {/if}
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        {#if !(mode === "changes" && changeAnswer?.changesPerMinute !== undefined)}
          <LastRunDelta
            tags={["technique", mode === "build" ? "chord-perfect" : "chord-changes"]}
            before={visitStartedAt}
            {store}
          />
        {/if}
      {/snippet}
      {#snippet children()}
        {#if mode === "build"}
          <p class="text-sm font-medium">Target notes matched · {buildPct}%</p>
          <p class="text-xs text-muted-foreground">Pitch matching measures note selection, not string tone or cleanliness.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <caption class="sr-only">Target notes by intended string</caption>
              <thead><tr><th class="p-2">Target string</th><th class="p-2">Expected</th><th class="p-2">Played</th></tr></thead>
              <tbody>
                {#each buildResultPrompt?.midiNotes ?? [] as expected, index (index)}
                  {@const actual = answer?.playedMidiNotes[index]}
                  <tr><td class="p-2">String {buildResultPrompt?.stringNumbers[index]}</td><td class="p-2">{midiToNote(expected)}</td><td class="p-2">{actual === undefined ? "Not played" : midiToNote(actual)} · {actual === expected ? "Matched" : "Missed"}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">
            {changeAnswer?.changesPerMinute === undefined
              ? `${changeAnswer?.cleanChanges ?? 0}/${changeAnswer?.completedChanges || changePrompt?.targets.length || 0} targets clean${
                  changeAnswer?.firstChangeLatencyMs === undefined
                    ? ""
                    : ` · first change ${(changeAnswer.firstChangeLatencyMs / 1000).toFixed(1)}s`
                }`
              : `${changeAnswer.changesPerMinute} clean changes/min · ${changeAnswer.cleanChanges}/${changeAnswer.completedChanges} strums clean`}
          </p>
          {#if changeAnswer?.onTimeChanges !== undefined}
            <p class="text-sm text-muted-foreground" data-testid="chord-change-clock">
              {changeAnswer.onTimeChanges}/{changePrompt?.targets.length ?? 0} on the beat · mean
              {Math.round(changeAnswer.meanTimingErrorMs ?? 0)}ms from the bar line
            </p>
          {/if}
          {#if changeAnswer?.changesPerMinute !== undefined}
            {@render chordPairHistory(false)}
          {/if}
        {/if}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile size="sm" label="Chord" value={mode === "changes" ? `${shape.name} to ${toShape.name}` : shape.name} />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
          <HudTile size="sm" label="Input" value={inputSourceLabel(summary?.results[0]?.event.source)} />
        </div>
        <p class="text-xs text-muted-foreground">+{summary?.xp ?? 0} XP · Technique</p>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={() => void start()} retryLabel="Again" />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/chord-perfect" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryCard}>
    {#snippet setup()}
      <div class="grid min-w-0 gap-4 rounded-lg border bg-card p-4">
        {#if mode === "changes"}
          <div class="flex flex-wrap gap-4">
            <div class="grid gap-2">
              <span class="text-sm font-medium">Format</span>
              <SegmentedControl
                size="sm"
                ariaLabel="Format"
                options={[
                  { value: "reps", label: "Reps" },
                  { value: "timed", label: "One-minute" },
                ]}
                value={timed ? "timed" : "reps"}
                onChange={(value) => (timed = value === "timed")}
              />
            </div>
            {#if !timed}
              <div class="grid gap-2">
                <span class="text-sm font-medium">Change on</span>
                <SegmentedControl
                  size="sm"
                  ariaLabel="Change on"
                  options={[
                    { value: "0", label: "No clock" },
                    { value: "2", label: "2 beats" },
                    { value: "4", label: "The bar" },
                  ]}
                  value={String(clockBeats)}
                  onChange={(value) => (clockBeats = Number(value))}
                />
              </div>
              <div class="grid gap-2">
                <span class="text-sm font-medium">Repetitions</span>
                <SegmentedControl
                  size="sm"
                  ariaLabel="Repetitions"
                  options={CHORD_CHANGE_REPETITION_OPTIONS.map((count) => ({
                    value: String(count),
                    label: `${count}×`,
                  }))}
                  value={String(repetitions)}
                  onChange={selectRepetitions}
                />
              </div>
            {/if}
          </div>
        {/if}
        <p class="text-sm tabular-nums text-muted-foreground">
          Tempo · {bpm} BPM (practice controls above){mode === "changes" && !timed && clockBeats > 0
            ? ` · a chord every ${clockBeats} beats`
            : ""}
        </p>
        {#if mode === "changes" && !timed && clockBeats > 0}
          <p class="text-xs text-muted-foreground">
            Each strum is graded against its own beat, so a dropped bar stays dropped instead of
            shifting the chords that follow.
          </p>
        {/if}
        <MidiStatus />
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage {instrument} class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · {modeCopy.description}</p>
            <div
              role="heading"
              aria-level="2"
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="chord-perfect-setup-heading"
              bind:this={setupHeading}
            >
              {modeCopy.title}
            </div>
            <p class="text-sm text-stage-muted">{modeCopy.detail}</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            {@render modeActions()}
          </div>
        </div>
        <!-- Which workflow, which instrument and which chord are the drill; the fieldset
             mirrors the shell's start lock. -->
        <fieldset class="grid min-w-0 gap-3 border-0 p-0" disabled={pending}>
          <div class="flex flex-wrap gap-3">
            <SegmentedControl ariaLabel="Chord-perfect workflow" options={modeOptions} value={mode} onChange={selectMode} />
            <SegmentedControl
              ariaLabel="Instrument"
              options={instrumentOptions}
              value={instrument}
              onChange={(value) => {
                selectInstrument(value);
                runtime.setActiveInstrument(value as StringInstrumentId);
              }}
            />
          </div>
          {@render chordPickers()}
        </fieldset>
        {#if mode === "changes" && timed}
          {@render chordPairHistory(true)}
        {/if}
        {@render fingeringGuide()}
        {#if mode === "pick" || mode === "strum" || (mode === "changes" && !changePrompt)}
          {@render modeContent()}
        {/if}
        {@render fretboard()}
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <PracticeStage {instrument} class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">{modeCopy.description} · {instrumentLabel}</p>
            <h2
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              bind:this={stageHeading}
              data-testid="chord-perfect-stage-heading"
            >
              {modeCopy.title}
            </h2>
          </div>
        </div>
        {@render hudTiles()}
        {@render modeContent()}
        {@render fretboard()}
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stageAction()}
      {#if mode === "build" && sessionState?.status === "active"}
        <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
      {:else if mode === "changes" && sessionState?.status === "active"}
        <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
      {:else if mode === "pick"}
        {#if verifierActive}
          <Button type="button" variant="outline" onclick={stopVerifier}>Stop</Button>
        {/if}
        {#if micVerifierActive}
          <Button type="button" variant="outline" onclick={() => void stopMicVerifier()}>Stop microphone</Button>
        {/if}
      {/if}
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
