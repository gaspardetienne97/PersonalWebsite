<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick, untrack } from "svelte";

  import Circle from "lucide-svelte/icons/circle";
  import Drum from "lucide-svelte/icons/drum";
  import Gauge from "lucide-svelte/icons/gauge";
  import Guitar from "lucide-svelte/icons/guitar";
  import Hand from "lucide-svelte/icons/hand";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Mic from "lucide-svelte/icons/mic";
  import Save from "lucide-svelte/icons/save";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import Square from "lucide-svelte/icons/square";
  import Wind from "lucide-svelte/icons/wind";

  import {
    monotonicMs,
    unixMs,
    type InputSource,
    type InstrumentId,
    type NoteEvent,
    type UnixMs,
  } from "@repo/music-core/domain";
  import {
    applyPlaybackGain,
    AudioTakeRecorder,
    closePlaybackContext,
    releasePlaybackGain,
    createTakeEnvelopeCache,
    type AudioTakeRecording,
  } from "@repo/music-core/engines/audio-recording";
  import {
    BackingTrackEngine,
    type BackingSelection,
    type BackingTrackPlaybackAdapter,
    type BackingTrackState,
  } from "@repo/music-core/engines/backing-track";
  import { BrowserBackingPlayer } from "@repo/music-core/engines/backing-track/browser-player";
  import {
    FreePracticeSession,
    type FreePracticeResult,
    type FreePracticeState,
  } from "@repo/music-core/engines/free-practice";
  import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";
  import type { MediaUsage } from "@repo/music-core/engines/media-library";
  import type { Take } from "@repo/music-core/engines/recording";
  import type { AudioTakeRow, ImportedBackingTrackRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { toast } from "@repo/ui/sonner";

  import AudioTakePanel from "../_components/AudioTakePanel.svelte";
  import BackingTrackPanel from "../_components/BackingTrackPanel.svelte";
  import InputSurface from "../_components/InputSurface.svelte";
  import MidiTakeReviewPanel from "../_components/MidiTakeReviewPanel.svelte";
  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { syncRouteQuery } from "../_components/route-state";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import { useTakeRecorder } from "../_components/take-recorder.svelte";
  import { useMusicRuntime, type MusicRuntime, type PracticeCaptureEntry } from "../_runtime.svelte";
  import { PIANO_ROLL_PENDING_TAKE_IMPORT_ID } from "../create/_components/piano-roll-storage";

  const PRACTICE_LAB_TAKE_PREFIX = "Practice Lab take";

  interface StartBoundary {
    wallClock: UnixMs;
    monotonic: ReturnType<typeof monotonicMs>;
  }

  let {
    runtime = useMusicRuntime(),
    navigateToCreate = defaultNavigateToCreate,
  }: {
    runtime?: MusicRuntime;
    navigateToCreate?: (href: string) => void | Promise<void>;
  } = $props();

  let instrument = $state<InstrumentId>(initialInstrument());
  let surface = $state(initialSurface());
  let monitor = $state(true);
  let recording = $state(false);
  let saving = $state(false);
  let statusMessage = $state("Ready for free practice.");
  let saveError = $state("");
  let failedCapture = $state<PracticeCaptureEntry | undefined>();
  let activeSession = $state<FreePracticeSession | undefined>();
  let activeState = $state<FreePracticeState | undefined>();
  let lastResult = $state<FreePracticeResult | undefined>();
  let startBoundary = $state<StartBoundary | undefined>();
  let importedTracks = $state<ImportedBackingTrackRow[]>([]);
  let takes = $state<AudioTakeRow[]>([]);
  let selectedTake = $state<AudioTakeRow | undefined>();
  let mediaUsage = $state<MediaUsage | undefined>();
  let unsavedTake = $state<AudioTakeRecording | undefined>();
  let performanceVolume = $state(1);
  let backingReviewVolume = $state(0.75);
  let micRequested = $state(false);
  let micArmed = $state(false);
  let microphonePreparation: Promise<boolean> | undefined;
  let microphonePreparationGeneration = 0;
  let recordingPending = $state(false);
  let audioDevices = $state<MediaDeviceInfo[]>([]);
  let takeUrl = $state<string | undefined>();
  let reviewAudio = $state<HTMLAudioElement | undefined>();
  let playingAudioTakeId = $state<string | undefined>();
  let reviewGeneration = 0;
  let generatedPlaybackGeneration = 0;
  let mediaLoadGeneration = 0;
  let backingPending = false;
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  const initialUrlBpm = browser
    ? Number(new URLSearchParams(window.location.search).get("bpm")) || undefined
    : undefined;

  const audioRecorder = new AudioTakeRecorder();
  // The MIDI take list is shared with /music/record: a take captured here is
  // already on that page's list, and a take recorded there shows up here.
  const takeRecorder = untrack(() => useTakeRecorder(runtime));
  const midiTakes = $derived(takeRecorder.midiTakes);
  const selectedMidiTake = $derived(takeRecorder.selectedMidiTake);
  const playingMidiTakeId = $derived(takeRecorder.playingMidiTakeId);
  const takeEnvelope = createTakeEnvelopeCache((id) => loadTakeBlob(id));
  let recorderState = $state(audioRecorder.state);
  let backingPlayer: BrowserBackingPlayer | undefined;
  const backingEngine = new BackingTrackEngine(createBackingAdapter());
  let backingState = $state<BackingTrackState>(backingEngine.state);

  const noteCount = $derived(activeState?.noteCount ?? lastResult?.noteCount ?? 0);
  const distinctNoteCount = $derived(activeState?.distinctNoteCount ?? lastResult?.distinctNoteCount ?? 0);
  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );
  const canChangeSetup = $derived(!recording && !recordingPending && !saving);
  // AudioTakePanel draws the recorder's own error but does not announce it; this
  // route's one live region does.
  const attentionMessage = $derived(saveError || recorderState.message || "");

  const unsubscribeRouter = subscribeRouter();
  const unsubscribeBacking = backingEngine.subscribe((state) => {
    backingState = state;
  });
  const unsubscribeRecorder = audioRecorder.subscribe((state) => {
    recorderState = state;
  });

  $effect(() => {
    const mediaVolume = runtime.mediaVolume;
    backingPlayer?.syncMediaVolume();
    if (reviewAudio) reviewAudio.volume = performanceVolume * mediaVolume;
  });

  $effect(() => {
    registerRecordingContext(instrument, micRequested);
  });

  function initialInstrument(): InstrumentId {
    return runtime.activeInstrument;
  }

  function initialSurface() {
    return runtime.surfaceFor(runtime.activeInstrument);
  }

  function subscribeRouter(): () => void {
    return runtime.router.subscribe((event) => {
      if (event.type !== "noteOn") return;
      if (monitor && runtime.audioEnabled) {
        runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
      }
      if (!activeSession || !recording) return;
      activeSession.accept(event);
      takeRecorder.capture(event);
      activeState = activeSession.state;
    });
  }

  onMount(async () => {
    await loadAudioDevices();
  });

  $effect(() => {
    const media = runtime.media;
    let active = true;
    if (media) {
      void takeRecorder.loadMidi();
      void loadMedia(media).catch((error) => {
        if (active) saveError = error instanceof Error ? error.message : "Saved media could not be loaded.";
      });
    }
    return () => {
      active = false;
      mediaLoadGeneration += 1;
    };
  });

  onDestroy(() => {
    microphonePreparationGeneration += 1;
    invalidateBackingActivation();
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    unsubscribeRouter();
    unsubscribeBacking();
    unsubscribeRecorder();
    backingEngine.dispose();
    // Stops shared take playback and clears the shared message, so an error
    // raised here does not greet /music/record.
    takeRecorder.release();
    void audioRecorder.dispose();
    stopTake();
    void closePlaybackContext();
  });

  async function loadMedia(media = runtime.media): Promise<void> {
    const generation = ++mediaLoadGeneration;
    if (!media) return;
    const [tracks, storedTakes, usage] = await Promise.all([
      media.listBackings(),
      media.listTakes(),
      media.usage(),
    ]);
    if (generation !== mediaLoadGeneration || media !== runtime.media) return;
    importedTracks = tracks;
    takes = storedTakes;
    selectedTake = selectedTake
      ? (takes.find((take) => take.id === selectedTake?.id) ?? takes[0])
      : takes[0];
    mediaUsage = usage;
  }

  async function loadAudioDevices(
    generation = microphonePreparationGeneration,
  ): Promise<void> {
    try {
      const devices = await audioRecorder.devices();
      if (generation === microphonePreparationGeneration) audioDevices = devices;
    } catch {
      if (generation === microphonePreparationGeneration) audioDevices = [];
    }
  }

  async function startRecording(): Promise<void> {
    if (recording || recordingPending || saving) return;
    recordingPending = true;
    stopTake();
    stopMidiTake();
    saveError = "";
    failedCapture = undefined;
    lastResult = undefined;
    try {
      if (!(await requestedMicrophoneReady())) return;
      await tick();
      const contextRequest = practiceContextRequest;
      await practiceContextQueue;
      if (contextRequest !== practiceContextRequest) return;
      runtime.endPerformance();
      if (!(await runtime.ensurePlaybackVoice())) {
        statusMessage = runtime.audioMessage || "Playback voice unavailable.";
        return;
      }
      if (contextRequest !== practiceContextRequest) return;

      statusMessage = runtime.countInBars > 0 ? "Counting in..." : "Starting recording...";
      const clock = await runtime.beginPerformance();
      if (contextRequest !== practiceContextRequest) {
        runtime.endPerformance();
        return;
      }
      if (clock.status === "cancelled") {
        statusMessage = "Ready for free practice.";
        return;
      }
      if (clock.status === "failed") {
        runtime.endPerformance();
        statusMessage = clock.message;
        return;
      }

      const boundary = { wallClock: unixMs(Date.now()), monotonic: clock.downbeat };
      const id = `practice-lab-${boundary.wallClock}`;
      try {
        if (micArmed) {
          audioRecorder.start({ id: `${id}-take`, startedAtMonotonic: Number(clock.downbeat) });
        }
        const session = new FreePracticeSession({
          id,
          instrument,
          startedAt: boundary.wallClock,
          startedAtMonotonic: clock.downbeat,
        });
        takeRecorder.startMidi(Number(clock.downbeat));
        startBoundary = boundary;
        activeSession = session;
        activeState = session.state;
        recording = true;
        statusMessage = "Recording.";
      } catch (error) {
        runtime.endPerformance();
        invalidateBackingActivation();
        backingEngine.pause();
        if (audioRecorder.state.status === "recording") await audioRecorder.cancel();
        statusMessage = error instanceof Error ? error.message : "Recording could not start.";
        return;
      }

      if (backingState.selection.kind !== "none") {
        void backingEngine.play().catch((error) => {
          saveError = error instanceof Error ? error.message : "Backing playback failed.";
        });
      }
    } finally {
      recordingPending = false;
    }
  }

  async function stopRecording(): Promise<void> {
    const session = activeSession;
    const boundary = boundaryNow();
    if (!session || !recording || !startBoundary) return;

    runtime.endPerformance();
    recording = false;
    saving = true;
    invalidateBackingActivation();
    backingEngine.pause();
    let audioTake: AudioTakeRecording | undefined;
    try {
      if (recorderState.status === "recording") {
        audioTake = await audioRecorder.stop(Number(boundary.monotonic));
      }
    } catch (error) {
      unsavedTake = undefined;
      saveError = error instanceof Error ? error.message : "Audio take could not be stopped.";
    }

    const result = session.stop(boundary.wallClock);
    takeRecorder.stopMidi(Number(boundary.monotonic), {
      // The list is shared with /music/record now, so count only this page's own
      // takes — otherwise a session that starts after three Record takes opens
      // at "Practice Lab take 4".
      name: `Practice Lab take ${midiTakes.filter((take) => take.name.startsWith(PRACTICE_LAB_TAKE_PREFIX)).length + 1}`,
      discardEmpty: true,
    });
    activeSession = undefined;
    activeState = undefined;
    lastResult = result;

    try {
      await persistResult(result, audioTake);
      if (result.noteCount > 0 && !saveError) {
        statusMessage = "Saved to practice journal.";
        toast.success("Saved to practice journal");
      } else {
        statusMessage = result.noteCount > 0 ? "Saved to practice journal." : "Nothing to save yet.";
      }
    } finally {
      saving = false;
    }
  }

  async function persistResult(result: FreePracticeResult, audioTake?: AudioTakeRecording): Promise<void> {
    if (result.noteCount === 0 && !audioTake) return;
    const capture = captureEntry(result);
    try {
      await runtime.recordPractice(capture);
      failedCapture = undefined;
      saveError = "";
      if (audioTake) await saveAudioTake(result, audioTake);
      await loadMedia();
    } catch (error) {
      failedCapture = capture;
      unsavedTake = audioTake;
      saveError = error instanceof Error ? error.message : "Practice capture could not be saved.";
    }
  }

  async function retrySave(): Promise<void> {
    if (!failedCapture) return;
    saving = true;
    try {
      await runtime.recordPractice(failedCapture);
      failedCapture = undefined;
      saveError = "";
      statusMessage = "Saved to practice journal.";
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Practice capture could not be saved.";
    } finally {
      saving = false;
    }
  }

  async function saveAudioTake(result: FreePracticeResult, recording: AudioTakeRecording): Promise<void> {
    if (!runtime.media) {
      unsavedTake = recording;
      return;
    }
    const row: AudioTakeRow = {
      id: recording.id,
      name: `Practice Lab ${new Date(Number(result.startedAt)).toLocaleString()}`,
      mimeType: recording.mimeType,
      size: recording.size,
      durationMs: recording.durationMs,
      createdAt: result.endedAt,
      instrument: result.instrument,
      backingOffsetMs: 0,
      ...takeBackingReference(backingState.selection),
    };
    await runtime.media.saveTake(row, recording.blob);
    unsavedTake = undefined;
  }

  function captureEntry(result: FreePracticeResult): PracticeCaptureEntry {
    return {
      id: result.id,
      source: "free-practice",
      instrument: result.instrument,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      tags: ["practice-lab", result.instrument],
      xpEarned: Math.min(25, Math.max(0, result.noteCount)),
      note: summary(result),
    };
  }

  async function armMicrophone(deviceId?: string): Promise<void> {
    if (!canChangeSetup) return;
    const generation = ++microphonePreparationGeneration;
    micRequested = true;
    micArmed = false;
    const preparation = (async () => {
      try {
        await audioRecorder.prepare(deviceId);
        if (generation !== microphonePreparationGeneration || !micRequested) return false;
        micArmed = true;
        saveError = "";
        void loadAudioDevices(generation);
        return true;
      } catch (error) {
        if (generation === microphonePreparationGeneration) {
          micRequested = false;
          saveError = error instanceof Error ? error.message : "Microphone could not be armed.";
        }
        return false;
      }
    })();
    microphonePreparation = preparation;
    await preparation;
    if (microphonePreparation === preparation) microphonePreparation = undefined;
  }

  async function disarmMicrophone(): Promise<void> {
    if (!canChangeSetup) return;
    microphonePreparationGeneration += 1;
    micRequested = false;
    micArmed = false;
    await audioRecorder.cancel();
  }

  async function requestedMicrophoneReady(): Promise<boolean> {
    while (micRequested && !micArmed) {
      const preparation = microphonePreparation;
      if (!preparation) {
        saveError = "Microphone preparation did not complete.";
        return false;
      }
      const ready = await preparation;
      if (preparation !== microphonePreparation && micRequested) continue;
      return ready && micRequested && micArmed;
    }
    return !micRequested || micArmed;
  }

  async function importBacking(file: File): Promise<void> {
    if (!runtime.media) {
      saveError = "Local media storage is still loading.";
      return;
    }
    try {
      const durationMs = await audioDuration(file);
      const row: ImportedBackingTrackRow = {
        id: `backing-${Date.now()}`,
        name: file.name,
        mimeType: file.type || "audio/mpeg",
        size: file.size,
        durationMs,
        createdAt: unixMs(Date.now()),
      };
      await runtime.media.saveBacking(row, file);
      await loadMedia();
      invalidateBackingActivation();
      backingEngine.selectImported(row, { loop: true });
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Backing track could not be imported.";
    }
  }

  async function playBacking(): Promise<void> {
    if (backingPending) return;
    stopMidiTake();
    stopTake();
    const generation = generatedPlaybackGeneration;
    backingPending = true;
    saveError = "";
    const selection = backingState.selection;
    const selectionSnapshot = JSON.stringify(selection);
    try {
      const enabled =
        selection.kind === "generated"
          ? await runtime.ensurePlaybackVoice()
          : await runtime.enableAudio();
      if (!enabled) {
        if (generation === generatedPlaybackGeneration) {
          saveError = runtime.audioMessage || "Backing playback could not be enabled.";
        }
        return;
      }
      if (
        generation !== generatedPlaybackGeneration ||
        selectionSnapshot !== JSON.stringify(backingState.selection)
      )
        return;
      await backingEngine.play();
      if (
        generation !== generatedPlaybackGeneration ||
        selectionSnapshot !== JSON.stringify(backingState.selection)
      )
        backingEngine.stop();
    } catch (error) {
      if (generation === generatedPlaybackGeneration) {
        saveError = error instanceof Error ? error.message : "Backing playback failed.";
      }
    } finally {
      backingPending = false;
    }
  }

  function audioDuration(file: File): Promise<number> {
    if (!browser) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Math.max(0, Math.round((audio.duration || 0) * 1_000)));
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read backing track duration."));
      };
      audio.src = url;
    });
  }

  function invalidateBackingActivation(): void {
    generatedPlaybackGeneration += 1;
  }

  async function deleteBacking(track: ImportedBackingTrackRow): Promise<void> {
    await runtime.media?.deleteBacking(track.id, { orphanTakes: true });
    await loadMedia();
  }

  async function deleteTake(take: AudioTakeRow): Promise<void> {
    await runtime.media?.deleteTake(take.id);
    await loadMedia();
  }

  async function retryTakeSave(recording: AudioTakeRecording): Promise<void> {
    const result = lastResult;
    if (!result) return;
    saving = true;
    try {
      await saveAudioTake(result, recording);
      await loadMedia();
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Audio take could not be saved.";
    } finally {
      saving = false;
    }
  }

  async function playTake(take: AudioTakeRow): Promise<void> {
    if (!runtime.media || !browser) return;
    stopMidiTake();
    stopTake();
    const generation = reviewGeneration;
    try {
      if (!runtime.audioEnabled && !(await runtime.enableAudio())) {
        saveError = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      const blob = await runtime.media.takeBlob(take.id);
      if (generation !== reviewGeneration) return;
      if (!blob) throw new Error("Practice take audio is unavailable.");
      takeUrl = URL.createObjectURL(blob);
      const audio = new Audio(takeUrl);
      applyPlaybackGain(audio, take.gainDb ?? 0);
      reviewAudio = audio;
      playingAudioTakeId = take.id;
      audio.volume = performanceVolume * runtime.mediaVolume;
      audio.onended = () => finishTake(generation);
      audio.onerror = () => failTake(generation, "Practice take playback failed.");
      await audio.play();
    } catch (error) {
      if (generation !== reviewGeneration) return;
      failTake(generation, error instanceof Error ? error.message : "Practice take playback failed.");
    }
  }

  async function toggleMidiTake(take: Take): Promise<void> {
    if (playingMidiTakeId !== take.id) {
      invalidateBackingActivation();
      backingEngine.pause();
      stopTake();
      saveError = "";
    }
    await takeRecorder.toggleMidiTake(take);
    if (takeRecorder.message) saveError = takeRecorder.message;
  }

  function stopMidiTake(): void {
    takeRecorder.stopMidiPlayback();
  }

  function renameMidiTake(take: Take, name: string): void {
    takeRecorder.renameMidiTake(take, name);
  }

  function noteMidiTake(take: Take, note: string): void {
    takeRecorder.noteMidiTake(take, note);
  }

  async function updateAudioTake(
    take: AudioTakeRow,
    patch: { name?: string; note?: string; gainDb?: number },
  ): Promise<void> {
    if (!runtime.media) return;
    try {
      // The library returns the stored row, so one card refreshes without reloading the list.
      const updated = await runtime.media.updateTake(take.id, patch);
      takes = takes.map((row) => (row.id === updated.id ? updated : row));
      if (selectedTake?.id === updated.id) selectedTake = updated;
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Practice take could not be updated.";
    }
  }

  function selectMidiTake(take: Take): void {
    takeRecorder.selectMidiTake(take);
  }

  function deleteMidiTake(take: Take): void {
    takeRecorder.removeMidiTake(take.id);
  }

  function practiceMidiTake(take: Take): void {
    takeRecorder.practiceMidiTake(take);
    statusMessage = `Reviewing ${take.name}. Replay it, then record a cleaner pass.`;
  }

  async function openMidiTakeInPianoRoll(take: Take): Promise<void> {
    stopMidiTake();
    try {
      await runtime.writeLocalState(PIANO_ROLL_PENDING_TAKE_IMPORT_ID, {
        take,
        bpm: runtime.transportBpm,
      });
      statusMessage = `Sent ${take.name} to Piano Roll.`;
      await navigateToCreate("/music/create?mode=piano-roll&source=practice-lab-take");
    } catch (error) {
      saveError = error instanceof Error ? error.message : "MIDI take could not be opened in Piano Roll.";
    }
  }

  async function loadTakeBlob(id: string): Promise<Blob | undefined> {
    return runtime.media?.takeBlob(id);
  }

  function downloadTake(take: AudioTakeRow): void {
    void runtime.media?.takeBlob(take.id).then((blob) => {
      if (!blob || !browser) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = take.name;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function revokeTakeUrl(): void {
    if (takeUrl && browser) URL.revokeObjectURL(takeUrl);
    takeUrl = undefined;
  }

  function stopTake(): void {
    reviewGeneration += 1;
    reviewAudio?.pause();
    releasePlaybackGain(reviewAudio);
    reviewAudio = undefined;
    playingAudioTakeId = undefined;
    revokeTakeUrl();
  }

  function finishTake(generation: number): void {
    if (generation !== reviewGeneration) return;
    releasePlaybackGain(reviewAudio);
    reviewAudio = undefined;
    playingAudioTakeId = undefined;
    revokeTakeUrl();
  }

  function failTake(generation: number, message: string): void {
    if (generation !== reviewGeneration) return;
    stopTake();
    saveError = message;
  }

  function defaultNavigateToCreate(href: string): void {
    if (browser) window.location.assign(href);
  }

  function boundaryNow(): StartBoundary {
    return {
      wallClock: unixMs(Date.now()),
      monotonic: monotonicMs(performance.now()),
    };
  }

  function handleInputSurface(value: typeof surface): void {
    surface = value;
    void runtime.setInputSurface(instrument, value);
  }

  function handleInstrument(event: Event): void {
    instrument = (event.currentTarget as HTMLSelectElement).value as InstrumentId;
    runtime.setActiveInstrument(instrument);
    surface = runtime.surfaceFor(instrument);
  }

  function registerRecordingContext(nextInstrument: InstrumentId, audio: boolean): void {
    const request = ++practiceContextRequest;
    practiceContextQueue = practiceContextQueue.then(async () => {
      if (request !== practiceContextRequest) return;
      const cleanup = await runtime.registerPracticeContext({
        owner: "practice-lab-recording",
        variantKey: `v1:recording:${nextInstrument}:${audio ? "midi-audio" : "midi"}`,
        defaultBpm: 96,
        initialUrlBpm,
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: ["piano", "guitar", "ukulele", "mpc", "aerophone"],
        onBpmChange: syncPracticeBpm,
        onInstrumentChange: (next) => {
          instrument = next;
          surface = runtime.surfaceFor(next);
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

  function syncPracticeBpm(bpm: number): void {
    if (!browser) return;
    const url = new URL(window.location.href);
    url.searchParams.set("bpm", String(bpm));
    syncRouteQuery(`${url.pathname}${url.search}${url.hash}`);
  }

  function summary(result: FreePracticeResult): string {
    const seconds = (result.durationMs / 1_000).toFixed(1);
    return `${seconds}s · ${result.noteCount} notes · ${result.distinctNoteCount} distinct · ${rangeLabel(
      result,
    )} · ${sourceSummary(result.sourceCounts)}`;
  }

  function rangeLabel(result: FreePracticeResult): string {
    if (result.lowestMidiNote === undefined || result.highestMidiNote === undefined) return "no range";
    if (result.lowestMidiNote === result.highestMidiNote) return `MIDI ${result.lowestMidiNote}`;
    return `MIDI ${result.lowestMidiNote}-${result.highestMidiNote}`;
  }

  function sourceSummary(counts: Partial<Record<InputSource, number>>): string {
    const entries = Object.entries(counts).filter(([, count]) => count > 0);
    if (entries.length === 0) return "no input";
    return entries.map(([source, count]) => `${count} ${source}`).join(", ");
  }

  function takeBackingReference(selection: BackingSelection): Partial<AudioTakeRow> {
    if (selection.kind === "generated") {
      return {
        backingKind: "generated",
        generatedBacking: {
          progressionId: selection.progressionId,
          bpm: selection.bpm,
          loop: selection.loop,
        },
      };
    }
    if (selection.kind === "imported") {
      return {
        backingKind: "imported",
        backingTrackId: selection.track.id,
      };
    }
    return {};
  }

  function createBackingAdapter(): BackingTrackPlaybackAdapter {
    if (browser) {
      backingPlayer = new BrowserBackingPlayer({
        sound: runtime.sound,
        loadBlob: (id) => runtime.media?.backingBlob(id) ?? Promise.resolve(undefined),
        mediaVolume: () => runtime.mediaVolume,
        onImportedPositionChange: (positionMs) => backingEngine.updateImportedPosition(positionMs),
        onImportedEnded: () => backingEngine.markEnded(),
        onImportedError: (message) => {
          saveError = message;
          backingEngine.stop();
        },
      });
      return backingPlayer;
    }
    return {
      playGenerated: async () => {},
      stopGenerated: () => {},
      loadImported: async (track) => track.durationMs,
      loadBuiltin: async () => 0,
      playImported: async () => {},
      pauseImported: () => {},
      stopImported: () => {},
      seekImported: () => {},
      setImportedLoop: () => {},
      setImportedVolume: () => {},
      dispose: () => {},
    };
  }
</script>

<svelte:head>
  <title>Practice Lab | Practice OS</title>
  <meta
    name="description"
    content="Capture free practice with MIDI or on-screen input, backing tracks, and synchronized dry audio takes."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Practice Lab"
    subtitle="Free-practice capture with live monitoring, backing tracks, and synchronized dry audio review."
  >
    {#snippet controls()}
      <SourceReadout label="Input" device={sourceLabel} live={runtime.activeSource === "midi"} />
      <Button
        type="button"
        variant={monitor ? "secondary" : "outline"}
        aria-label="Monitor"
        aria-pressed={monitor}
        onclick={() => (monitor = !monitor)}
      >
        Monitor
      </Button>
      <Button
        type="button"
        variant={recording ? "destructive" : "default"}
        disabled={saving || recordingPending}
        onclick={() => (recording ? void stopRecording() : void startRecording())}
      >
        {#if recording}
          <Square class="size-4 fill-current" aria-hidden="true" />
          Stop recording
        {:else}
          <Circle class="size-4 fill-current text-destructive" aria-hidden="true" />
          Start recording
        {/if}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <section id="practice-lab" class="grid min-w-0 gap-6" aria-label="Practice Lab workspace">
    <div class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="grid min-w-0 gap-6">
        <Card.Root class="min-w-0">
          <Card.Header>
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Card.Title>Live capture</Card.Title>
                <Card.Description>{statusMessage}</Card.Description>
              </div>
              <div class="flex items-center gap-2">
                <label class="grid gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Instrument
                  <select
                    class="h-9 rounded-md border bg-background px-3 text-sm normal-case tracking-normal"
                    value={instrument}
                    disabled={!canChangeSetup}
                    onchange={handleInstrument}
                  >
                    <option value="piano">Piano</option>
                    <option value="guitar">Guitar</option>
                    <option value="ukulele">Ukulele</option>
                    <option value="mpc">MPC</option>
                    <option value="aerophone">Aerophone</option>
                  </select>
                </label>
              </div>
            </div>
          </Card.Header>
          <Card.Content class="grid gap-5">
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-xl border bg-muted/20 p-4">
                <div class="text-3xl font-bold tabular-nums">{noteCount}</div>
                <div class="text-sm text-muted-foreground">{noteCount === 1 ? "note" : "notes"}</div>
              </div>
              <div class="rounded-xl border bg-muted/20 p-4">
                <div class="text-3xl font-bold tabular-nums">{distinctNoteCount}</div>
                <div class="text-sm text-muted-foreground">distinct</div>
              </div>
              <div class="rounded-xl border bg-muted/20 p-4">
                <div class="text-3xl font-bold tabular-nums">{runtime.transportBpm}</div>
                <div class="text-sm text-muted-foreground">bpm</div>
              </div>
            </div>

            <InputSurface
              router={runtime.router}
              instrument={instrument}
              bind:surface
              onAccepted={(event: NoteEvent) => {
                if (event.type === "noteOn" && monitor && runtime.audioEnabled) {
                  runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
                }
                void runtime.setInputSurface(instrument, surface);
              }}
            />
          </Card.Content>
        </Card.Root>

        {#if attentionMessage}
          <Card.Root
            class="border-destructive/30 bg-destructive/5"
            role="alert"
            aria-live="assertive"
          >
            <Card.Content class="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p class="text-sm font-semibold text-destructive">Practice needs attention</p>
                <p class="text-sm text-muted-foreground">{attentionMessage}</p>
              </div>
              {#if failedCapture}
                <Button type="button" aria-label="Retry save" disabled={saving} onclick={() => void retrySave()}>
                  <Save class="size-4" aria-hidden="true" />
                  Retry save
                </Button>
              {/if}
            </Card.Content>
          </Card.Root>
        {/if}
      </div>

      <aside class="grid min-w-0 content-start gap-6">
        <BackingTrackPanel
          state={backingState}
          progressions={JAM_PROGRESSIONS}
          {importedTracks}
          usage={mediaUsage}
          onSelectNone={() => {
            invalidateBackingActivation();
            backingEngine.selectNone();
          }}
          onSelectGenerated={(selection) => {
            invalidateBackingActivation();
            backingEngine.selectGenerated(selection);
          }}
          onSelectImported={(track, loop) => {
            invalidateBackingActivation();
            backingEngine.selectImported({ ...track }, { loop });
          }}
          onImport={importBacking}
          onPlay={playBacking}
          onPause={() => {
            invalidateBackingActivation();
            backingEngine.pause();
          }}
          onStop={() => {
            invalidateBackingActivation();
            backingEngine.stop();
          }}
          onSeek={(positionMs) => backingEngine.seek(positionMs)}
          onLoop={(loop) => backingEngine.setLoop(loop)}
          onVolume={(volume) => backingEngine.setVolume(volume)}
          onDeleteImported={deleteBacking}
        />
        <AudioTakePanel
          {recorderState}
          devices={audioDevices}
          armed={micArmed}
          {takes}
          {selectedTake}
          usage={mediaUsage}
          {performanceVolume}
          backingVolume={backingReviewVolume}
          {unsavedTake}
          playingTakeId={playingAudioTakeId}
          onArm={armMicrophone}
          onDisarm={disarmMicrophone}
          onDevice={(deviceId) => void armMicrophone(deviceId)}
          onSelectTake={(take) => (selectedTake = take)}
          onPlayTake={playTake}
          onPauseTake={() => stopTake()}
          onPerformanceVolume={(volume) => (performanceVolume = volume)}
          onBackingVolume={(volume) => {
            backingReviewVolume = volume;
            backingEngine.setVolume(volume);
          }}
          onDownloadTake={downloadTake}
          onDeleteTake={deleteTake}
          onRetrySave={retryTakeSave}
          onRenameTake={(take, name) => void updateAudioTake(take, { name })}
          onNoteTake={(take, note) => void updateAudioTake(take, { note })}
          onGainTake={(take, gainDb) => void updateAudioTake(take, { gainDb })}
          loadTakePeaks={takeEnvelope}
        />
        <MidiTakeReviewPanel
          takes={midiTakes}
          selectedTake={selectedMidiTake}
          playingTakeId={playingMidiTakeId}
          description="Review MIDI and on-screen takes alongside your audio capture."
          emptyLabel="Recorded MIDI takes will appear here after free practice."
          onSelectTake={selectMidiTake}
          onPlayTake={toggleMidiTake}
          onPauseTake={() => stopMidiTake()}
          onDeleteTake={deleteMidiTake}
          onPracticeTake={practiceMidiTake}
          onOpenInPianoRoll={openMidiTakeInPianoRoll}
          onRenameTake={renameMidiTake}
          onNoteTake={noteMidiTake}
        />
      </aside>
    </div>
  </section>

  <section class="grid gap-4 md:grid-cols-2" aria-label="Play tools">
    <MusicToolCard
      href="/music/play/scales"
      title="Scales & Technique"
      description="Play scale patterns with MIDI or on-screen input and unlock the next tempo when the run is clean."
      eyebrow="Play"
      meta="Technique"
      action="Start scale practice"
      icon={SlidersHorizontal}
      hue="technique"
    />
    <MusicToolCard
      href="/music/play/mpc"
      title="MPC Rudiments"
      description="Build alternating pad control with order, timing, and velocity feedback from MIDI or the on-screen grid."
      eyebrow="Play"
      meta="Pads"
      action="Start pad practice"
      icon={Drum}
      hue="mpc"
    />
    <MusicToolCard
      href="/music/play/spider"
      title="Spider Drill"
      description="Build guitar or ukulele fretting-hand independence with a graded chromatic 1-2-3-4 pattern."
      eyebrow="Play"
      meta="Strings"
      action="Start spider practice"
      icon={SlidersHorizontal}
      hue="guitar"
    />
    <MusicToolCard
      href="/music/play/chord-perfect"
      title="Chord-Perfect"
      description="Drill clean chord changes: fret a guitar or ukulele shape and sound each string low to high, graded note by note."
      eyebrow="Play"
      meta="Strings"
      action="Start chord-perfect"
      icon={Guitar}
      hue="harmony"
    />
    <MusicToolCard
      href="/music/play/two-hand"
      title="Two-Hand Independence"
      description="A graded piano drill: hold a steady left-hand pulse while the right hand runs a faster scale line."
      eyebrow="Play"
      meta="Piano"
      action="Start independence drill"
      icon={Hand}
      hue="piano"
    />
    <MusicToolCard
      href="/music/learn/aerophone?mode=articulation"
      title="Aerophone Articulation"
      description="Tongue a repeated note staccato or legato; graded on articulation from note length and breath (CC2) on a wind controller."
      eyebrow="Play"
      meta="Aerophone"
      action="Start articulation drill"
      icon={Wind}
      hue="aerophone"
    />
    <MusicToolCard
      href="/music/tuner"
      title="Tuner"
      description="Tune by ear with a live mic: nearest note, cents deviation, and a flat / in-tune / sharp meter."
      eyebrow="Play"
      meta="Intonation"
      action="Open tuner"
      icon={Gauge}
      hue="ear"
    />
    <MusicToolCard
      href="/music/library?tab=songs"
      title="Song Library"
      description="Reopen saved imported songs, replay them, and log repertoire practice into the journal."
      eyebrow="Play"
      meta="Repertoire"
      action="Open songs"
      icon={ListMusic}
      hue="reading"
    />
  </section>
</PracticeScreen>
