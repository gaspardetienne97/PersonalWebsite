<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, untrack } from "svelte";

  import Download from "lucide-svelte/icons/download";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import type { Score, ScoreNote } from "@repo/music-core/domain";
  import {
    midiToFrequency,
    renderEventsToWav,
    type AudioRenderEvent,
  } from "@repo/music-core/engines/audio-export";
  import { scoreToMidiBlob } from "@repo/music-core/engines/midi-export";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import { PracticeStore } from "@repo/music-core/engines/store";

  import {
    buildMpcKitExport,
    buildMpcKitZip,
    canExportToDirectory,
    isMpcPadMidi,
    writeMpcKitToDirectory,
    type MpcPadMidi,
    type SampleKitStore,
  } from "@repo/music-core/engines/sample-kit";
  import {
    BOOM_BAP_KIT,
    StepSequencer,
    type StepSequencerPattern,
  } from "@repo/music-core/engines/sequencer";
  import type { DrumPatternStep, SoundPatternStep } from "@repo/music-core/engines/sound";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { toast } from "@repo/ui/sonner";

  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import SectionHeading from "../../_components/SectionHeading.svelte";
  import TransportStrip from "../../_components/TransportStrip.svelte";
  import SampleKitPanel from "../../studio/_components/SampleKitPanel.svelte";
  import StudioPadLeds from "../../studio/_components/StudioPadLeds.svelte";
  import {
    SampleKitPlaybackController,
    type ActiveSampleKit,
  } from "../../studio/_components/sample-kit-playback";

  const STEPS = 16;
  const STUDIO_PATTERN_ID = "music.studio.boom-bap";
  const ACTIVE_KIT_ID = "music.studio.active-sample-kit";

  interface SongStudioSaver {
    saveScore(score: Score): Promise<{ id: string; title: string }>;
  }

  let {
    runtime = useMusicRuntime(),
    playback,
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
  }: {
    runtime?: MusicRuntime;
    playback?: SampleKitPlaybackController;
    library?: SongStudioSaver;
  } = $props();

  const playbackController = untrack(
    () => playback ?? new SampleKitPlaybackController({ sound: runtime.sound }),
  );
  const sequencer = new StepSequencer(BOOM_BAP_KIT, STEPS);

  // A seeded boom-bap groove so the grid isn't empty on first load.
  [
    [0, 0],
    [0, 6],
    [0, 10],
    [1, 4],
    [1, 12],
    [2, 0],
    [2, 2],
    [2, 4],
    [2, 6],
    [2, 8],
    [2, 10],
    [2, 12],
    [2, 14],
  ].forEach(([row, step]) => sequencer.toggle(row!, step!));

  let grid = $state(snapshot());
  let playing = $state(false);
  let activeStep = $state(-1);
  let patternStatus = $state("Pattern changes save locally.");
  let activeKit = $state<ActiveSampleKit>();
  let savingToSongStudio = $state(false);
  let savedSongId = $state<string | undefined>();
  // Plain (non-reactive) so the storage effect doesn't invalidate itself.
  let initializedStore: SampleKitStore | undefined;
  let restoreKitId: string | undefined;
  let stepTimer: ReturnType<typeof setInterval> | undefined;
  let routerUnsubscribe: (() => void) | undefined;
  let playbackPending = false;
  let playbackRequest = 0;
  const directoryExportAvailable = canExportToDirectory();

  // Storage is attached by the parent layout from its own onMount, so react once
  // the shared SampleKitStore becomes available rather than reading it eagerly.
  $effect(() => {
    const store = runtime.sampleKits;
    if (!store || initializedStore === store) return;
    initializedStore = store;
    void runtime
      .readLocalState<string>(ACTIVE_KIT_ID)
      .then((kitId) => {
        restoreKitId = kitId ?? undefined;
      })
      .catch(() => undefined);
  });

  onMount(() => {
    void loadSavedPattern();
    routerUnsubscribe = runtime.router?.subscribe((event) => {
      if (event.type === "noteOn" && isMpcPadMidi(event.midiNote)) {
        playbackController.playMidi(event.midiNote, event.velocity ?? 0.9);
      }
    });
  });

  function snapshot(): boolean[][] {
    return sequencer.rows.map((_, rowIndex) => sequencer.rowPattern(rowIndex));
  }

  function toggleCell(rowIndex: number, step: number): void {
    sequencer.toggle(rowIndex, step);
    grid = snapshot();
    void savePattern();
  }

  function clearGrid(): void {
    if (playing) stopPattern();
    sequencer.clear();
    grid = snapshot();
    void savePattern();
  }

  async function togglePlay(): Promise<void> {
    if (playing) {
      stopPattern();
      return;
    }
    await playPattern();
  }

  async function playPattern(
    projection = projectPattern(),
    durationSec = patternDurationSec(),
  ): Promise<void> {
    if (playbackPending) return;
    const request = ++playbackRequest;
    playbackPending = true;
    try {
      if (!(await runtime.ensurePlaybackVoice())) {
        if (request === playbackRequest) {
          patternStatus = runtime.audioMessage || "Audio could not be enabled.";
        }
        return;
      }
      if (request !== playbackRequest) return;
      await restoreActiveKit();
      if (request !== playbackRequest) return;
      stopPattern(false);
      runtime.sound.startDrumPatternLoop(projection.drums, durationSec, 0.9);
      runtime.sound.startPatternLoop(projection.synth, durationSec, 0.9);
      startStepIndicator(durationSec);
      playing = true;
      patternStatus = "Playing pattern.";
    } catch (error) {
      if (request === playbackRequest) {
        stopPattern(false);
        patternStatus = error instanceof Error ? error.message : "Pattern playback failed.";
      }
    } finally {
      playbackPending = false;
    }
  }

  function stopPattern(invalidate = true): void {
    if (invalidate) playbackRequest += 1;
    runtime.sound.stopDrumPatternLoop();
    runtime.sound.stopPatternLoop();
    stopStepIndicator();
    playing = false;
  }

  interface StudioPatternProjection {
    drums: DrumPatternStep[];
    synth: SoundPatternStep[];
  }

  function projectPattern(rows = grid): StudioPatternProjection {
    const secondsPerStep = secondsPerSixteenth();
    const drums: DrumPatternStep[] = [];
    const synth: SoundPatternStep[] = [];

    for (let step = 0; step < STEPS; step += 1) {
      const activeRows = sequencer.rows.filter((_, rowIndex) => rows[rowIndex]?.[step] ?? false);
      const padIds = activeRows
        .map((row) => playbackController.padIdForMidi(row.midi))
        .filter((padId): padId is string => padId !== undefined);
      const midiNotes = activeRows
        .filter((row) => playbackController.padIdForMidi(row.midi) === undefined)
        .map((row) => row.midi);

      if (padIds.length > 0) drums.push({ padIds, offsetSeconds: step * secondsPerStep });
      if (midiNotes.length > 0) {
        synth.push({
          midiNotes,
          offsetSeconds: step * secondsPerStep,
          durationSeconds: Math.min(0.16, secondsPerStep * 0.9),
        });
      }
    }
    return { drums, synth };
  }

  function patternDurationSec(): number {
    return secondsPerSixteenth() * STEPS;
  }

  function secondsPerSixteenth(): number {
    return 60 / Math.max(1, runtime.transportBpm) / 4;
  }

  function startStepIndicator(durationSec: number): void {
    stopStepIndicator();
    activeStep = 0;
    let step = 0;
    stepTimer = setInterval(
      () => {
        step = (step + 1) % STEPS;
        activeStep = step;
      },
      Math.max(20, (durationSec / STEPS) * 1000),
    );
  }

  function stopStepIndicator(): void {
    if (stepTimer !== undefined) clearInterval(stepTimer);
    stepTimer = undefined;
    activeStep = -1;
  }

  function auditionPad(midiNote: number): void {
    void (async () => {
      if (!(await runtime.enableAudio())) return;
      await restoreActiveKit();
      if (!playbackController.playMidi(midiNote, 0.9)) {
        runtime.sound.playNote(midiNote, 0.15, undefined, 0.9);
      }
    })();
  }

  async function activateKit(kitId: string): Promise<void> {
    const store = runtime.sampleKits;
    if (!store) return;
    await runtime.enableAudio();
    const resolved = await store.resolvePlayback(kitId);
    activeKit = await playbackController.activate(resolved);
    restoreKitId = kitId;
    await runtime.writeLocalState(ACTIVE_KIT_ID, kitId);
    if (activeKit.pads.some((pad) => pad.status === "export-only")) {
      patternStatus =
        "The sample could not be decoded for browser playback. It remains available for MPC export.";
    }
  }

  // Restore the previously active kit on the first audio-enabling interaction.
  async function restoreActiveKit(): Promise<void> {
    if (activeKit || !restoreKitId || !runtime.sampleKits) return;
    try {
      await activateKit(restoreKitId);
    } catch {
      restoreKitId = undefined;
    }
  }

  async function buildExport(store: SampleKitStore, kitId: string) {
    const resolved = await store.resolvePlayback(kitId);
    const blobs = new Map<string, Blob>();
    for (const sample of resolved.samples) {
      if (sample.blob) blobs.set(sample.asset.binaryKey, sample.blob);
    }
    return buildMpcKitExport(resolved.kit, blobs);
  }

  async function exportDirectory(kitId: string): Promise<void> {
    const store = runtime.sampleKits;
    if (!store) return;
    const picker = (window as { showDirectoryPicker?: (options: { mode: string }) => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker;
    if (!picker) throw new Error("Choose an SD card or USB drive mounted on this computer.");

    let root: FileSystemDirectoryHandle;
    try {
      root = await picker({ mode: "readwrite" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Directory access was cancelled. Download a ZIP instead.");
      }
      throw new Error("Choose an SD card or USB drive mounted on this computer.");
    }

    const exportKit = await buildExport(store, kitId);
    try {
      await writeMpcKitToDirectory(exportKit, root);
    } catch {
      throw new Error(
        "The MPC export could not be written completely. Remove the partial folder before retrying.",
      );
    }
  }

  async function exportZip(kitId: string): Promise<void> {
    const store = runtime.sampleKits;
    if (!store) return;
    const exportKit = await buildExport(store, kitId);
    const result = await buildMpcKitZip(exportKit);
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** The boom-bap grid as a canonical Score: one voice per pad row, one note per
   *  active cell (a 16th note), tempo from the transport. */
  function patternScore(): Score {
    const beatsPerStep = 4 / STEPS;
    const notes: ScoreNote[] = [];
    sequencer.rows.forEach((row, rowIndex) => {
      for (let step = 0; step < STEPS; step += 1) {
        if (grid[rowIndex]?.[step]) {
          notes.push({
            midiNote: row.midi,
            startBeat: step * beatsPerStep,
            durationBeats: beatsPerStep,
            velocity: 0.9,
            voiceId: row.id,
          });
        }
      }
    });
    return {
      id: "studio-pattern",
      title: "Studio Pattern",
      origin: "generated",
      tempoMap: [{ atBeat: 0, bpm: runtime.transportBpm }],
      timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
      voices: sequencer.rows.map((row) => ({ id: row.id, name: row.name, role: "drums" as const })),
      notes,
      chords: [],
      sections: [{ id: "loop", name: "Beat loop", startBeat: 0, endBeat: 4 }],
      markers: [],
    };
  }

  function exportPatternMidi(): void {
    downloadBlob(scoreToMidiBlob(patternScore()), "studio-pattern.mid");
  }

  async function savePatternToSongStudio(): Promise<void> {
    if (!library || savingToSongStudio) return;
    savingToSongStudio = true;
    try {
      const saved = await library.saveScore(patternScore());
      savedSongId = saved.id;
      patternStatus = "Saved to Song Studio.";
      toast.success("Saved to Song Studio");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save to Song Studio.";
      patternStatus = message;
      toast.error(message);
    } finally {
      savingToSongStudio = false;
    }
  }

  let exporting = $state(false);

  /** Decode the active kit's playable samples into AudioBuffers keyed by MIDI
   *  note, so the WAV render mixes the real one-shots (synth fallback otherwise). */
  async function decodeActiveKitBuffers(): Promise<Map<number, AudioBuffer>> {
    const buffers = new Map<number, AudioBuffer>();
    const store = runtime.sampleKits;
    if (!store || !activeKit) return buffers;
    const AudioCtor =
      (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return buffers;

    const resolved = await store.resolvePlayback(activeKit.kitId);
    const blobById = new Map(resolved.samples.map((sample) => [sample.asset.id, sample.blob]));
    const context = new AudioCtor();
    try {
      for (const assignment of resolved.kit.assignments) {
        const blob = blobById.get(assignment.sampleId);
        if (!blob) continue;
        try {
          buffers.set(assignment.midiNote, await context.decodeAudioData(await blob.arrayBuffer()));
        } catch {
          // Undecodable sample: leave it to the synth fallback below.
        }
      }
    } finally {
      await context.close();
    }
    return buffers;
  }

  function patternAudioEvents(buffers: Map<number, AudioBuffer>): AudioRenderEvent[] {
    const secondsPerStep = secondsPerSixteenth();
    const synthDuration = Math.min(0.16, secondsPerStep * 0.9);
    const events: AudioRenderEvent[] = [];
    sequencer.rows.forEach((row, rowIndex) => {
      for (let step = 0; step < STEPS; step += 1) {
        if (!grid[rowIndex]?.[step]) continue;
        const startSec = step * secondsPerStep;
        const buffer = buffers.get(row.midi);
        events.push(
          buffer
            ? { startSec, buffer, velocity: 0.9 }
            : {
                startSec,
                frequency: midiToFrequency(row.midi),
                durationSec: synthDuration,
                velocity: 0.9,
              },
        );
      }
    });
    return events;
  }

  async function exportPatternWav(): Promise<void> {
    if (exporting) return;
    exporting = true;
    patternStatus = "Rendering audio…";
    try {
      // Offline render — no live AudioContext needed. Samples are mixed in only
      // if a kit is already active; otherwise rows render as synth fallback.
      const buffers = await decodeActiveKitBuffers();
      const blob = await renderEventsToWav(patternAudioEvents(buffers), {
        durationSec: patternDurationSec(),
      });
      downloadBlob(blob, "studio-pattern.wav");
      patternStatus = "Exported studio-pattern.wav.";
      toast.success("Exported studio-pattern.wav");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio export failed.";
      patternStatus = message;
      toast.error(message);
    } finally {
      exporting = false;
    }
  }

  function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function loadSavedPattern(): Promise<void> {
    const saved = await runtime.readLocalState<StepSequencerPattern>(STUDIO_PATTERN_ID);
    if (!isStepSequencerPattern(saved)) return;
    sequencer.applyPattern(saved);
    grid = snapshot();
    patternStatus = "Loaded saved local pattern.";
  }

  async function savePattern(): Promise<void> {
    try {
      await runtime.writeLocalState(STUDIO_PATTERN_ID, sequencer.toPattern());
      patternStatus = "Saved locally.";
      toast.success("Pattern saved locally");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pattern could not be saved.";
      patternStatus = message;
      toast.error(message);
    }
  }

  function isStepSequencerPattern(value: unknown): value is StepSequencerPattern {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<StepSequencerPattern>;
    return (
      candidate.steps === STEPS &&
      Array.isArray(candidate.rows) &&
      candidate.rows.every(
        (row) =>
          row &&
          typeof row === "object" &&
          typeof row.id === "string" &&
          Array.isArray(row.steps) &&
          row.steps.every((step) => Number.isInteger(step)),
      )
    );
  }

  onDestroy(() => {
    playbackRequest += 1;
    stopPattern();
    routerUnsubscribe?.();
    playbackController.dispose();
  });
</script>

<!-- minmax(0,1fr): let the track shrink below the 640px step grid so its overflow-x-auto scroller engages on phones. -->
<div class="grid grid-cols-[minmax(0,1fr)] gap-6">
  <SectionHeading
    title="Studio"
    description="DAW-lite for the MPC pads: sequence a pattern and play it back. Complements your gear, doesn't replace it."
  />

  <!-- One transport strip above the surface: Play first, then the pattern's actions. -->
  <TransportStrip>
    <Button type="button" onclick={() => void togglePlay()}>
      {#if playing}
        <Pause class="size-4" aria-hidden="true" />Pause
      {:else}
        <Play class="size-4" aria-hidden="true" />Play
      {/if}
    </Button>
    <span class="rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs font-semibold text-muted-foreground">
      {STEPS} steps · 1 bar
    </span>
    <span class="text-xs text-muted-foreground" role="status" aria-live="polite">{patternStatus}</span>
    {#snippet actions()}
      <Button type="button" variant="ghost" onclick={clearGrid}>
        <Trash2 class="size-4" aria-hidden="true" />Clear
      </Button>
      <Button type="button" variant="outline" onclick={exportPatternMidi}>
        <Download class="size-4" aria-hidden="true" />Export MIDI
      </Button>
      <Button type="button" variant="outline" disabled={exporting} onclick={() => void exportPatternWav()}>
        <Download class="size-4" aria-hidden="true" />Export WAV
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!library || savingToSongStudio}
        onclick={() => void savePatternToSongStudio()}
      >
        <ListMusic class="size-4" aria-hidden="true" />
        {savingToSongStudio ? "Saving..." : "Save to Song Studio"}
      </Button>
      {#if savedSongId}
        <Button href={`/music/songs/${savedSongId}`} variant="outline">Open Song Studio</Button>
      {/if}
    {/snippet}
  </TransportStrip>

  <!-- The grid on a hardware stage: row labels, beat numbers, a playhead, steps in the MPC hue. -->
  <PracticeStage instrument="mpc" class="p-4 sm:p-5">
    <p class="mb-3 eyebrow text-stage-muted">Sequencer · Boom Bap</p>
    <div class="overflow-x-auto">
      <div class="min-w-[640px] space-y-1.5">
        <!-- step ruler -->
        <div class="flex items-center gap-1 pl-24">
          {#each Array(STEPS) as _, step}
            <div
              class="flex-1 text-center font-mono text-[10px] font-semibold {activeStep === step
                ? 'text-practice-accent'
                : 'text-stage-muted'}"
            >
              {step % 4 === 0 ? step / 4 + 1 : "·"}
            </div>
          {/each}
        </div>

        {#each sequencer.rows as row, rowIndex}
          <div class="flex items-center gap-1">
            <div class="flex w-24 items-center gap-2 pr-2">
              <span class="size-2 rounded-sm bg-instr"></span>
              <span class="truncate text-xs font-semibold">{row.name}</span>
            </div>
            {#each Array(STEPS) as _, step}
              <button
                type="button"
                aria-label="{row.name} step {step + 1}"
                aria-pressed={grid[rowIndex]?.[step] ?? false}
                onclick={() => toggleCell(rowIndex, step)}
                class="aspect-square flex-1 rounded-md border transition-colors {grid[rowIndex]?.[
                  step
                ]
                  ? step % 4 === 0
                    ? 'border-transparent bg-instr'
                    : 'border-transparent bg-instr/75'
                  : step % 4 === 0
                    ? 'border-stage-line bg-stage-2 hover:bg-stage-2/70'
                    : 'border-stage-line/60 bg-transparent hover:bg-stage-2/60'} {activeStep === step
                  ? 'ring-2 ring-practice-accent'
                  : ''}"
              ></button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </PracticeStage>

  {#if runtime.sampleKits}
    <SampleKitPanel
      store={runtime.sampleKits}
      {activeKit}
      onactivate={activateKit}
      onaudition={auditionPad}
      ondirectoryexport={exportDirectory}
      onzipexport={exportZip}
      {directoryExportAvailable}
    />
  {/if}

  <StudioPadLeds {runtime} {activeKit} />

  <PracticeStage instrument="mpc" class="p-4 sm:p-5">
    <p class="mb-3 eyebrow text-stage-muted">Pad bank · Boom Bap · tap to audition</p>
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {#each sequencer.rows as row}
        <button
          type="button"
          onclick={() => auditionPad(row.midi)}
          class="grid aspect-square place-items-center rounded-xl border border-stage-line bg-instr/25 text-sm font-bold text-stage-foreground shadow-[inset_0_1px_0_oklch(1_0_0/12%),0_3px_0_oklch(0_0_0/25%)] transition-transform hover:scale-[1.03] active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-practice-accent"
        >
          {row.name}
        </button>
      {/each}
    </div>
  </PracticeStage>
</div>
