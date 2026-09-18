<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick, untrack } from "svelte";

  import Circle from "lucide-svelte/icons/circle";
  import Download from "lucide-svelte/icons/download";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";

  import { unixMs, type Score } from "@repo/music-core/domain";
  import { scoreToMidiBlob } from "@repo/music-core/engines/midi-export";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import type { AudioTakeRecording } from "@repo/music-core/engines/audio-recording";
  import { takeToScore, type Take as MidiTake } from "@repo/music-core/engines/recording";
  import { PracticeStore, type AudioTakeRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import AudioTakePanel from "../_components/AudioTakePanel.svelte";
  import { drillTitle } from "../_components/musicCatalog";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../_components/PracticeStage.svelte";
  import TakeMiniRoll from "../_components/TakeMiniRoll.svelte";
  import TakeNameInput from "../_components/TakeNameInput.svelte";
  import PianoSurface from "../_components/piano/PianoSurface.svelte";
  import SectionHeading from "../_components/SectionHeading.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import TransportStrip from "../_components/TransportStrip.svelte";
  import { useTakeRecorder } from "../_components/take-recorder.svelte";
  import { syncRouteQuery } from "../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";
  import { PIANO_ROLL_PENDING_TAKE_IMPORT_ID } from "../create/_components/piano-roll-storage";

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

  // One take recorder per runtime: a take captured here is already on Practice
  // Lab's list (and vice versa) without a reload.
  const takes = untrack(() => useTakeRecorder(runtime));

  let recording = $state(false);
  let recordingPending = $state(false);
  let liveCount = $state(0);
  let compareA = $state<string>("");
  let compareB = $state<string>("");
  let audioMessage = $state("");
  let midiMessage = $state("");
  let savingSongTakeId = $state<string | undefined>();
  let savedSongId = $state<string | undefined>();
  let backingReviewVolume = $state(0.75);
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  const initialSearch = browser ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialUrlBpm = validBpm(initialSearch.get("bpm"));
  const requestedTakeId = initialSearch.get("take") ?? undefined;
  /** "Record this" from a drill summary: the note every take here starts with. */
  const followUpNote = followUpFrom(initialSearch.get("from"));

  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );
  const midiTakes = $derived(takes.midiTakes);
  /** Errors first: they are what the player has to act on. The recorder's own
   *  status line is announced here too — AudioTakePanel only draws it. */
  const recorderMessage = $derived(takes.recorderState.message ?? "");
  const problem = $derived(Boolean(audioMessage || takes.message || recorderMessage));
  const routeMessage = $derived(audioMessage || takes.message || recorderMessage || midiMessage);
  const comparison = $derived(takes.compare(compareA, compareB));

  $effect(() => {
    return runtime.router.subscribe((event) => {
      if (!recording) return;
      takes.capture(event);
      if (event.type === "noteOn") liveCount += 1;
    });
  });

  $effect(() => {
    takes.syncPlaybackVolume(runtime.mediaVolume);
  });

  $effect(() => {
    registerRecordingContext(runtime.activeInstrument, takes.micRequested);
  });

  onMount(() => {
    void takes.loadDevices();
  });

  // Storage is attached by the parent layout from its own onMount, which runs
  // AFTER this page's onMount (child mounts first). So load persisted takes once
  // storage becomes available rather than reading eagerly (which silently no-ops).
  let storageLoaded = false; // plain, non-reactive — keeps this effect from looping.
  $effect(() => {
    const media = runtime.media;
    if (!media || storageLoaded) return;
    storageLoaded = true;
    void takes.load().then(() => {
      syncCompare();
      selectRequestedTake();
    });
  });

  /** Compare defaults to the two newest takes. */
  function syncCompare(): void {
    if (takes.midiTakes[0]) compareA = takes.midiTakes[0].id;
    if (takes.midiTakes[1]) compareB = takes.midiTakes[1].id;
  }

  /** `?take=<id>` opens on that take, whichever list it belongs to. */
  function selectRequestedTake(): void {
    if (!requestedTakeId) return;
    const midi = takes.midiTakes.find((take) => take.id === requestedTakeId);
    if (midi) {
      takes.selectMidiTake(midi);
      return;
    }
    const audio = takes.audioTakes.find((take) => take.id === requestedTakeId);
    if (audio) takes.selectedAudioTake = audio;
  }

  function followUpFrom(from: string | null): string {
    const title = from ? drillTitle(from) : undefined;
    return title ? `Recording after ${title}` : "";
  }

  onDestroy(() => {
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    takes.release();
  });

  async function toggleRecording(): Promise<void> {
    if (recording) {
      runtime.endPerformance();
      const endedAt = performance.now();
      let audioTake: AudioTakeRecording | undefined;
      if (takes.recorderState.status === "recording") {
        try {
          audioTake = await takes.audio.stop(endedAt);
        } catch (error) {
          audioMessage = error instanceof Error ? error.message : "Audio recording could not be stopped.";
        }
      }
      recording = false;
      const take = takes.stopMidi(endedAt);
      if (take && followUpNote) takes.noteMidiTake(take, followUpNote);
      syncCompare();
      if (audioTake) await saveAudioTake(audioTake);
    } else if (!recordingPending) {
      recordingPending = true;
      takes.stopAudioPlayback();
      takes.stopMidiPlayback();
      try {
        if (!(await takes.micReady())) return;
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
          if (takes.micArmed) {
            takes.audio.start({ id: `recording-${Date.now()}`, startedAtMonotonic: startedAt });
          }
          takes.startMidi(startedAt);
        } catch (error) {
          runtime.endPerformance();
          if (takes.micArmed) await takes.disarm();
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
    url.searchParams.set("bpm", String(bpm));
    syncRouteQuery(`${url.pathname}${url.search}${url.hash}`);
  }

  function validBpm(value: string | null): number | undefined {
    const bpm = Number(value);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : undefined;
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

  function playNote(event: { type: string; midiNote: number; velocity: number }): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  async function saveAudioTake(recording: AudioTakeRecording): Promise<void> {
    const row: AudioTakeRow = {
      id: recording.id,
      name: `Self-review ${new Date().toLocaleString()}`,
      mimeType: recording.mimeType,
      size: recording.size,
      durationMs: recording.durationMs,
      createdAt: unixMs(Date.now()),
      instrument: runtime.activeInstrument,
      backingOffsetMs: 0,
      note: followUpNote || undefined,
    };
    await takes.saveAudioTake(row, recording.blob);
    if (takes.message) audioMessage = takes.message;
  }

  function defaultNavigateToCreate(href: string): void {
    if (browser) window.location.assign(href);
  }
</script>

<svelte:head>
  <title>Record | Practice OS</title>
  <meta
    name="description"
    content="Capture MIDI and audio takes, compare them, and send a take on to the piano roll or Song Studio."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Record"
    subtitle="Capture a take, hear it back, and let the numbers show what to fix."
  >
    {#snippet controls()}
      <SourceReadout label="Input" device={sourceLabel} live={runtime.activeSource === "midi"} />
    {/snippet}
  </PracticeScreenHeader>

  <!-- minmax(0,1fr): let the track shrink below the grid so its own scroller engages on phones. -->
  <div class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <SectionHeading
      title="Recording & Self-Review"
      description="Record any take, compare them, and let the numbers show what to fix."
    />

    {#if followUpNote}
      <p class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{followUpNote}</p>
    {/if}

    <!-- The one live region this route owns: transport errors, take errors and
         the "sent to…" confirmations all land here, so nothing announces twice. -->
    <p
      role="status"
      aria-live="polite"
      class={[
        "rounded-lg px-3 py-2 text-sm",
        problem
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground",
        !routeMessage && "sr-only",
      ]}
    >
      {routeMessage}
    </p>

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
                    takes.playingMidiTakeId === take.id && "border-practice-accent ring-4 ring-practice-accent/15",
                    takes.selectedMidiTake?.id === take.id && "border-practice-accent",
                  ]}
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <TakeNameInput
                        value={take.name}
                        label={`Take name for ${take.name}`}
                        onCommit={(name) => takes.renameMidiTake(take, name)}
                      />
                      <span class="eyebrow shrink-0">{take.source}</span>
                    </div>
                    <TakeMiniRoll {take} class="mt-2 h-10 w-full" />
                    <div class="mt-1 text-xs text-muted-foreground tabular-nums">
                      {take.notes.length} notes · {(take.durationMs / 1000).toFixed(1)}s
                    </div>
                    <TakeNameInput
                      value={take.note ?? ""}
                      tone="note"
                      placeholder="Add a note"
                      label={`Note for ${take.name}`}
                      onCommit={(note) => takes.noteMidiTake(take, note)}
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={take.notes.length === 0}
                      aria-label={`${takes.playingMidiTakeId === take.id ? "Pause" : "Play"} ${take.name}`}
                      onclick={() => void takes.toggleMidiTake(take)}
                    >
                      {#if takes.playingMidiTakeId === take.id}
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
                    <Button type="button" variant="ghost" size="sm" onclick={() => takes.removeMidiTake(take.id)}>Delete</Button>
                  </div>
                </div>
              {/each}
            {/if}
          </Card.Content>
        </Card.Root>

        <!-- Live capture surface -->
        <Card.Root>
          <Card.Header><Card.Description>Play to record</Card.Description></Card.Header>
          <Card.Content>
            <PracticeStage instrument={runtime.activeInstrument} class="p-3">
              <PianoSurface router={runtime.router} onAccepted={playNote} noteNames="c" />
            </PracticeStage>
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
          recorderState={takes.recorderState}
          devices={takes.devices}
          armed={takes.micArmed}
          takes={takes.audioTakes}
          selectedTake={takes.selectedAudioTake}
          usage={takes.usage}
          performanceVolume={takes.playbackVolume}
          backingVolume={backingReviewVolume}
          unsavedTake={takes.unsavedTake}
          playingTakeId={takes.playingAudioTakeId}
          onArm={(deviceId) => takes.arm(deviceId)}
          onDisarm={() => takes.disarm()}
          onDevice={(deviceId) => void takes.arm(deviceId)}
          onSelectTake={(take) => (takes.selectedAudioTake = take)}
          onPlayTake={(take) => takes.playAudioTake(take)}
          onPauseTake={() => takes.stopAudioPlayback()}
          onPerformanceVolume={(volume) => {
            takes.playbackVolume = volume;
            takes.syncPlaybackVolume(runtime.mediaVolume);
          }}
          onBackingVolume={(volume) => (backingReviewVolume = volume)}
          onDownloadTake={(take) => takes.downloadAudioTake(take)}
          onDeleteTake={(take) => takes.deleteAudioTake(take)}
          onRetrySave={(recording) => saveAudioTake(recording)}
          onRenameTake={(take, name) => void takes.updateAudioTake(take, { name })}
          onNoteTake={(take, note) => void takes.updateAudioTake(take, { note })}
          onGainTake={(take, gainDb) => void takes.updateAudioTake(take, { gainDb })}
          loadTakePeaks={takes.takeEnvelope}
        />
      </aside>
    </section>
  </div>
</PracticeScreen>
