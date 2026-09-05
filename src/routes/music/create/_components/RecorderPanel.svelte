<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick } from "svelte";

  import Circle from "lucide-svelte/icons/circle";
  import Download from "lucide-svelte/icons/download";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";

  import { unixMs, type Score } from "@repo/music-core/domain";
  import { scoreToMidiBlob } from "@repo/music-core/engines/midi-export";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import {
    AudioTakeRecorder,
    type AudioTakeRecording,
  } from "@repo/music-core/engines/audio-recording";
  import type { MediaUsage } from "@repo/music-core/engines/media-library";
  import {
    RecordingSession,
    takeToScore,
    type Take as MidiTake,
  } from "@repo/music-core/engines/recording";
  import { scoreToPattern } from "@repo/music-core/engines/sound";
  import { PracticeStore, type AudioTakeRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import AudioTakePanel from "../../_components/AudioTakePanel.svelte";
  import PianoSurface from "../../_components/piano/PianoSurface.svelte";
  import SectionHeading from "../../_components/SectionHeading.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import TransportStrip from "../../_components/TransportStrip.svelte";
  import { syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";
  import { PIANO_ROLL_PENDING_TAKE_IMPORT_ID } from "./piano-roll-storage";

  interface SongStudioSaver {
    saveScore(score: Score): Promise<{ id: string; title: string }>;
  }

  let {
    runtime = useMusicRuntime(),
    navigateToCreate = defaultNavigateToCreate,
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
  }: {
    runtime?: MusicRuntime;
    navigateToCreate?: (href: string) => void | Promise<void>;
    library?: SongStudioSaver;
  } = $props();
  const recorder = new RecordingSession();
  const audioRecorder = new AudioTakeRecorder();
  // MIDI takes are tiny structured JSON, so they persist via the runtime's
  // Dexie-backed local state (OPFS is for binaries; audio takes use it).
  const MIDI_TAKES_ID = "music.recording.midi-takes";

  let recording = $state(false);
  let recordingPending = $state(false);
  let liveCount = $state(0);
  let midiTakes = $state<MidiTake[]>([]);
  let compareA = $state<string>("");
  let compareB = $state<string>("");
  let audioTakes = $state<AudioTakeRow[]>([]);
  let selectedAudioTake = $state<AudioTakeRow | undefined>();
  let mediaUsage = $state<MediaUsage | undefined>();
  let recorderState = $state(audioRecorder.state);
  let audioDevices = $state<MediaDeviceInfo[]>([]);
  let micRequested = $state(false);
  let micArmed = $state(false);
  let microphonePreparation: Promise<boolean> | undefined;
  let microphonePreparationGeneration = 0;
  let unsavedTake = $state<AudioTakeRecording | undefined>();
  let audioMessage = $state("");
  let midiMessage = $state("");
  let savingSongTakeId = $state<string | undefined>();
  let savedSongId = $state<string | undefined>();
  let performanceVolume = $state(1);
  let backingReviewVolume = $state(0.75);
  let playingAudioTakeId = $state<string | undefined>();
  let playingMidiTakeId = $state<string | undefined>();
  let reviewAudio = $state<HTMLAudioElement | undefined>();
  let reviewUrl = $state<string | undefined>();
  let reviewGeneration = 0;
  let midiPlaybackGeneration = 0;
  let midiPlaybackTimer: ReturnType<typeof setTimeout> | undefined;
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  const initialUrlBpm = browser
    ? validBpm(new URLSearchParams(window.location.search).get("bpm"))
    : undefined;

  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );
  const comparison = $derived(
    compareA && compareB && compareA !== compareB ? recorder.compare(compareA, compareB) : undefined,
  );

  const unsubscribeRecorder = audioRecorder.subscribe((state) => {
    recorderState = state;
  });

  $effect(() => {
    return runtime.router.subscribe((event) => {
      if (!recording) return;
      recorder.capture(event);
      if (event.type === "noteOn") liveCount = recorder.recording ? liveCount + 1 : liveCount;
    });
  });

  $effect(() => {
    const mediaVolume = runtime.mediaVolume;
    if (reviewAudio) reviewAudio.volume = performanceVolume * mediaVolume;
  });

  $effect(() => {
    registerRecordingContext(runtime.activeInstrument, micRequested);
  });

  onMount(() => {
    void loadAudioDevices();
  });

  // Storage is attached by the parent layout from its own onMount, which runs
  // AFTER this page's onMount (child mounts first). So load persisted takes once
  // storage becomes available rather than reading eagerly (which silently no-ops).
  let storageLoaded = false; // plain, non-reactive — keeps this effect from looping.
  $effect(() => {
    const media = runtime.media;
    if (!media || storageLoaded) return;
    storageLoaded = true;
    void loadMidiTakes();
    void loadAudioTakes();
  });

  async function loadMidiTakes(): Promise<void> {
    const saved = await runtime.readLocalState<MidiTake[]>(MIDI_TAKES_ID);
    if (!Array.isArray(saved) || saved.length === 0) return;
    recorder.restore(saved);
    midiTakes = recorder.takes();
    if (midiTakes[0]) compareA = midiTakes[0].id;
    if (midiTakes[1]) compareB = midiTakes[1].id;
  }

  function saveMidiTakes(): void {
    void runtime.writeLocalState(MIDI_TAKES_ID, recorder.takes());
  }

  onDestroy(() => {
    microphonePreparationGeneration += 1;
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    unsubscribeRecorder();
    void audioRecorder.dispose();
    stopAudioTake();
    stopMidiTake();
  });

  async function toggleRecording(): Promise<void> {
    if (recording) {
      runtime.endPerformance();
      const endedAt = performance.now();
      let audioTake: AudioTakeRecording | undefined;
      if (recorderState.status === "recording") {
        try {
          audioTake = await audioRecorder.stop(endedAt);
        } catch (error) {
          audioMessage = error instanceof Error ? error.message : "Audio recording could not be stopped.";
        }
      }
      recorder.stop(endedAt);
      recording = false;
      midiTakes = recorder.takes();
      if (midiTakes[0]) compareA = midiTakes[0].id;
      if (midiTakes[1]) compareB = midiTakes[1].id;
      saveMidiTakes();
      if (audioTake) await saveAudioTake(audioTake);
    } else if (!recordingPending) {
      recordingPending = true;
      stopAudioTake();
      stopMidiTake();
      try {
        if (!(await requestedMicrophoneReady())) return;
        await tick();
        const contextRequest = practiceContextRequest;
        await practiceContextQueue;
        if (contextRequest !== practiceContextRequest) return;
        runtime.endPerformance();
        if (!(await runtime.ensurePlaybackVoice())) {
          if (contextRequest === practiceContextRequest) audioMessage = runtime.audioMessage;
          return;
        }
        if (contextRequest !== practiceContextRequest) return;
        const clock = await runtime.beginPerformance();
        if (contextRequest !== practiceContextRequest) {
          if (clock.status === "started") runtime.endPerformance();
          return;
        }
        if (clock.status === "cancelled") return;
        if (clock.status === "failed") {
          audioMessage = clock.message;
          return;
        }
        const startedAt = Number(clock.downbeat);
        try {
          if (micArmed) {
            audioRecorder.start({ id: `recording-${Date.now()}`, startedAtMonotonic: startedAt });
          }
          recorder.start(startedAt);
        } catch (error) {
          runtime.endPerformance();
          if (micArmed) {
            await audioRecorder.cancel();
            micRequested = false;
            micArmed = false;
          }
          audioMessage = error instanceof Error ? error.message : "Recording could not start.";
          return;
        }
        recording = true;
        liveCount = 0;
      } finally {
        recordingPending = false;
      }
    }
  }

  function registerRecordingContext(instrument: typeof runtime.activeInstrument, audio: boolean): void {
    const request = ++practiceContextRequest;
    practiceContextQueue = practiceContextQueue.then(async () => {
      if (request !== practiceContextRequest) return;
      const cleanup = await runtime.registerPracticeContext({
        owner: "practice-recording",
        variantKey: `v1:recording:${instrument}:${audio ? "midi-audio" : "midi"}`,
        defaultBpm: 96,
        initialUrlBpm,
        meter: { numerator: 4, denominator: 4 },
        onBpmChange: syncRecordingBpm,
      });
      if (request !== practiceContextRequest) {
        cleanup();
        return;
      }
      practiceContextCleanup?.();
      practiceContextCleanup = cleanup;
    });
  }

  function syncRecordingBpm(bpm: number): void {
    if (!browser) return;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "recorder");
    url.searchParams.set("bpm", String(bpm));
    syncRouteQuery(`${url.pathname}${url.search}${url.hash}`);
  }

  function validBpm(value: string | null): number | undefined {
    const bpm = Number(value);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : undefined;
  }

  function removeTake(id: string): void {
    if (playingMidiTakeId === id) stopMidiTake();
    recorder.remove(id);
    midiTakes = recorder.takes();
    saveMidiTakes();
  }

  function exportTakeMidi(take: MidiTake): void {
    const blob = scoreToMidiBlob(takeToScore(take, runtime.transportBpm));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${take.name}.mid`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function openTakeInPianoRoll(take: MidiTake): Promise<void> {
    try {
      await runtime.writeLocalState(PIANO_ROLL_PENDING_TAKE_IMPORT_ID, {
        take,
        bpm: runtime.transportBpm,
      });
      midiMessage = `Sent ${take.name} to Piano Roll.`;
      await navigateToCreate("/music/create?mode=piano-roll&source=recorder-take");
    } catch (error) {
      midiMessage = error instanceof Error ? error.message : "MIDI take could not be opened in Piano Roll.";
    }
  }

  async function saveTakeToSongStudio(take: MidiTake): Promise<void> {
    if (!library || savingSongTakeId) return;
    savingSongTakeId = take.id;
    try {
      const saved = await library.saveScore(takeToScore(take, runtime.transportBpm));
      savedSongId = saved.id;
      midiMessage = "Saved to Song Studio.";
    } catch (error) {
      midiMessage = error instanceof Error ? error.message : "Could not save to Song Studio.";
    } finally {
      savingSongTakeId = undefined;
    }
  }

  function playTake(event: { type: string; midiNote: number; velocity: number }): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  function barHeights(take: MidiTake): number[] {
    const slots = 48;
    if (take.notes.length === 0) return Array.from({ length: slots }, () => 0.08);
    const span = Math.max(take.durationMs, 1);
    const bins = Array.from({ length: slots }, () => 0);
    for (const note of take.notes) {
      const slot = Math.min(slots - 1, Math.floor((note.atMs / span) * slots));
      bins[slot] = Math.max(bins[slot]!, 0.2 + note.velocity * 0.8);
    }
    return bins;
  }

  async function loadAudioTakes(): Promise<void> {
    if (!runtime.media) return;
    audioTakes = await runtime.media.listTakes();
    selectedAudioTake = selectedAudioTake
      ? (audioTakes.find((take) => take.id === selectedAudioTake?.id) ?? audioTakes[0])
      : audioTakes[0];
    mediaUsage = await runtime.media.usage();
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

  async function armMicrophone(deviceId?: string): Promise<void> {
    const generation = ++microphonePreparationGeneration;
    micRequested = true;
    micArmed = false;
    const preparation = (async () => {
      try {
        await audioRecorder.prepare(deviceId);
        if (generation !== microphonePreparationGeneration || !micRequested) return false;
        micArmed = true;
        audioMessage = "";
        void loadAudioDevices(generation);
        return true;
      } catch (error) {
        if (generation === microphonePreparationGeneration) {
          micRequested = false;
          audioMessage = error instanceof Error ? error.message : "Microphone could not be armed.";
        }
        return false;
      }
    })();
    microphonePreparation = preparation;
    await preparation;
    if (microphonePreparation === preparation) microphonePreparation = undefined;
  }

  async function disarmMicrophone(): Promise<void> {
    microphonePreparationGeneration += 1;
    micRequested = false;
    micArmed = false;
    if (recorderState.status === "recording") return;
    await audioRecorder.cancel();
  }

  async function requestedMicrophoneReady(): Promise<boolean> {
    while (micRequested && !micArmed) {
      const preparation = microphonePreparation;
      if (!preparation) {
        audioMessage = "Microphone preparation did not complete.";
        return false;
      }
      const ready = await preparation;
      if (preparation !== microphonePreparation && micRequested) continue;
      return ready && micRequested && micArmed;
    }
    return !micRequested || micArmed;
  }

  async function saveAudioTake(recording: AudioTakeRecording): Promise<void> {
    if (!runtime.media) {
      unsavedTake = recording;
      return;
    }
    const row: AudioTakeRow = {
      id: recording.id,
      name: `Self-review ${new Date().toLocaleString()}`,
      mimeType: recording.mimeType,
      size: recording.size,
      durationMs: recording.durationMs,
      createdAt: unixMs(Date.now()),
      instrument: runtime.activeInstrument,
      backingOffsetMs: 0,
    };
    try {
      await runtime.media.saveTake(row, recording.blob);
      unsavedTake = undefined;
      await loadAudioTakes();
      selectedAudioTake = row;
    } catch (error) {
      unsavedTake = recording;
      audioMessage = error instanceof Error ? error.message : "Audio take could not be saved.";
    }
  }

  async function retryAudioTakeSave(recording: AudioTakeRecording): Promise<void> {
    await saveAudioTake(recording);
  }

  async function playAudioTake(take: AudioTakeRow): Promise<void> {
    if (!runtime.media || !browser) return;
    stopMidiTake();
    stopAudioTake();
    const generation = reviewGeneration;
    try {
      if (!runtime.audioEnabled && !(await runtime.enableAudio())) {
        audioMessage = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      const blob = await runtime.media.takeBlob(take.id);
      if (generation !== reviewGeneration) return;
      if (!blob) throw new Error("Recorded take audio is unavailable.");
      reviewUrl = URL.createObjectURL(blob);
      const audio = new Audio(reviewUrl);
      reviewAudio = audio;
      playingAudioTakeId = take.id;
      audio.volume = performanceVolume * runtime.mediaVolume;
      audio.onended = () => finishAudioTake(generation);
      audio.onerror = () => failAudioTake(generation, "Recorded take playback failed.");
      await audio.play();
    } catch (error) {
      if (generation !== reviewGeneration) return;
      failAudioTake(
        generation,
        error instanceof Error ? error.message : "Recorded take playback failed.",
      );
    }
  }

  function stopAudioTake(): void {
    reviewGeneration += 1;
    reviewAudio?.pause();
    reviewAudio = undefined;
    playingAudioTakeId = undefined;
    revokeReviewUrl();
  }

  function finishAudioTake(generation: number): void {
    if (generation !== reviewGeneration) return;
    reviewAudio = undefined;
    playingAudioTakeId = undefined;
    revokeReviewUrl();
  }

  function failAudioTake(generation: number, message: string): void {
    if (generation !== reviewGeneration) return;
    stopAudioTake();
    audioMessage = message;
  }

  async function toggleMidiTake(take: MidiTake): Promise<void> {
    if (playingMidiTakeId === take.id) {
      stopMidiTake();
      return;
    }

    stopAudioTake();
    stopMidiTake();
    const generation = midiPlaybackGeneration;
    midiMessage = "";
    if (!(await runtime.ensurePlaybackVoice())) {
      if (generation === midiPlaybackGeneration) {
        midiMessage = runtime.audioMessage || "MIDI take playback could not be enabled.";
      }
      return;
    }
    if (generation !== midiPlaybackGeneration) return;

    const pattern = scoreToPattern(takeToScore(take, runtime.transportBpm), {
      bpm: runtime.transportBpm,
    });
    runtime.sound.playPattern(pattern.steps);
    playingMidiTakeId = take.id;
    midiPlaybackTimer = setTimeout(
      () => finishMidiTake(generation),
      Math.max(0, pattern.durationSec * 1_000),
    );
  }

  function stopMidiTake(): void {
    midiPlaybackGeneration += 1;
    if (midiPlaybackTimer) clearTimeout(midiPlaybackTimer);
    midiPlaybackTimer = undefined;
    runtime.sound.stopPattern();
    playingMidiTakeId = undefined;
  }

  function finishMidiTake(generation: number): void {
    if (generation !== midiPlaybackGeneration) return;
    midiPlaybackTimer = undefined;
    playingMidiTakeId = undefined;
  }

  function downloadAudioTake(take: AudioTakeRow): void {
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

  async function deleteAudioTake(take: AudioTakeRow): Promise<void> {
    await runtime.media?.deleteTake(take.id);
    if (selectedAudioTake?.id === take.id) selectedAudioTake = undefined;
    await loadAudioTakes();
  }

  function revokeReviewUrl(): void {
    if (reviewUrl && browser) URL.revokeObjectURL(reviewUrl);
    reviewUrl = undefined;
  }

  function defaultNavigateToCreate(href: string): void {
    if (browser) window.location.assign(href);
  }
</script>

<!-- minmax(0,1fr): let the track shrink below the grid so its own scroller engages on phones. -->
<div class="grid grid-cols-[minmax(0,1fr)] gap-6">
  <SectionHeading
    title="Recording & Self-Review"
    description="Record any take, compare them, and let the numbers show what to fix."
  />

  <TransportStrip>
    <Button
      type="button"
      variant={recording ? "destructive" : "default"}
      disabled={recordingPending}
      onclick={() => void toggleRecording()}
    >
      {#if recording}
        <Square class="size-4 fill-current" aria-hidden="true" />Stop · {liveCount}
      {:else}
        <Circle class="size-4 fill-current text-destructive" aria-hidden="true" />{recordingPending ? "Starting..." : "New recording"}
      {/if}
    </Button>
    <span aria-label="Recording BPM" class="rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs font-semibold text-muted-foreground">
      {runtime.practiceBpm} BPM
    </span>
    {#snippet actions()}
      <SourceReadout label="Input" device={sourceLabel} live={runtime.activeSource === "midi"} />
    {/snippet}
  </TransportStrip>

  <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="grid gap-6">
      <!-- Takes -->
      <Card.Root>
        <Card.Header>
          <Card.Description>Takes · {midiTakes.length}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3">
          {#if midiTakes.length === 0}
            <p class="py-6 text-center text-sm text-muted-foreground">
              No takes yet — hit <strong class="text-foreground">New recording</strong> and play.
            </p>
          {:else}
            {#each midiTakes as take (take.id)}
              <div
                class={[
                  "flex items-center gap-3 rounded-xl border bg-card p-3",
                  playingMidiTakeId === take.id && "border-practice-accent ring-4 ring-practice-accent/15",
                ]}
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-display text-sm font-semibold">{take.name}</span>
                    <span class="eyebrow">{take.source}</span>
                  </div>
                  <div class="mt-2 flex h-10 items-end gap-px" aria-hidden="true">
                    {#each barHeights(take) as height}
                      <span
                        class="flex-1 rounded-sm {playingMidiTakeId === take.id ? 'bg-practice-accent' : 'bg-primary/60'}"
                        style="height:{Math.round(height * 100)}%"
                      ></span>
                    {/each}
                  </div>
                  <div class="mt-1 text-xs text-muted-foreground tabular-nums">
                    {take.notes.length} notes · {(take.durationMs / 1000).toFixed(1)}s
                  </div>
                </div>
                <div class="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={take.notes.length === 0}
                    aria-label={`${playingMidiTakeId === take.id ? "Pause" : "Play"} ${take.name}`}
                    onclick={() => void toggleMidiTake(take)}
                  >
                    {#if playingMidiTakeId === take.id}
                      <Pause class="size-4" aria-hidden="true" />Pause
                    {:else}
                      <Play class="size-4" aria-hidden="true" />Play
                    {/if}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={take.notes.length === 0}
                    onclick={() => exportTakeMidi(take)}
                  >
                    <Download class="size-4" aria-hidden="true" />MIDI
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={take.notes.length === 0}
                    onclick={() => void openTakeInPianoRoll(take)}
                  >
                    Open in Piano Roll
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!library || savingSongTakeId !== undefined || take.notes.length === 0}
                    onclick={() => void saveTakeToSongStudio(take)}
                  >
                    <ListMusic class="size-4" aria-hidden="true" />
                    {savingSongTakeId === take.id ? "Saving..." : "Save to Song Studio"}
                  </Button>
                  {#if savedSongId}
                    <Button href={`/music/songs/${savedSongId}`} variant="ghost" size="sm">
                      Open Song Studio
                    </Button>
                  {/if}
                  <Button type="button" variant="ghost" size="sm" onclick={() => removeTake(take.id)}>Delete</Button>
                </div>
              </div>
            {/each}
            {#if midiMessage}
              <p class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
                {midiMessage}
              </p>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Live capture surface -->
      <Card.Root>
        <Card.Header><Card.Description>Play to record</Card.Description></Card.Header>
        <Card.Content>
          <PianoSurface router={runtime.router} onAccepted={playTake} />
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Compare -->
    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Compare takes</Card.Description>
          <Card.Title>Self-review</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3">
          {#if midiTakes.length < 2}
            <p class="text-sm text-muted-foreground">Record at least two takes to compare them.</p>
          {:else}
            <label class="grid gap-1 text-sm">
              <span class="text-xs text-muted-foreground">Take A</span>
              <select class="h-9 rounded-md border border-input bg-background px-3 text-sm" bind:value={compareA} aria-label="Take A">
                {#each midiTakes as take}<option value={take.id}>{take.name}</option>{/each}
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="text-xs text-muted-foreground">Take B</span>
              <select class="h-9 rounded-md border border-input bg-background px-3 text-sm" bind:value={compareB} aria-label="Take B">
                {#each midiTakes as take}<option value={take.id}>{take.name}</option>{/each}
              </select>
            </label>
            {#if comparison}
              <div class="rounded-xl border p-4 text-center">
                <div class="text-3xl font-bold tabular-nums text-primary">
                  {Math.round(comparison.accuracy * 100)}%
                </div>
                <div class="text-xs text-muted-foreground">
                  {comparison.matched}/{comparison.total} notes aligned
                </div>
              </div>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>

      <AudioTakePanel
        {recorderState}
        devices={audioDevices}
        armed={micArmed}
        takes={audioTakes}
        selectedTake={selectedAudioTake}
        usage={mediaUsage}
        {performanceVolume}
        backingVolume={backingReviewVolume}
        {unsavedTake}
        playingTakeId={playingAudioTakeId}
        onArm={armMicrophone}
        onDisarm={disarmMicrophone}
        onDevice={(deviceId) => void armMicrophone(deviceId)}
        onSelectTake={(take) => (selectedAudioTake = take)}
        onPlayTake={playAudioTake}
        onPauseTake={() => stopAudioTake()}
        onPerformanceVolume={(volume) => {
          performanceVolume = volume;
        }}
        onBackingVolume={(volume) => (backingReviewVolume = volume)}
        onDownloadTake={downloadAudioTake}
        onDeleteTake={deleteAudioTake}
        onRetrySave={retryAudioTakeSave}
      />

      {#if audioMessage}
        <p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {audioMessage}
        </p>
      {/if}
    </aside>
  </section>
</div>
