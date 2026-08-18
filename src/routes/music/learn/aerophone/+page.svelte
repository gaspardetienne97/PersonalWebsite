<script lang="ts">
  import { browser } from "$app/environment";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import { onDestroy, onMount, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AEROPHONE_RANGE, aerophoneChart } from "@repo/music-core/engines/aerophone-fingering";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
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
  import AerophoneFingering from "../../_components/AerophoneFingering.svelte";
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
  const startLabel = $derived.by(() => {
    if (drillMode === "interval-landing") return "Start interval landing";
    if (drillMode === "articulation") return "Start articulation drill";
    return drillMode === "swell" ? "Start dynamic swell" : "Start long tone";
  });
  const cancelLabel = $derived(
    drillMode === "interval-landing"
      ? "Cancel interval landing"
      : drillMode === "articulation"
      ? "Cancel articulation drill"
      : drillMode === "swell"
        ? "Cancel dynamic swell"
        : "Cancel long tone",
  );
  const swellEnvelopeBars = [24, 56, 92, 56, 24];
  const articulationSteps = $derived(
    Array.from({ length: articulationPrompt?.count ?? 8 }, (_, index) => index + 1),
  );
  const articulationTargetPercent = $derived(articulationStyle === "staccato" ? 35 : 95);
  const liveBreathWidth = $derived(`width: ${breathLevel}%`);
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
      status = "Ready for Aerophone breath practice.";
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
  <PracticeScreenHeader
    title="Aerophone Technique"
    subtitle="Build breath support, tongue clean articulations, and review sax-mode fingerings across the instrument."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · Aerophone" : "Waiting for Aerophone"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet summaryPhase()}
    {@const completedResult = summary?.results[0]}
    {@const completedArticulation = completedResult?.prompt && "style" in completedResult.prompt}
    {@const completedSwell = completedResult?.prompt && "durationMs" in completedResult.prompt}
    {@const completedInterval = completedResult?.prompt && "interval" in completedResult.prompt}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>
          {completedInterval
            ? "Interval landing"
            : completedArticulation
              ? "Articulation"
              : completedSwell
                ? "Dynamic swell"
                : "Long tone"} complete
        </Card.Description>
        <Card.Title>{summary?.xp ?? 0} XP</Card.Title>
      {/snippet}
      {#snippet children()}
        <p class="text-sm text-muted-foreground">
          {completedInterval
            ? Math.round((completedResult?.result.score ?? 0) * 100)
            : completedArticulation
              ? Math.round((articulationAnswer?.articulationScore ?? 0) * 100)
              : completedSwell
                ? Math.round((completedResult?.result.score ?? 0) * 100)
                : Math.round((summary?.breathSteadiness ?? 0) * 100)}%
          {completedInterval
            ? "landing"
            : completedArticulation
              ? "articulation"
              : completedSwell
                ? "control"
                : "breath steadiness"} ·
          {Math.round((summary?.noteAccuracy ?? 0) * 100)}% pitch accuracy
        </p>
        <p class="text-sm text-muted-foreground">
          {completedResult?.result.feedback[0]?.message}
        </p>
        {#if summaryDimensions.length > 0}
          <div class="grid gap-2" aria-label="Summary dimensions">
            <p class="text-xs font-semibold uppercase text-muted-foreground">Summary dimensions</p>
            <div class="grid gap-2 sm:grid-cols-4">
              {#each summaryDimensions as dimension (dimension.label)}
                <div class="grid gap-1 rounded-md border bg-background/70 p-3">
                  <span class="text-xs font-medium text-muted-foreground">{dimension.label}</span>
                  <span class="text-lg font-semibold tabular-nums">{dimension.value}</span>
                  <span class="text-xs text-muted-foreground">{dimension.detail}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
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
          <AdaptiveRetryBar
            onRetry={() => void startDrill()}
            retryLabel={completedInterval
              ? "Repeat interval landing"
              : completedSwell
                ? "Repeat swell"
                : "Repeat long tone"}
          />
        {/if}
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-6">
        <section class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card.Root>
            <Card.Content class="flex flex-col items-center gap-4 py-6">
              <div class="flex items-center gap-4">
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
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold {live
                    ? 'bg-success/15 text-success'
                    : 'bg-muted text-muted-foreground'}"
                >
                  <span class="size-1.5 rounded-full {live ? 'bg-success' : 'bg-muted-foreground/50'}"></span>
                  {live ? "Live" : "Preview"}
                </span>
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
              </div>
              <AerophoneFingering midi={selected} size={170} />
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
              <div class="space-y-1 outline-none" tabindex="-1" bind:this={setupHeading}>
                <Card.Description>Breath CC2 · MIDI</Card.Description>
                <Card.Title>{trainerTitle}</Card.Title>
              </div>
              <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
                {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
              </Button>
            </Card.Header>
            <Card.Content class="grid gap-6">
              <SegmentedControl
                ariaLabel="Aerophone drill"
                options={drillModes}
                value={drillMode}
                onChange={selectDrillMode}
              />

              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">Target {targetLabel}</p>
                  {#if drillMode === "interval-landing"}
                    <p class="text-xs text-muted-foreground">Landing {intervalTargetLabel}</p>
                  {/if}
                  <p class="text-xs text-muted-foreground" aria-live="polite">{midiStatus}</p>
                </div>
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
                {:else if drillMode === "articulation"}
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <SegmentedControl
                      ariaLabel="Articulation style"
                      options={styleOptions}
                      value={articulationStyle}
                      onChange={(value) => (articulationStyle = value as ArticulationStyle)}
                      size="sm"
                    />
                    <p aria-label="Articulation tempo" class="flex h-9 items-center rounded-md border px-3 text-sm">
                      {articulationBpm} BPM
                    </p>
                  </div>
                {:else}
                  <SegmentedControl ariaLabel="Drill duration" options={durationOptions} bind:value={durationMs} size="sm" />
                {/if}
              </div>
            </Card.Content>
            <Card.Footer class="flex-wrap gap-3">
              <Button type="button" disabled={!ready || pending} onclick={startDrill}>
                {pending ? "Starting..." : startLabel}
              </Button>
              <p class="text-sm text-muted-foreground">{status}</p>
            </Card.Footer>
          </Card.Root>
        </section>

        <Card.Root>
          <Card.Header>
            <Card.Title>Fingering chart</Card.Title>
            <Card.Description>
              {midiToNote(AEROPHONE_RANGE.lowestMidi)} – {midiToNote(AEROPHONE_RANGE.highestMidi)}.
              Tap a note to focus it or set the next long-tone target.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
              {#each chart as fingering (fingering.midi)}
                <button
                  type="button"
                  aria-label={`${midiToNote(fingering.midi)} fingering`}
                  aria-pressed={fingering.midi === selected}
                  onclick={() => {
                    select(fingering.midi);
                    if (runtime.audioEnabled) runtime.sound.playNote(fingering.midi, 0.4);
                  }}
                  class="flex flex-col items-center rounded-xl border p-1.5 transition-colors hover:bg-muted/60 {fingering.midi === selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border'}"
                >
                  <AerophoneFingering midi={fingering.midi} size={84} />
                </button>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/snippet}

    {#snippet stage()}
      <Card.Root>
        <Card.Header>
          <Card.Description>Breath CC2 · MIDI</Card.Description>
          <h2 class="text-2xl font-bold tracking-tight outline-none" tabindex="-1" bind:this={activeHeading}>
            {trainerTitle}
          </h2>
          <Card.Description>Target {targetLabel}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-6">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HudTile label="Target" value={targetLabel} tone="accent" />
            <HudTile label="Breath" value={breathLevel} unit="%" />
            {#if drillMode === "interval-landing"}
              <HudTile label="Drone" value={targetLabel} />
              <HudTile label="Landing" value={intervalTargetLabel} tone="good" />
            {:else if drillMode === "articulation"}
              <HudTile label="Notes" value={completedNotes} unit={`/${articulationPrompt?.count ?? 8}`} tone="good" />
              <HudTile label="Style" value={articulationStyle === "staccato" ? "Staccato" : "Legato"} />
            {:else}
              <HudTile label={controlLabel} value={liveControl} unit="%" tone="good" />
              <HudTile label="Hold" value={liveProgress} unit="%" />
            {/if}
          </div>

          <div class="grid gap-4 rounded-lg border bg-muted/20 p-4" aria-label="Aerophone technique stage">
            {#if drillMode === "interval-landing"}
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase text-muted-foreground">Drone interval lane</p>
                  <h3 class="text-base font-semibold">Land the interval against the drone</h3>
                </div>
                <span class="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">{Number(durationMs) / 1000}s hold</span>
              </div>
              <div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div class="grid gap-2 rounded-md border bg-background p-3">
                  <span class="text-xs font-semibold text-muted-foreground">Drone</span>
                  <span class="text-lg font-semibold">{targetLabel}</span>
                </div>
                <div class="text-center text-xs font-semibold uppercase text-muted-foreground">{intervalDefinition?.label ?? "Perfect fifth"}</div>
                <div class="grid gap-2 rounded-md border bg-background p-3">
                  <span class="text-xs font-semibold text-muted-foreground">Landing</span>
                  <span class="text-lg font-semibold">{intervalTargetLabel}</span>
                </div>
              </div>
              <div class="grid gap-1">
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Live breath pressure</span>
                  <span class="tabular-nums">{breathLevel}%</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-background"><div class="h-full rounded-full bg-success" style={liveBreathWidth}></div></div>
              </div>
            {:else if drillMode === "swell"}
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase text-muted-foreground">Swell envelope</p>
                  <h3 class="text-base font-semibold">Target CC2 envelope</h3>
                </div>
                <span class="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">{Number(durationMs) / 1000}s</span>
              </div>
              <div class="grid gap-3">
                <div class="grid h-28 grid-cols-5 items-end gap-2" aria-label="Target CC2 envelope">
                  {#each swellEnvelopeBars as level, index (index)}
                    <div class="flex h-full flex-col justify-end gap-1">
                      <div class="rounded-t-md bg-primary/80" style={`height: ${level}%`} aria-hidden="true"></div>
                      <span class="text-center text-[10px] font-medium text-muted-foreground">{index === 2 ? "Peak" : index < 2 ? "Rise" : "Fall"}</span>
                    </div>
                  {/each}
                </div>
                <div class="grid gap-1" aria-label="Actual CC2 envelope">
                  <div class="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Actual CC2 envelope</span>
                    <span class="tabular-nums">{breathLevel}% live</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-background"><div class="h-full rounded-full bg-success" style={liveBreathWidth}></div></div>
                </div>
              </div>
            {:else if drillMode === "articulation"}
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase text-muted-foreground">Articulation attack grid</p>
                  <h3 class="text-base font-semibold">Duration markers</h3>
                </div>
                <span class="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">{articulationTargetPercent}% beat target</span>
              </div>
              <div class="grid gap-3">
                <div class="grid gap-2" style={`grid-template-columns: repeat(${articulationSteps.length}, minmax(0, 1fr));`}>
                  {#each articulationSteps as step (step)}
                    <div class="grid gap-1">
                      <div class="h-12 rounded-md border bg-background p-1">
                        <div class="h-full rounded bg-primary/75" style={`width: ${articulationTargetPercent}%`} aria-hidden="true"></div>
                      </div>
                      <span class="text-center text-[10px] font-medium text-muted-foreground">{step}</span>
                    </div>
                  {/each}
                </div>
                <div class="grid gap-1" aria-label="Breath starts">
                  <div class="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Breath starts</span>
                    <span>{articulationStyle === "staccato" ? "Detached attacks" : "Connected airflow"}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-background"><div class="h-full rounded-full bg-success" style={liveBreathWidth}></div></div>
                </div>
              </div>
            {:else}
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase text-muted-foreground">Long-tone stage</p>
                  <h3 class="text-base font-semibold">Pitch lane</h3>
                </div>
                <span class="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">{Number(durationMs) / 1000}s hold</span>
              </div>
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="grid gap-2 rounded-md border bg-background p-3">
                  <span class="text-xs font-semibold text-muted-foreground">Pitch lane</span>
                  <span class="text-lg font-semibold">{targetLabel}</span>
                </div>
                <div class="grid gap-2 rounded-md border bg-background p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-muted-foreground">Breath steadiness</span>
                    <span class="text-xs tabular-nums text-muted-foreground">{breathLevel}%</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-success" style={liveBreathWidth}></div></div>
                </div>
                <div class="grid gap-2 rounded-md border bg-background p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-muted-foreground">Hold timer</span>
                    <span class="text-xs tabular-nums text-muted-foreground">{liveProgress}%</span>
                  </div>
                  <Progress value={liveProgress} max={100} />
                </div>
              </div>
            {/if}
          </div>

          {#if activePrompt}
            <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium">{activePrompt.label}</span>
                <span class="tabular-nums text-muted-foreground">
                  {#if articulationPrompt}{completedNotes}/{articulationPrompt.count}{:else}{liveProgress}%{/if}
                </span>
              </div>
              {#if articulationPrompt}<Progress value={completedNotes} max={articulationPrompt.count} />{:else}<Progress value={liveProgress} max={100} />{/if}
              {#if swellPrompt}
                <div class="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                  <span class="rounded-md border bg-background px-2 py-1.5">Soft</span>
                  <span class="rounded-md border bg-primary/10 px-2 py-1.5 text-primary">Loud</span>
                  <span class="rounded-md border bg-background px-2 py-1.5">Soft</span>
                </div>
              {/if}
              <div class="grid gap-2">
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Live breath pressure</span><span class="tabular-nums">{breathLevel}%</span>
                </div>
                <Progress value={breathLevel} max={100} />
              </div>
            </div>
          {/if}

          {#if drillMode === "articulation"}
            <div class="grid gap-3 rounded-md border border-dashed bg-muted/20 p-3">
              <p class="text-xs text-muted-foreground">
                Articulation grading reads note length and breath (CC2), so a wind controller
                scores it fully. On-screen taps complete the pitch dimension only.
              </p>
              <AerophoneInput
                router={runtime.router}
                {targetMidi}
                currentMidi={live ? selected : undefined}
                onAccepted={playAccepted}
              />
            </div>
          {/if}

          <p class="text-sm text-muted-foreground">{status}</p>
        </Card.Content>
      </Card.Root>
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancelDrill}>{cancelLabel}</Button>
    {/snippet}

    {#snippet rail()}
      <Card.Root>
        <Card.Header>
          <Card.Description>Current fingering</Card.Description>
          <Card.Title>{targetLabel}</Card.Title>
        </Card.Header>
        <Card.Content class="flex justify-center py-6">
          <AerophoneFingering midi={targetMidi} size={170} />
        </Card.Content>
      </Card.Root>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
