<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import Circle from "lucide-svelte/icons/circle";
  import Download from "lucide-svelte/icons/download";
  import ListMusic from "lucide-svelte/icons/list-music";
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
  import { PracticeStore, type AudioTakeRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import AudioTakePanel from "../../_components/AudioTakePanel.svelte";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
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
  let liveCount = $state(0);
  let midiTakes = $state<MidiTake[]>([]);
  let compareA = $state<string>("");
  let compareB = $state<string>("");
  let audioTakes = $state<AudioTakeRow[]>([]);
  let selectedAudioTake = $state<AudioTakeRow | undefined>();
  let mediaUsage = $state<MediaUsage | undefined>();
  let recorderState = $state(audioRecorder.state);
  let audioDevices = $state<MediaDeviceInfo[]>([]);
  let micArmed = $state(false);
  let unsavedTake = $state<AudioTakeRecording | undefined>();
  let audioMessage = $state("");
  let midiMessage = $state("");
  let savingSongTakeId = $state<string | undefined>();
  let savedSongId = $state<string | undefined>();
  let performanceVolume = $state(1);
  let backingReviewVolume = $state(0.75);
  let playingAudioTakeId = $state<string | undefined>();
  let reviewAudio = $state<HTMLAudioElement | undefined>();
  let reviewUrl = $state<string | undefined>();

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

  // Transport Play plays the selected take (Take A).
  $effect(() => {
    const audioTake = selectedAudioTake ?? audioTakes[0];
    if (audioTake) {
      runtime.setPlaybackSource({
        label: audioTake.name,
        durationSec: audioTake.durationMs / 1000,
        play: () => playAudioTake(audioTake),
        stop: () => stopAudioTake(),
      });
      return;
    }

    const take = midiTakes.find((candidate) => candidate.id === compareA) ?? midiTakes[0];
    if (!take) {
      runtime.setPlaybackSource(undefined);
      return;
    }
    const steps = take.notes.map((note) => ({
      midiNotes: [note.midi],
      offsetSeconds: note.atMs / 1000,
      durationSeconds: 0.3,
    }));
    runtime.setPlaybackSource({
      label: take.name,
      durationSec: take.durationMs / 1000,
      play: () => runtime.sound.playPattern(steps),
    });
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
    unsubscribeRecorder();
    void audioRecorder.dispose();
    revokeReviewUrl();
    runtime.setPlaybackSource(undefined);
  });

  async function toggleRecording(): Promise<void> {
    if (recording) {
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
    } else {
      const startedAt = performance.now();
      recorder.start(startedAt);
      if (micArmed) {
        try {
          audioRecorder.start({ id: `recording-${Date.now()}`, startedAtMonotonic: startedAt });
        } catch (error) {
          audioMessage = error instanceof Error ? error.message : "Audio recorder could not start.";
        }
      }
      recording = true;
      liveCount = 0;
    }
  }

  function removeTake(id: string): void {
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

  async function loadAudioDevices(): Promise<void> {
    try {
      audioDevices = await audioRecorder.devices();
    } catch {
      audioDevices = [];
    }
  }

  async function armMicrophone(deviceId?: string): Promise<void> {
    try {
      await audioRecorder.prepare(deviceId);
      micArmed = true;
      audioMessage = "";
      await loadAudioDevices();
    } catch (error) {
      audioMessage = error instanceof Error ? error.message : "Microphone could not be armed.";
    }
  }

  async function disarmMicrophone(): Promise<void> {
    micArmed = false;
    if (recorderState.status === "recording") return;
    await audioRecorder.cancel();
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
    if (!runtime.audioEnabled && !(await runtime.enableAudio())) return;
    const blob = await runtime.media.takeBlob(take.id);
    if (!blob) return;
    stopAudioTake();
    reviewUrl = URL.createObjectURL(blob);
    const audio = new Audio(reviewUrl);
    reviewAudio = audio;
    playingAudioTakeId = take.id;
    audio.volume = performanceVolume;
    audio.onended = () => {
      playingAudioTakeId = undefined;
      revokeReviewUrl();
    };
    await audio.play();
  }

  function stopAudioTake(): void {
    reviewAudio?.pause();
    reviewAudio = undefined;
    playingAudioTakeId = undefined;
    revokeReviewUrl();
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

<div class="grid gap-6">
  <section class="flex flex-col justify-between gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">Recording & Self-Review</h2>
      <p class="text-sm text-muted-foreground">
        Record any take, compare them, and let the numbers show what to fix.
      </p>
    </div>
    <div class="flex flex-wrap gap-2 sm:justify-end">
      <SourceReadout label="Input" device={sourceLabel} live={runtime.activeSource === "midi"} />
      <Button type="button" variant={recording ? "destructive" : "default"} onclick={() => void toggleRecording()}>
        {#if recording}
          <Square class="size-4 fill-current" aria-hidden="true" />Stop · {liveCount}
        {:else}
          <Circle class="size-4 fill-current text-destructive" aria-hidden="true" />New recording
        {/if}
      </Button>
    </div>
  </section>

  <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="grid gap-6">
      <!-- Takes -->
      <Card.Root>
        <Card.Header><Card.Description>Takes</Card.Description></Card.Header>
        <Card.Content class="grid gap-3">
          {#if midiTakes.length === 0}
            <p class="py-6 text-center text-sm text-muted-foreground">
              No takes yet — hit <strong class="text-foreground">New recording</strong> and play.
            </p>
          {:else}
            {#each midiTakes as take (take.id)}
              <div class="flex items-center gap-3 rounded-xl border p-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate text-sm font-semibold">{take.name}</span>
                    <span class="text-xs uppercase tracking-wide text-muted-foreground">{take.source}</span>
                  </div>
                  <div class="mt-2 flex h-10 items-end gap-px" aria-hidden="true">
                    {#each barHeights(take) as height}
                      <span class="flex-1 rounded-sm bg-primary/70" style="height:{Math.round(height * 100)}%"></span>
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
          <OnScreenKeyboard router={runtime.router} onAccepted={playTake} />
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
          if (reviewAudio) reviewAudio.volume = volume;
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
