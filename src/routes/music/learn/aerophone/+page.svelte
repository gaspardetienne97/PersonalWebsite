<script lang="ts">
  import { browser } from "$app/environment";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import { onDestroy, onMount, tick } from "svelte";

  import { unixMs, type NoteEvent } from "@repo/music-core/domain";
  import { AEROPHONE_RANGE, aerophoneChart } from "@repo/music-core/engines/aerophone-fingering";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { intonationZone } from "@repo/music-core/engines/audio-in";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    AEROPHONE_ARTICULATION_STYLES,
    AEROPHONE_ARTICULATION_TEMPOS,
    AEROPHONE_DRILL_MODES,
    AEROPHONE_INTERVAL_LANDING_OPTIONS,
    AEROPHONE_LONG_TONE_DURATIONS,
    AEROPHONE_SWELL_DURATIONS,
    normalizeAerophoneDrillConfig,
    TechniqueSession,
    type AerophoneDrillMode,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import {
    type AerophoneArticulationAnswer,
    type AerophoneArticulationPrompt,
    type ArticulationStyle,
  } from "@repo/music-core/exercises/aerophone-articulation";
  import type {
    AerophoneIntervalLandingId,
    AerophoneIntervalLandingPrompt,
  } from "@repo/music-core/exercises/aerophone-interval-landing";
  import type { AerophoneLongTonePrompt } from "@repo/music-core/exercises/aerophone-long-tone";
  import type { AerophoneSwellPrompt } from "@repo/music-core/exercises/aerophone-swell";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import AerophoneFingering from "../../_components/AerophoneFingering.svelte";
  import CentsMeter from "../../_components/CentsMeter.svelte";
  import PitchTrace from "../../_components/PitchTrace.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";
  import AerophoneInput from "./_components/AerophoneInput.svelte";

  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  const chart = aerophoneChart();
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const longToneDurations = AEROPHONE_LONG_TONE_DURATIONS.map((value) => ({
    value: String(value),
    label: `${value / 1000} sec`,
  }));
  const swellDurations = AEROPHONE_SWELL_DURATIONS.map((value) => ({
    value: String(value),
    label: `${value / 1000} sec`,
  }));
  type TechniqueResult = NonNullable<TechniqueSessionState["summary"]>["results"][number];
  type SummaryDimension = {
    label: string;
    value: string;
    detail: string;
  };
  const drillModes = AEROPHONE_DRILL_MODES.map((value) => ({
    value,
    label:
      value === "interval-landing"
        ? "Interval landing"
        : value === "articulation"
          ? "Articulation"
          : value === "swell"
            ? "Dynamic swell"
            : "Long tone",
  }));
  const intervalOptions = AEROPHONE_INTERVAL_LANDING_OPTIONS.map((value) => ({
    value: value.id,
    label: value.label,
  }));
  const styleOptions = AEROPHONE_ARTICULATION_STYLES.map((value) => ({
    value,
    label: value === "legato" ? "Legato" : "Staccato",
  }));
  const initialConfig = normalizeAerophoneDrillConfig(
    browser ? initialDrillSearch(["bpm", "tempo"]) : {},
  );
  const initialUrlBpm = browser
    ? validBpm(new URLSearchParams(window.location.search).get("bpm"))
    : undefined;

  let selected = $state(initialConfig.targetMidi);
  let live = $state(false);
  let drillMode = $state<AerophoneDrillMode>(initialConfig.mode);
  let durationMs = $state(String(initialConfig.durationMs));
  let articulationStyle = $state<ArticulationStyle>(initialConfig.style);
  let articulationBpm = $state(String(initialConfig.bpm));
  let intervalKind = $state<AerophoneIntervalLandingId>(initialConfig.interval);
  let intervalDirection = $state(initialConfig.direction);
  let ready = $state(false);
  let pending = $state(false);
  let destroyed = false;
  let status = $state("Preparing your Aerophone practice history.");
  let breathLevel = $state(0);
  let midiEnabled = $state(false);
  let midiStatus = $state("");
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeRouter: (() => void) | undefined;
  let unsubscribeSession: (() => void) | undefined;
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  let startRequest = 0;
  let pendingStartRequest: number | undefined;
  let captured = false;
  let resultsDismissed = $state(false);

  const summary = $derived(sessionState?.summary);
  const phase = $derived<"setup" | "stage" | "summary">(
    summary && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active"
        ? "stage"
        : "setup",
  );
  const longTonePrompt = $derived(
    sessionState?.currentPrompt &&
      "holdMs" in sessionState.currentPrompt &&
      !("interval" in sessionState.currentPrompt)
      ? sessionState.currentPrompt
      : undefined,
  );
  const swellPrompt = $derived(
    sessionState?.currentPrompt && "durationMs" in sessionState.currentPrompt
      ? sessionState.currentPrompt
      : undefined,
  );
  const articulationPrompt = $derived(
    sessionState?.currentPrompt && "style" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as AerophoneArticulationPrompt)
      : undefined,
  );
  const intervalPrompt = $derived(
    sessionState?.currentPrompt && "interval" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as AerophoneIntervalLandingPrompt)
      : undefined,
  );
  const activePrompt = $derived(longTonePrompt ?? swellPrompt ?? articulationPrompt ?? intervalPrompt);
  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  // Live traces from the session: breath samples (0-1) and pitch offsets in cents.
  const breathTrace = $derived<number[]>(sessionState?.live?.breathTrace ?? []);
  const pitchTrace = $derived<number[]>(sessionState?.live?.pitchTrace ?? []);
  const lastCents = $derived(pitchTrace.at(-1) ?? 0);
  const PITCH_TOLERANCE_CENTS = 15;
  const breathPoints = $derived(
    breathTrace.length < 2
      ? ""
      : breathTrace
          .map((value, index) => `${((index / (breathTrace.length - 1)) * 600).toFixed(1)},${(76 - Math.max(0, Math.min(1, value)) * 72).toFixed(1)}`)
          .join(" "),
  );
  const liveControl = $derived(Math.round((sessionState?.live?.runningScore ?? 0) * 100));
  const targetMidi = $derived(activePrompt?.targetMidi ?? selected);
  const targetLabel = $derived(midiToNote(targetMidi));
  const intervalDefinition = $derived(
    AEROPHONE_INTERVAL_LANDING_OPTIONS.find((option) => option.id === intervalKind) ??
      AEROPHONE_INTERVAL_LANDING_OPTIONS[1],
  );
  const intervalTargetMidi = $derived(
    selected + (intervalDirection === "down" ? -1 : 1) * (intervalDefinition?.semitones ?? 7),
  );
  const intervalTargetLabel = $derived(midiToNote(intervalTargetMidi));
  const completedNotes = $derived(
    Math.min(articulationPrompt?.count ?? 8, Math.round((sessionState?.live?.progress ?? 0) * (articulationPrompt?.count ?? 8))),
  );
  const articulationAnswer = $derived(
    summary?.results[0]?.prompt && "style" in summary.results[0].prompt
      ? (summary.results[0].result.answer as AerophoneArticulationAnswer)
      : undefined,
  );
  const summaryDimensions = $derived.by(() => buildSummaryDimensions(summary?.results[0]));
  const durationOptions = $derived(
    drillMode === "swell" ? swellDurations : longToneDurations,
  );
  const trainerTitle = $derived.by(() => {
    if (drillMode === "interval-landing") return "Interval Landing Trainer";
    if (drillMode === "articulation") return "Articulation Trainer";
    return drillMode === "swell" ? "Dynamic Swell Trainer" : "Long Tone Trainer";
  });
  const controlLabel = $derived.by(() => {
    if (drillMode === "interval-landing") return "Landing";
    if (drillMode === "articulation") return "Articulation";
    return drillMode === "swell" ? "Shape" : "Steadiness";
  });
  const swellEnvelopeBars = [24, 56, 92, 56, 24];
  const articulationSteps = $derived(
    Array.from({ length: articulationPrompt?.count ?? 8 }, (_, index) => index + 1),
  );
  const articulationTargetPercent = $derived(articulationStyle === "staccato" ? 35 : 95);
  const trainerBlurb = $derived.by(() => {
    if (drillMode === "interval-landing") return "Hold the drone note, then land the interval cleanly.";
    if (drillMode === "articulation") return "Tongue each attack on the beat; note length and breath are graded.";
    return drillMode === "swell"
      ? "Shape one note from soft to loud and back with breath alone."
      : "Hold one note with steady breath until the timer completes.";
  });
  const setupDetail = $derived.by(() => {
    if (drillMode === "interval-landing")
      return `${intervalDefinition?.label ?? "Perfect fifth"} ${intervalDirection} · ${Number(durationMs) / 1000}s`;
    if (drillMode === "articulation")
      return `${articulationStyle === "staccato" ? "Staccato" : "Legato"} · ${articulationBpm} BPM`;
    return `${Number(durationMs) / 1000}s hold`;
  });
  const stageBadge = $derived(
    drillMode === "articulation" ? `${articulationTargetPercent}% beat target` : `${Number(durationMs) / 1000}s hold`,
  );
  const liveAnnouncement = $derived(
    summary && !resultsDismissed ? `${trainerTitle} complete. ${summary.xp} XP.` : status,
  );
  let setupHeading = $state<HTMLElement | null>(null);
  let activeHeading = $state<HTMLElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let previousPhase: "setup" | "stage" | "summary" | undefined;

  void initialize();

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    registerAerophoneContext(drillMode, articulationStyle, intervalDirection);
  });

  $effect(() => {
    const current = phase;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") activeHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupHeading?.focus({ preventScroll: false });
  });

  $effect(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
    return runtime.midi.subscribeState(() => {
      midiEnabled = runtime.midi.state.enabled;
      midiStatus = midiMessage();
    });
  });

  function select(midi: number, fromInput = false): void {
    selected = normalizeAerophoneDrillConfig({ target: midi }).targetMidi;
    live = fromInput;
  }

  function step(delta: number): void {
    const next = selected + delta;
    if (next >= AEROPHONE_RANGE.lowestMidi && next <= AEROPHONE_RANGE.highestMidi) {
      select(next);
      if (runtime.audioEnabled) runtime.sound.playNote(next, 0.4);
    }
  }

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
        status = state.error ?? "";
        if (state.summary && !captured) {
          runtime.endPerformance();
          captured = true;
          const result = state.summary.results[0];
          const isArticulation = result?.prompt && "style" in result.prompt;
          const isSwell = result?.prompt && "durationMs" in result.prompt;
          const isIntervalLanding = result?.prompt && "interval" in result.prompt;
          const score = Math.round((result?.result.score ?? 0) * 100);
          const articulation = result?.result.answer as AerophoneArticulationAnswer | undefined;
          const completedArticulationPrompt = isArticulation
            ? (result.prompt as AerophoneArticulationPrompt)
            : undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument: "aerophone",
            tags: [
              "aerophone",
              isIntervalLanding
                ? "interval-landing"
                : isArticulation
                  ? "articulation"
                  : isSwell
                    ? "dynamic-swell"
                    : "long-tone",
              isIntervalLanding ? "intonation" : isArticulation ? "technique" : "breath",
            ],
            scoringEvents: state.summary.results.map((result) => result.event),
            xpEarned: state.summary.xp,
            note: completedArticulationPrompt && articulation
              ? `Aerophone ${completedArticulationPrompt.style} · ${midiToNote(completedArticulationPrompt.targetMidi)} · ${Math.round(articulation.articulationScore * 100)}% articulation`
              : isIntervalLanding
                ? `Aerophone interval landing · ${score}% control`
                : isSwell
                ? `Aerophone dynamic swell · ${score}% control`
                : `Aerophone long tone · ${Math.round(state.summary.breathSteadiness * 100)}% steadiness`,
          });
        }
      });
      ready = true;
      status = "Ready. Press Start, or Space.";
    } catch (error) {
      status = message(error, "Aerophone practice history could not be loaded.");
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

  function selectDrillMode(value: string): void {
    if (sessionState?.status === "active") return;
    const config = normalizeAerophoneDrillConfig({
      mode: value,
      target: selected,
      style: articulationStyle,
      bpm: articulationBpm,
      interval: intervalKind,
      direction: intervalDirection,
    });
    drillMode = config.mode;
    durationMs = String(config.durationMs);
    intervalKind = config.interval;
    intervalDirection = config.direction;
    if (config.mode !== "interval-landing") runtime.sound.stopDrone();
    status = config.mode === "interval-landing"
      ? "Land a target interval over the tonic drone."
      : config.mode === "articulation"
        ? "Tongue the selected fingering staccato or legato."
        : config.mode === "swell"
          ? "Shape a smooth soft-loud-soft breath curve."
          : "Hold the target with steady breath.";
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeAerophoneDrillConfig({
      mode: drillMode,
      target: selected,
      duration: durationMs,
      style: articulationStyle,
      bpm: articulationBpm,
      interval: intervalKind,
      direction: intervalDirection,
    });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("mode", config.mode);
    params.set("target", String(config.targetMidi));
    if (config.mode === "articulation") {
      params.delete("duration");
      params.delete("interval");
      params.delete("direction");
      params.set("style", config.style);
      params.set("bpm", String(config.bpm));
    } else if (config.mode === "interval-landing") {
      params.set("duration", String(config.durationMs));
      params.set("interval", config.interval);
      if (config.direction === "down") params.set("direction", "down");
      else params.delete("direction");
      params.delete("style");
      params.set("bpm", String(config.bpm));
    } else {
      params.set("duration", String(config.durationMs));
      params.delete("interval");
      params.delete("direction");
      params.delete("style");
      params.set("bpm", String(config.bpm));
    }
    syncRouteQuery(`${url.pathname}?${params.toString()}${url.hash}`);
  }

  async function startDrill(): Promise<void> {
    if (!ready || pending || !session) return;
    const request = ++startRequest;
    pendingStartRequest = request;
    resultsDismissed = true;
    pending = true;
    captured = false;
    breathLevel = 0;
    status = "";
    let contextRequest = practiceContextRequest;

    try {
      await tick();
      if (request !== startRequest || destroyed) return;
      const drillSession = session;
      const requestedMode = drillMode;
      const requestedTarget = selected;
      const requestedDuration = Number(durationMs);
      const requestedStyle = articulationStyle;
      const requestedBpm = Number(articulationBpm);
      const requestedInterval = intervalKind;
      const requestedDirection = intervalDirection;
      const requestedIntervalDefinition =
        AEROPHONE_INTERVAL_LANDING_OPTIONS.find(
          (option) => option.id === requestedInterval,
        ) ?? AEROPHONE_INTERVAL_LANDING_OPTIONS[1];
      const requestedIntervalTarget =
        requestedTarget +
        (requestedDirection === "down" ? -1 : 1) *
          (requestedIntervalDefinition?.semitones ?? 7);
      contextRequest = practiceContextRequest;
      await practiceContextQueue;
      if (
        request !== startRequest ||
        contextRequest !== practiceContextRequest ||
        destroyed
      ) {
        return;
      }
      runtime.endPerformance();
      const playbackReady = await runtime.ensurePlaybackVoice();
      if (
        request !== startRequest ||
        contextRequest !== practiceContextRequest ||
        destroyed
      ) {
        return;
      }
      if (!playbackReady) {
        status = runtime.audioMessage;
        return;
      }
      const clock = await runtime.beginPerformance();
      if (
        request !== startRequest ||
        contextRequest !== practiceContextRequest ||
        destroyed
      ) {
        if (clock.status === "started") runtime.endPerformance();
        return;
      }
      if (clock.status === "cancelled") return;
      if (clock.status === "failed") {
        status = clock.message;
        return;
      }
      if (requestedMode === "articulation") {
        await drillSession.startArticulation({
          targetMidi: requestedTarget,
          style: requestedStyle,
          count: 8,
          bpm: requestedBpm,
          breathController: 2,
        });
        if (
          request !== startRequest ||
          contextRequest !== practiceContextRequest ||
          destroyed
        ) {
          runtime.endPerformance();
          drillSession.abandon();
          return;
        }
        status = `Play ${midiToNote(requestedTarget)} ${requestedStyle}, eight times.`;
      } else if (requestedMode === "swell") {
        await drillSession.startSwell({
          targetMidi: requestedTarget,
          durationMs: requestedDuration,
          breathController: 2,
        });
        if (
          request !== startRequest ||
          contextRequest !== practiceContextRequest ||
          destroyed
        ) {
          runtime.endPerformance();
          drillSession.abandon();
          return;
        }
        status = `Shape ${midiToNote(requestedTarget)} from soft to loud and back to soft.`;
      } else if (requestedMode === "interval-landing") {
        if (runtime.audioEnabled) runtime.sound.startDrone(requestedTarget);
        await drillSession.startIntervalLanding({
          droneMidi: requestedTarget,
          interval: requestedInterval,
          direction: requestedDirection,
          holdMs: requestedDuration,
          breathController: 2,
        });
        if (
          request !== startRequest ||
          contextRequest !== practiceContextRequest ||
          destroyed
        ) {
          runtime.endPerformance();
          runtime.sound.stopDrone();
          drillSession.abandon();
          return;
        }
        status = `Land on ${midiToNote(requestedIntervalTarget)} ${requestedDirection === "down" ? "below" : "over"} the ${midiToNote(requestedTarget)} drone.`;
      } else {
        await drillSession.startLongTone({
          targetMidi: requestedTarget,
          holdMs: requestedDuration,
          breathController: 2,
        });
        if (
          request !== startRequest ||
          contextRequest !== practiceContextRequest ||
          destroyed
        ) {
          runtime.endPerformance();
          drillSession.abandon();
          return;
        }
        status = `Hold ${midiToNote(requestedTarget)} with steady breath until the timer completes.`;
      }
      resultsDismissed = false;
    } catch (error) {
      runtime.endPerformance();
      runtime.sound.stopDrone();
      if (
        request !== startRequest ||
        contextRequest !== practiceContextRequest ||
        destroyed
      ) {
        return;
      }
      status = message(error, "The Aerophone drill could not be started.");
    } finally {
      if (pendingStartRequest === request) {
        pendingStartRequest = undefined;
        if (!destroyed) pending = false;
      }
    }
  }

  function cancelDrill(): void {
    startRequest += 1;
    resultsDismissed = true;
    runtime.endPerformance();
    session?.abandon();
    runtime.sound.stopDrone();
    breathLevel = 0;
    status = "Drill cancelled. Choose a target and start again.";
  }

  function changeSetup(): void {
    startRequest += 1;
    resultsDismissed = true;
    sessionState = undefined;
    breathLevel = 0;
    status = "Drill setup ready.";
  }

  function prepareArticulationBpm(nextBpm: number): void {
    startRequest += 1;
    resultsDismissed = true;
    runtime.setPracticeVariantBpm(
      nextBpm,
      aerophoneVariantKey("articulation", articulationStyle, intervalDirection),
    );
    sessionState = undefined;
    status = `Ready for ${articulationStyle} articulation at ${nextBpm} BPM.`;
  }

  function registerAerophoneContext(
    mode: AerophoneDrillMode,
    style: ArticulationStyle,
    direction: "up" | "down",
  ): void {
    const request = ++practiceContextRequest;
    practiceContextQueue = practiceContextQueue.then(async () => {
      if (request !== practiceContextRequest) return;
      const cleanup = await runtime.registerPracticeContext({
        owner: "aerophone",
        variantKey: aerophoneVariantKey(mode, style, direction),
        defaultBpm: 90,
        initialUrlBpm,
        meter: { numerator: 4, denominator: 4 },
        pinnedInstrument: "aerophone",
        onBpmChange: (bpm) => {
          if (articulationBpm !== String(bpm)) articulationBpm = String(bpm);
        },
      });
      if (request !== practiceContextRequest) {
        cleanup();
        return;
      }
      practiceContextCleanup?.();
      practiceContextCleanup = cleanup;
    });
  }

  function aerophoneVariantKey(
    mode: AerophoneDrillMode,
    style: ArticulationStyle,
    direction: "up" | "down",
  ): string {
    const variant = mode === "articulation" ? style : mode === "interval-landing" ? direction : "breath";
    return `v1:aerophone:${mode}:${variant}:aerophone`;
  }

  function adjacentArticulationBpm(direction: -1 | 1): number {
    const current = Number(articulationBpm);
    return direction > 0
      ? (AEROPHONE_ARTICULATION_TEMPOS.find((bpm) => bpm > current) ?? current)
      : ([...AEROPHONE_ARTICULATION_TEMPOS].reverse().find((bpm) => bpm < current) ?? current);
  }

  function validBpm(value: string | null): number | undefined {
    const bpm = Number(value);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : undefined;
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
    }
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function buildSummaryDimensions(view: TechniqueResult | undefined): SummaryDimension[] {
    if (!view) return [];
    const { prompt, result } = view;
    const pitchMetrics = result.metrics.filter((metric) => metric.kind === "pitch");
    const correctPitches = pitchMetrics.filter(
      (metric) => metric.actualMidi === metric.expectedMidi,
    ).length;
    const pitchAccuracy = pitchMetrics.length === 0 ? 0 : correctPitches / pitchMetrics.length;
    const breathMetric = result.metrics.find((metric) => metric.kind === "breath");
    const breathSamples = breathMetric?.actualCurve?.length ?? 0;
    const dimensions: SummaryDimension[] = [
      {
        label: "Pitch",
        value: percent(pitchAccuracy),
        detail:
          pitchMetrics.length === 0
            ? "No pitch target recorded"
            : `${correctPitches}/${pitchMetrics.length} targets matched`,
      },
      {
        label: "Breath",
        value: percent(breathMetric?.steadiness ?? 0),
        detail: `CC2 samples ${breathSamples}`,
      },
    ];

    if ("style" in prompt) {
      const articulationPrompt = prompt as AerophoneArticulationPrompt;
      const answer = result.answer as AerophoneArticulationAnswer;
      dimensions.push(
        {
          label: "Articulation",
          value: percent(answer.articulationScore),
          detail: `${articulationPrompt.style} target · ${percent(answer.meanSoundingFraction)} beat average`,
        },
        {
          label: "Duration",
          value: percent(answer.meanSoundingFraction),
          detail: `${answer.playedMidiNotes.length}/${articulationPrompt.count} attacks recorded`,
        },
      );
      return dimensions;
    }

    if ("durationMs" in prompt) {
      const swellPrompt = prompt as AerophoneSwellPrompt;
      const durationRatio = breathDurationRatio(
        result.input,
        swellPrompt.breathController,
        swellPrompt.durationMs,
      );
      dimensions.push(
        {
          label: "Articulation",
          value: "N/A",
          detail: "Use articulation mode for tongue timing",
        },
        {
          label: "Duration",
          value: percent(durationRatio),
          detail: `${Number(swellPrompt.durationMs) / 1000}s swell target`,
        },
      );
      return dimensions;
    }

    if ("interval" in prompt) {
      const intervalPrompt = prompt as AerophoneIntervalLandingPrompt;
      const durationRatio = breathDurationRatio(
        result.input,
        intervalPrompt.breathController,
        intervalPrompt.holdMs,
      );
      dimensions.push(
        {
          label: "Interval",
          value: result.correct ? "Hit" : "Miss",
          detail: `${midiToNote(intervalPrompt.droneMidi)} drone to ${midiToNote(intervalPrompt.targetMidi)} landing`,
        },
        {
          label: "Duration",
          value: percent(durationRatio),
          detail: `${Number(intervalPrompt.holdMs) / 1000}s landing hold`,
        },
      );
      return dimensions;
    }

    if ("holdMs" in prompt) {
      const longTonePrompt = prompt as AerophoneLongTonePrompt;
      const durationRatio = breathDurationRatio(
        result.input,
        longTonePrompt.breathController,
        longTonePrompt.holdMs,
      );
      dimensions.push(
        {
          label: "Articulation",
          value: "N/A",
          detail: "Use articulation mode for tongue timing",
        },
        {
          label: "Duration",
          value: percent(durationRatio),
          detail: `${Number(longTonePrompt.holdMs) / 1000}s hold target`,
        },
      );
    }

    return dimensions;
  }

  function breathDurationRatio(input: NoteEvent[], controller: number, targetMs: number): number {
    const samples = input.filter((event) => event.type === "cc" && event.controller === controller);
    const first = samples[0]?.timestamp;
    const last = samples.at(-1)?.timestamp;
    if (first === undefined || last === undefined || targetMs <= 0) return 0;
    return Math.max(0, Math.min(1, (Number(last) - Number(first)) / targetMs));
  }

  function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  onMount(() => {
    unsubscribeRouter = runtime.router.subscribe((event: NoteEvent) => {
      if (event.type === "noteOn") select(event.midiNote, true);
      if (event.type === "cc" && event.controller === 2) {
        breathLevel = Math.round(event.value * 100);
      }
    });
  });

  onDestroy(() => {
    destroyed = true;
    startRequest += 1;
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    unsubscribeRouter?.();
    unsubscribeSession?.();
    runtime.sound.stopDrone();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Aerophone Technique | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Aerophone Technique" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "Aerophone" : "Waiting for Aerophone"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet setupSummaryLine()}
    {trainerTitle} · Target {targetLabel} · {setupDetail}
  {/snippet}

  <!-- The target block: fingering, note stepper and the live/preview chip. Shared by
       the ready stage and the run (read-only there). -->
  {#snippet targetBlock(size: number, stepping: boolean)}
    <div class="grid justify-items-center gap-3">
      <div class="flex items-center gap-3">
        {#if stepping}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous note"
            disabled={selected <= AEROPHONE_RANGE.lowestMidi}
            onclick={() => step(-1)}
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </Button>
        {/if}
        <div class="text-center">
          <p class="text-2xl font-bold tracking-tight tabular-nums">{targetLabel}</p>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold {live
              ? 'bg-success/15 text-success'
              : 'bg-stage-2 text-stage-muted'}"
          >
            <span class="size-1.5 rounded-full {live ? 'bg-success' : 'bg-stage-muted/50'}"></span>
            {live ? "Live" : "Preview"}
          </span>
        </div>
        {#if stepping}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next note"
            disabled={selected >= AEROPHONE_RANGE.highestMidi}
            onclick={() => step(1)}
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </Button>
        {/if}
      </div>
      <AerophoneFingering midi={targetMidi} {size} />
    </div>
  {/snippet}

  <!-- Live breath envelope from the session (about the last 64 CC2 samples). -->
  {#snippet breathTraceLane()}
    <svg
      viewBox="0 0 600 80"
      preserveAspectRatio="none"
      class="h-16 w-full"
      aria-hidden="true"
      data-testid="breath-trace"
    >
      <line x1="0" y1="76" x2="600" y2="76" class="stroke-stage-line" stroke-width="1" />
      {#if breathPoints}
        <polyline points={breathPoints} fill="none" class="stroke-success" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      {/if}
    </svg>
  {/snippet}

  {#snippet pitchLane()}
    <div class="grid gap-2" data-testid="pitch-trace">
      <CentsMeter
        cents={lastCents}
        zone={intonationZone(lastCents, PITCH_TOLERANCE_CENTS)}
        toleranceCents={PITCH_TOLERANCE_CENTS}
        active={pitchTrace.length > 0}
      />
      <PitchTrace trace={pitchTrace} toleranceCents={PITCH_TOLERANCE_CENTS} class="h-14" />
    </div>
  {/snippet}

  {#snippet summaryPhase()}
    {@const completedResult = summary?.results[0]}
    {@const completedArticulation = completedResult?.prompt && "style" in completedResult.prompt}
    {@const completedSwell = completedResult?.prompt && "durationMs" in completedResult.prompt}
    {@const completedInterval = completedResult?.prompt && "interval" in completedResult.prompt}
    {@const completedKind = completedInterval
      ? "Interval landing"
      : completedArticulation
        ? "Articulation"
        : completedSwell
          ? "Dynamic swell"
          : "Long tone"}
    {@const primaryPct = completedInterval
      ? Math.round((completedResult?.result.score ?? 0) * 100)
      : completedArticulation
        ? Math.round((articulationAnswer?.articulationScore ?? 0) * 100)
        : completedSwell
          ? Math.round((completedResult?.result.score ?? 0) * 100)
          : Math.round((summary?.breathSteadiness ?? 0) * 100)}
    {@const primaryName = completedInterval
      ? "landing"
      : completedArticulation
        ? "articulation"
        : completedSwell
          ? "control"
          : "breath steadiness"}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>{trainerTitle} · Target {targetLabel}</Card.Description>
        <Card.Title>{completedKind} complete</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {primaryPct}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> {primaryName}</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta tags={["aerophone"]} accuracy={primaryPct / 100} before={visitStartedAt} />
      {/snippet}
      {#snippet children()}
        <p class="text-sm text-muted-foreground">
          {primaryPct}% {primaryName} · {Math.round((summary?.noteAccuracy ?? 0) * 100)}% pitch accuracy
        </p>
        {#if completedResult?.result.feedback[0]?.message}
          <p class="text-sm text-muted-foreground">{completedResult.result.feedback[0].message}</p>
        {/if}
        {#if summaryDimensions.length > 0}
          <div class="grid gap-2" aria-label="Summary dimensions">
            <p class="eyebrow">Summary dimensions</p>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {#each summaryDimensions as dimension (dimension.label)}
                <div class="grid gap-0.5 rounded-lg border bg-card p-3">
                  <span class="eyebrow">{dimension.label}</span>
                  <span class="text-2xl font-bold leading-none tracking-tight tabular-nums">{dimension.value}</span>
                  <span class="text-xs text-muted-foreground">{dimension.detail}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        <p class="text-xs text-muted-foreground">+{summary?.xp ?? 0} XP · Aerophone</p>
      {/snippet}
      {#snippet actions()}
        {#if completedArticulation}
          <Button
            type="button"
            disabled={adjacentArticulationBpm(1) === Number(articulationBpm)}
            onclick={() => prepareArticulationBpm(adjacentArticulationBpm(1))}
          >
            Increase to {adjacentArticulationBpm(1)} BPM
          </Button>
          <Button
            type="button"
            variant="outline"
            onclick={() => prepareArticulationBpm(Number(articulationBpm))}
          >
            Repeat at {articulationBpm} BPM
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={adjacentArticulationBpm(-1) === Number(articulationBpm)}
            onclick={() => prepareArticulationBpm(adjacentArticulationBpm(-1))}
          >
            Slow to {adjacentArticulationBpm(-1)} BPM
          </Button>
        {:else}
          <AdaptiveRetryBar onRetry={() => void startDrill()} retryLabel="Again" />
        {/if}
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/learn/aerophone" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-4 rounded-lg border bg-card p-4">
        {#if drillMode === "interval-landing"}
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl ariaLabel="Landing interval" options={intervalOptions} bind:value={intervalKind} size="sm" />
            <SegmentedControl
              ariaLabel="Landing direction"
              options={[{ value: "up", label: "Up" }, { value: "down", label: "Down" }]}
              bind:value={intervalDirection}
              size="sm"
            />
            <SegmentedControl ariaLabel="Drill duration" options={durationOptions} bind:value={durationMs} size="sm" />
          </div>
          <p class="text-xs text-muted-foreground">Landing {intervalTargetLabel} against the {targetLabel} drone.</p>
        {:else if drillMode === "articulation"}
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl
              ariaLabel="Articulation style"
              options={styleOptions}
              value={articulationStyle}
              onChange={(value) => (articulationStyle = value as ArticulationStyle)}
              size="sm"
            />
            <p aria-label="Articulation tempo" class="flex h-9 items-center rounded-md border px-3 text-sm tabular-nums">
              {articulationBpm} BPM
            </p>
          </div>
          <p class="text-xs text-muted-foreground">Tempo lives in the practice controls above.</p>
        {:else}
          <SegmentedControl ariaLabel="Drill duration" options={durationOptions} bind:value={durationMs} size="sm" />
        {/if}
        <div class="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
            {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
          </Button>
          <p class="text-xs text-muted-foreground">{midiStatus}</p>
        </div>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage instrument="aerophone" class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · Breath CC2 · MIDI</p>
            <div
              role="heading"
              aria-level="2"
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="aerophone-ready-heading"
              bind:this={setupHeading}
            >
              {trainerTitle}
            </div>
            <p class="text-sm text-stage-muted">{trainerBlurb}</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!ready || pending} onclick={startDrill}>
              {pending ? "Starting..." : "Start"}
            </Button>
            <StartShortcut onStart={() => void startDrill()} enabled={ready && !pending} />
          </div>
        </div>
        <!-- Which trainer is the point of the route, so the picker stays on the ready stage;
             the fieldset mirrors the shell's setup lock while a start is pending. -->
        <fieldset class="min-w-0 border-0 p-0" disabled={pending}>
          <SegmentedControl ariaLabel="Aerophone drill" options={drillModes} value={drillMode} onChange={selectDrillMode} />
        </fieldset>
        <div class="grid gap-4 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-4">
          {@render targetBlock(110, true)}
          <div class="grid gap-1 text-sm">
            <p class="font-medium">Target {targetLabel}</p>
            {#if drillMode === "interval-landing"}
              <p class="text-stage-muted">Landing {intervalTargetLabel}</p>
            {/if}
            <p class="text-stage-muted">{setupDetail}</p>
            <p class="text-xs text-stage-muted">Pick a note in the chart below, or step with the arrows.</p>
          </div>
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>

      <Card.Root>
        <Card.Header>
          <Card.Title>Fingering chart</Card.Title>
          <Card.Description>
            {midiToNote(AEROPHONE_RANGE.lowestMidi)} to {midiToNote(AEROPHONE_RANGE.highestMidi)}. Tap a note to
            make it the target.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-7">
            {#each chart as fingering (fingering.midi)}
              <button
                type="button"
                aria-label={`${midiToNote(fingering.midi)} fingering`}
                aria-pressed={fingering.midi === selected}
                onclick={() => {
                  select(fingering.midi);
                  if (runtime.audioEnabled) runtime.sound.playNote(fingering.midi, 0.4);
                }}
                class="flex flex-col items-center rounded-xl border p-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {fingering.midi ===
                selected
                  ? 'border-practice-accent bg-practice-accent/10 ring-1 ring-practice-accent/40'
                  : 'border-border'}"
              >
                <!-- The button label already names the note; the figure is decoration here. -->
                <span aria-hidden="true" class="contents"><AerophoneFingering midi={fingering.midi} size={84} /></span>
              </button>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/snippet}

    {#snippet stage()}
      <PracticeStage instrument="aerophone" class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Breath CC2 · MIDI · Target {targetLabel}</p>
            <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={activeHeading}>
              {trainerTitle}
            </h2>
          </div>
          <span class="rounded-full border border-stage-line px-2.5 py-0.5 text-xs text-stage-muted">{stageBadge}</span>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-start">
          <div class="grid min-w-0 gap-4">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HudTile size="sm" label="Target" value={targetLabel} tone="accent" />
              <HudTile size="sm" label="Breath" value={breathLevel} unit="%" />
              {#if drillMode === "interval-landing"}
                <HudTile size="sm" label="Drone" value={targetLabel} />
                <HudTile size="sm" label="Landing" value={intervalTargetLabel} tone="good" />
              {:else if drillMode === "articulation"}
                <HudTile size="sm" label="Notes" value={completedNotes} unit={`/${articulationPrompt?.count ?? 8}`} tone="good" />
                <HudTile size="sm" label="Style" value={articulationStyle === "staccato" ? "Staccato" : "Legato"} />
              {:else}
                <HudTile size="sm" label={controlLabel} value={liveControl} unit="%" tone="good" />
                <HudTile size="sm" label="Hold" value={liveProgress} unit="%" />
              {/if}
            </div>

            <div class="grid gap-4 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4" aria-label="Aerophone technique stage">
              {#if drillMode === "interval-landing"}
                <div>
                  <p class="eyebrow">Drone interval lane</p>
                  <h3 class="text-base font-semibold">Land the interval against the drone</h3>
                </div>
                <div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div class="grid gap-1 rounded-lg border border-stage-line bg-background/60 p-3">
                    <span class="eyebrow">Drone</span>
                    <span class="text-lg font-semibold">{targetLabel}</span>
                  </div>
                  <div class="text-center text-xs font-semibold uppercase tracking-wide text-stage-muted">{intervalDefinition?.label ?? "Perfect fifth"}</div>
                  <div class="grid gap-1 rounded-lg border border-stage-line bg-background/60 p-3">
                    <span class="eyebrow">Landing</span>
                    <span class="text-lg font-semibold">{intervalTargetLabel}</span>
                  </div>
                </div>
                <div class="grid gap-1">
                  <span class="text-xs text-stage-muted">Pitch against {intervalTargetLabel}</span>
                  {@render pitchLane()}
                </div>
                {@render breathTraceLane()}
              {:else if drillMode === "swell"}
                <div>
                  <p class="eyebrow">Swell envelope</p>
                  <h3 class="text-base font-semibold">Target CC2 envelope</h3>
                </div>
                <div class="grid h-24 grid-cols-5 items-end gap-2">
                  {#each swellEnvelopeBars as level, index (index)}
                    <div class="flex h-full flex-col justify-end gap-1">
                      <div class="rounded-t-md bg-practice-accent/70" style={`height: ${level}%`} aria-hidden="true"></div>
                      <span class="text-center text-xs font-medium text-stage-muted">{index === 2 ? "Peak" : index < 2 ? "Rise" : "Fall"}</span>
                    </div>
                  {/each}
                </div>
                <div class="grid gap-1">
                  <div class="flex items-center justify-between text-xs text-stage-muted">
                    <span>Actual CC2 envelope</span>
                    <span class="tabular-nums">{breathLevel}% live</span>
                  </div>
                  {@render breathTraceLane()}
                  <Progress value={breathLevel} max={100} />
                </div>
                <div class="grid gap-1">
                  <span class="text-xs text-stage-muted">Pitch against {targetLabel}</span>
                  {@render pitchLane()}
                </div>
              {:else if drillMode === "articulation"}
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="eyebrow">Articulation attack grid</p>
                    <h3 class="text-base font-semibold">Duration markers</h3>
                  </div>
                  <span class="rounded-full border border-stage-line px-2 py-0.5 text-xs text-stage-muted">{articulationTargetPercent}% beat target</span>
                </div>
                <div class="grid gap-2" style={`grid-template-columns: repeat(${articulationSteps.length}, minmax(0, 1fr));`}>
                  {#each articulationSteps as step (step)}
                    <div class="grid gap-1">
                      <div class="h-10 rounded-md border border-stage-line bg-background/60 p-1">
                        <div
                          class="h-full rounded {step <= completedNotes ? 'bg-success' : 'bg-practice-accent/60'}"
                          style={`width: ${articulationTargetPercent}%`}
                          aria-hidden="true"
                        ></div>
                      </div>
                      <span class="text-center text-xs font-medium text-stage-muted">{step}</span>
                    </div>
                  {/each}
                </div>
                <div class="flex items-center justify-between text-xs text-stage-muted">
                  <span>Breath starts</span>
                  <span>{articulationStyle === "staccato" ? "Detached attacks" : "Connected airflow"}</span>
                </div>
                {@render breathTraceLane()}
              {:else}
                <div>
                  <p class="eyebrow">Long-tone stage</p>
                  <h3 class="text-base font-semibold">Pitch lane</h3>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="grid gap-2 rounded-lg border border-stage-line bg-background/60 p-3 sm:col-span-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="eyebrow">Pitch lane</span>
                      <span class="text-lg font-semibold">{targetLabel}</span>
                    </div>
                    {@render pitchLane()}
                  </div>
                  <div class="grid gap-2 rounded-lg border border-stage-line bg-background/60 p-3">
                    <div class="flex items-center justify-between gap-2">
                      <span class="eyebrow">Breath steadiness</span>
                      <span class="text-xs tabular-nums text-stage-muted">{breathLevel}%</span>
                    </div>
                    <Progress value={breathLevel} max={100} />
                    {@render breathTraceLane()}
                  </div>
                  <div class="grid gap-2 rounded-lg border border-stage-line bg-background/60 p-3 sm:col-span-3">
                    <div class="flex items-center justify-between gap-2">
                      <span class="eyebrow">Hold timer</span>
                      <span class="text-xs tabular-nums text-stage-muted">{liveProgress}%</span>
                    </div>
                    <Progress value={liveProgress} max={100} />
                  </div>
                </div>
              {/if}

              {#if activePrompt}
                <div class="grid gap-2 border-t border-stage-line pt-3">
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <span class="font-medium">{activePrompt.label}</span>
                    <span class="tabular-nums text-stage-muted">
                      {#if articulationPrompt}{completedNotes}/{articulationPrompt.count}{:else}{liveProgress}%{/if}
                    </span>
                  </div>
                  {#if articulationPrompt}<Progress value={completedNotes} max={articulationPrompt.count} />{:else}<Progress value={liveProgress} max={100} />{/if}
                  {#if swellPrompt}
                    <div class="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                      <span class="rounded-md border border-stage-line bg-background/60 px-2 py-1.5">Soft</span>
                      <span class="rounded-md border border-practice-accent bg-practice-accent/15 px-2 py-1.5">Loud</span>
                      <span class="rounded-md border border-stage-line bg-background/60 px-2 py-1.5">Soft</span>
                    </div>
                  {/if}
                  <!-- One breath meter for every mode: the live CC2 level. -->
                  <div class="flex items-center justify-between text-xs text-stage-muted">
                    <span>Live breath pressure</span><span class="tabular-nums">{breathLevel}%</span>
                  </div>
                  <Progress value={breathLevel} max={100} />
                </div>
              {/if}
            </div>

            {#if drillMode === "articulation"}
              <div class="grid gap-3 rounded-xl border border-dashed border-stage-line p-3">
                <p class="text-xs text-stage-muted">
                  Articulation grading reads note length and breath (CC2), so a wind controller scores it fully.
                  On-screen taps complete the pitch dimension only.
                </p>
                <AerophoneInput
                  router={runtime.router}
                  {targetMidi}
                  currentMidi={live ? selected : undefined}
                  onAccepted={playAccepted}
                />
              </div>
            {/if}
          </div>

          <div class="grid gap-1 rounded-xl border border-stage-line bg-stage-2/70 p-3">
            <p class="eyebrow text-center">Current fingering</p>
            {@render targetBlock(120, false)}
          </div>
        </div>

        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancelDrill}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <DrillProgressRail
        items={[
          { label: "Trainer", value: drillModes.find((option) => option.value === drillMode)?.label ?? trainerTitle },
          { label: "Target", value: targetLabel },
          { label: "Setup", value: setupDetail },
          { label: "Input", value: runtime.activeSource === "midi" ? "Aerophone" : "Waiting" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
