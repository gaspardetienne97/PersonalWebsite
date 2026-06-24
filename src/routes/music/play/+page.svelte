<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import AudioWaveform from "lucide-svelte/icons/audio-waveform";
  import Circle from "lucide-svelte/icons/circle";
  import Drum from "lucide-svelte/icons/drum";
  import Gauge from "lucide-svelte/icons/gauge";
  import Hand from "lucide-svelte/icons/hand";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Mic from "lucide-svelte/icons/mic";
  import Save from "lucide-svelte/icons/save";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import Square from "lucide-svelte/icons/square";

  import {
    monotonicMs,
    unixMs,
    type InputSource,
    type InstrumentId,
    type NoteEvent,
    type UnixMs,
  } from "@repo/music-core/domain";
  import { AudioTakeRecorder, type AudioTakeRecording } from "@repo/music-core/engines/audio-recording";
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
  import type { AudioTakeRow, ImportedBackingTrackRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import AudioTakePanel from "../_components/AudioTakePanel.svelte";
  import BackingTrackPanel from "../_components/BackingTrackPanel.svelte";
  import InputSurface from "../_components/InputSurface.svelte";
  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import { useMusicRuntime, type MusicRuntime, type PracticeCaptureEntry } from "../_runtime.svelte";

  interface StartBoundary {
    wallClock: UnixMs;
    monotonic: ReturnType<typeof monotonicMs>;
  }

  let { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();

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
  let micArmed = $state(false);
  let audioDevices = $state<MediaDeviceInfo[]>([]);
  let takeUrl = $state<string | undefined>();

  const audioRecorder = new AudioTakeRecorder();
  let recorderState = $state(audioRecorder.state);
  const backingEngine = new BackingTrackEngine(createBackingAdapter());
  let backingState = $state<BackingTrackState>(backingEngine.state);

  const noteCount = $derived(activeState?.noteCount ?? lastResult?.noteCount ?? 0);
  const distinctNoteCount = $derived(activeState?.distinctNoteCount ?? lastResult?.distinctNoteCount ?? 0);
  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );
  const canChangeSetup = $derived(!recording && !saving);

  const unsubscribeRouter = subscribeRouter();
  const unsubscribeBacking = backingEngine.subscribe((state) => {
    backingState = state;
  });
  const unsubscribeRecorder = audioRecorder.subscribe((state) => {
    recorderState = state;
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
      activeState = activeSession.state;
    });
  }

  onMount(async () => {
    await Promise.all([loadMedia(), loadAudioDevices()]);
  });

  onDestroy(() => {
    unsubscribeRouter();
    unsubscribeBacking();
    unsubscribeRecorder();
    backingEngine.dispose();
    void audioRecorder.dispose();
    revokeTakeUrl();
    runtime.setPlaybackSource(undefined);
  });

  async function loadMedia(): Promise<void> {
    if (!runtime.media) return;
    importedTracks = await runtime.media.listBackings();
    takes = await runtime.media.listTakes();
    selectedTake = selectedTake
      ? (takes.find((take) => take.id === selectedTake?.id) ?? takes[0])
      : takes[0];
    mediaUsage = await runtime.media.usage();
  }

  async function loadAudioDevices(): Promise<void> {
    try {
      audioDevices = await audioRecorder.devices();
    } catch {
      audioDevices = [];
    }
  }

  async function startRecording(): Promise<void> {
    if (recording || saving) return;
    saveError = "";
    failedCapture = undefined;
    lastResult = undefined;
    statusMessage = runtime.countInBars > 0 && runtime.audioEnabled ? "Counting in..." : "Recording.";
    if (runtime.countInBars > 0 && runtime.audioEnabled) await runtime.runCountIn();
    const boundary = boundaryNow();
    startBoundary = boundary;
    const id = `practice-lab-${boundary.wallClock}`;
    const session = new FreePracticeSession({
      id,
      instrument,
      startedAt: boundary.wallClock,
      startedAtMonotonic: boundary.monotonic,
    });
    activeSession = session;
    activeState = session.state;
    runtime.setActiveInstrument(instrument);
    recording = true;
    statusMessage = "Recording.";

    if (backingState.selection.kind !== "none") {
      void backingEngine.play().catch((error) => {
        saveError = error instanceof Error ? error.message : "Backing playback failed.";
      });
    }

    if (micArmed) {
      try {
        audioRecorder.start({ id: `${id}-take`, startedAtMonotonic: Number(boundary.monotonic) });
      } catch (error) {
        saveError = error instanceof Error ? error.message : "Audio recorder could not start.";
      }
    }
  }

  async function stopRecording(): Promise<void> {
    const session = activeSession;
    const boundary = boundaryNow();
    if (!session || !recording || !startBoundary) return;

    recording = false;
    saving = true;
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
    activeSession = undefined;
    activeState = undefined;
    lastResult = result;

    try {
      await persistResult(result, audioTake);
      statusMessage = result.noteCount > 0 ? "Saved to practice journal." : "Nothing to save yet.";
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
    try {
      await audioRecorder.prepare(deviceId);
      micArmed = true;
      await loadAudioDevices();
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Microphone could not be armed.";
    }
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
      backingEngine.selectImported(row, { loop: true });
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Backing track could not be imported.";
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
    if (!runtime.media) return;
    const blob = await runtime.media.takeBlob(take.id);
    if (!blob || !browser) return;
    revokeTakeUrl();
    takeUrl = URL.createObjectURL(blob);
    const audio = new Audio(takeUrl);
    audio.volume = performanceVolume;
    await audio.play();
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
      return new BrowserBackingPlayer({
        sound: runtime.sound,
        loadBlob: (id) => runtime.media?.backingBlob(id) ?? Promise.resolve(undefined),
        onImportedPositionChange: (positionMs) => backingEngine.updateImportedPosition(positionMs),
        onImportedEnded: () => backingEngine.markEnded(),
        onImportedError: (message) => {
          saveError = message;
        },
      });
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
  <title>Practice Lab | Musicianship OS</title>
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
        disabled={saving}
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

  <section id="practice-lab" class="grid gap-6" aria-label="Practice Lab workspace">
    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="grid gap-6">
        <Card.Root>
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

        {#if saveError}
          <Card.Root class="border-destructive/30 bg-destructive/5">
            <Card.Content class="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p class="text-sm font-semibold text-destructive">Save needs attention</p>
                <p class="text-sm text-muted-foreground">{saveError}</p>
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

      <aside class="grid content-start gap-6">
        <BackingTrackPanel
          state={backingState}
          progressions={JAM_PROGRESSIONS}
          {importedTracks}
          usage={mediaUsage}
          onSelectNone={() => backingEngine.selectNone()}
          onSelectGenerated={(selection) => backingEngine.selectGenerated(selection)}
          onSelectImported={(track, loop) => backingEngine.selectImported(track, { loop })}
          onImport={importBacking}
          onPlay={() => backingEngine.play()}
          onPause={() => backingEngine.pause()}
          onStop={() => backingEngine.stop()}
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
          onArm={armMicrophone}
          onDisarm={() => (micArmed = false)}
          onDevice={(deviceId) => void armMicrophone(deviceId)}
          onSelectTake={(take) => (selectedTake = take)}
          onPlayTake={playTake}
          onPerformanceVolume={(volume) => (performanceVolume = volume)}
          onBackingVolume={(volume) => {
            backingReviewVolume = volume;
            backingEngine.setVolume(volume);
          }}
          onDownloadTake={downloadTake}
          onDeleteTake={deleteTake}
          onRetrySave={retryTakeSave}
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
    />
    <MusicToolCard
      href="/music/play/mpc"
      title="MPC Rudiments"
      description="Build alternating pad control with order, timing, and velocity feedback from MIDI or the on-screen grid."
      eyebrow="Play"
      meta="Pads"
      action="Start pad practice"
      icon={Drum}
    />
    <MusicToolCard
      href="/music/play/spider"
      title="Spider Drill"
      description="Build guitar or ukulele fretting-hand independence with a graded chromatic 1-2-3-4 pattern."
      eyebrow="Play"
      meta="Strings"
      action="Start spider practice"
      icon={SlidersHorizontal}
    />
    <MusicToolCard
      href="/music/play/two-hand"
      title="Two-Hand Independence"
      description="A graded piano drill: hold a steady left-hand pulse while the right hand runs a faster scale line."
      eyebrow="Play"
      meta="Piano"
      action="Start independence drill"
      icon={Hand}
    />
    <MusicToolCard
      href="/music/tuner"
      title="Tuner"
      description="Tune by ear with a live mic: nearest note, cents deviation, and a flat / in-tune / sharp meter."
      eyebrow="Play"
      meta="Intonation"
      action="Open tuner"
      icon={Gauge}
    />
    <MusicToolCard
      href="/music/intonation"
      title="Intonation & Drone"
      description="Hold pitch against a tonic drone with live cents feedback, in-tune %, and a pitch trace."
      eyebrow="Play"
      meta="Intonation"
      action="Open intonation"
      icon={AudioWaveform}
    />
    <MusicToolCard
      href="/music/songs"
      title="Song Library"
      description="Reopen saved imported songs, replay them, and log repertoire practice into the journal."
      eyebrow="Play"
      meta="Repertoire"
      action="Open songs"
      icon={ListMusic}
    />
  </section>
</PracticeScreen>
