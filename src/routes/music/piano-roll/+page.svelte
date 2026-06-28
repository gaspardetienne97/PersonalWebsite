<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import Download from "lucide-svelte/icons/download";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import VolumeX from "lucide-svelte/icons/volume-x";

  import type { Score } from "@repo/music-core/domain";
  import {
    midiToFrequency,
    renderEventsToWav,
    type AudioRenderEvent,
  } from "@repo/music-core/engines/audio-export";
  import { scoreToMidiBlob } from "@repo/music-core/engines/midi-export";
  import {
    addVoice,
    buildPianoRollGrid,
    clearVoice,
    createPianoRollScore,
    noteAt,
    removeVoice,
    resizeNoteAt,
    setVoiceVelocity,
    toggleNoteAt,
    withoutVoices,
  } from "@repo/music-core/engines/piano-roll";
  import { scoreToPattern } from "@repo/music-core/engines/sound";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";

  let { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();

  const PITCH_HIGH = 84; // C6
  const PITCH_LOW = 36; // C2
  const STEP_BEATS = 0.25; // 1/16 grid
  const BEATS_PER_BAR = 4;
  const MIN_BARS = 2;
  const SCORE_ID = "music.piano-roll.score";
  // Theme-driven track colours (multitrack-lite); one per default voice.
  const TRACK_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
  const NOTE_LENGTHS = [
    { label: "1/16", beats: 0.25 },
    { label: "1/8", beats: 0.5 },
    { label: "1/4", beats: 1 },
    { label: "1/2", beats: 2 },
  ];

  const pitches = Array.from({ length: PITCH_HIGH - PITCH_LOW + 1 }, (_, i) => PITCH_HIGH - i);

  let score = $state.raw<Score>(seededScore());
  let activeVoiceId = $state("lead");
  let mutedVoiceIds = $state<string[]>([]);
  let noteLengthBeats = $state(0.5);
  let noteVelocity = $state(0.85);
  let gridZoom = $state(1);
  let visibleBars = $state(MIN_BARS);
  let resizeMode = $state(false);
  let resizing = $state<{ voiceId: string; midiNote: number; beat: number } | undefined>();
  let playing = $state(false);
  let activeStep = $state(-1);
  let status = $state("Click cells to place notes. Changes save locally.");
  let storageLoaded = false; // plain, non-reactive (see recording route): wait for storage.
  let stepTimer: ReturnType<typeof setInterval> | undefined;

  function seededScore(): Score {
    // A one-bar C-major arpeggio in Lead so Play does something on first load.
    let next = createPianoRollScore(runtimeBpm());
    [
      [60, 0],
      [64, 1],
      [67, 2],
      [72, 3],
    ].forEach(([midi, beat]) => {
      next = toggleNoteAt(next, {
        voiceId: "lead",
        midiNote: midi!,
        startBeat: beat!,
        durationBeats: 1,
      });
    });
    return next;
  }

  function runtimeBpm(): number {
    return Math.max(1, runtime.transportBpm);
  }

  function secondsPerBeat(): number {
    return 60 / runtimeBpm();
  }

  const grid = $derived(
    buildPianoRollGrid(score, {
      beatsPerBar: BEATS_PER_BAR,
      stepBeats: STEP_BEATS,
      minBars: visibleBars,
    }),
  );
  const gridMinWidth = $derived(Math.round(340 * grid.barCount * gridZoom));

  // Per-cell cover lookup: key = midi*100 + step → which voice owns it + active?
  const coverMap = $derived.by(() => {
    const map = new Map<number, { voiceIndex: number; active: boolean }>();
    for (const note of score.notes) {
      const voiceIndex = score.voices.findIndex((voice) => voice.id === note.voiceId);
      const startStep = Math.round(note.startBeat / STEP_BEATS);
      const endStep = Math.round((note.startBeat + note.durationBeats) / STEP_BEATS);
      for (let step = startStep; step < endStep && step < grid.stepCount; step += 1) {
        const key = note.midiNote * 100 + step;
        const active = note.voiceId === activeVoiceId;
        const existing = map.get(key);
        if (!existing || (active && !existing.active)) map.set(key, { voiceIndex, active });
      }
    }
    return map;
  });

  const activeVoiceVelocityLane = $derived.by(() =>
    grid.steps.map(({ beat }) => {
      const notes = score.notes.filter(
        (note) =>
          note.voiceId === activeVoiceId &&
          beat >= note.startBeat &&
          beat < note.startBeat + note.durationBeats,
      );
      if (notes.length === 0) return 0;
      return notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length;
    }),
  );

  $effect(() => {
    void score;
    const durationSec = grid.beatCount * secondsPerBeat();
    runtime.setPlaybackSource({
      label: "Piano roll",
      durationSec,
      play: () => playScore(),
      stop: () => stopScore(),
    });
  });

  // Storage attaches from the layout's onMount (after this page's), so load once
  // it's available rather than reading eagerly (which would silently no-op).
  $effect(() => {
    const media = runtime.media;
    if (!media || storageLoaded) return;
    storageLoaded = true;
    void loadScore();
  });

  onMount(() => undefined);

  onDestroy(() => {
    stopScore();
    runtime.setPlaybackSource(undefined);
  });

  function toggleCell(midiNote: number, step: number): void {
    if (resizeMode) return;
    score = toggleNoteAt(score, {
      voiceId: activeVoiceId,
      midiNote,
      startBeat: step * STEP_BEATS,
      durationBeats: noteLengthBeats,
      velocity: noteVelocity,
    });
    void saveScore();
  }

  function toggleResizeMode(): void {
    resizeMode = !resizeMode;
    resizing = undefined;
    status = resizeMode ? "Drag a note end to resize it." : "Click cells to place notes.";
  }

  function startResize(midiNote: number, step: number): void {
    if (!resizeMode) return;
    const beat = step * STEP_BEATS;
    const note = noteAt(score, activeVoiceId, midiNote, beat);
    if (!note) return;
    resizing = { voiceId: activeVoiceId, midiNote, beat };
  }

  async function finishResize(midiNote: number, step: number): Promise<void> {
    if (!resizeMode || !resizing) return;
    const edit = resizing;
    resizing = undefined;
    if (edit.midiNote !== midiNote) return;
    score = resizeNoteAt(score, {
      ...edit,
      endBeat: (step + 1) * STEP_BEATS,
      minDurationBeats: STEP_BEATS,
    });
    await saveScore();
    status = `Resized ${midiToNote(midiNote)}.`;
  }

  function setVelocity(value: number): void {
    noteVelocity = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  }

  function onVelocityInput(event: Event): void {
    setVelocity(Number((event.currentTarget as HTMLInputElement).value));
  }

  function onZoomInput(event: Event): void {
    gridZoom = Number((event.currentTarget as HTMLInputElement).value);
  }

  async function applyVelocityToTrack(): Promise<void> {
    score = setVoiceVelocity(score, activeVoiceId, noteVelocity);
    await saveScore();
    status = `Set ${activeVoiceName()} velocity to ${velocityPercent(noteVelocity)}.`;
  }

  async function addTrack(): Promise<void> {
    score = addVoice(score);
    activeVoiceId = score.voices.at(-1)?.id ?? activeVoiceId;
    await saveScore();
    status = `Added ${activeVoiceName()}.`;
  }

  async function removeActiveTrack(): Promise<void> {
    if (score.voices.length <= 1) return;
    const index = score.voices.findIndex((voice) => voice.id === activeVoiceId);
    score = removeVoice(score, activeVoiceId);
    mutedVoiceIds = mutedVoiceIds.filter((id) => id !== activeVoiceId);
    activeVoiceId = score.voices[Math.max(0, index - 1)]?.id ?? score.voices[0]?.id ?? activeVoiceId;
    await saveScore();
    status = `Removed track.`;
  }

  function addBar(): void {
    visibleBars = grid.barCount + 1;
    status = `${visibleBars} bars visible.`;
  }

  function clearTrack(voiceId: string): void {
    if (playing) stopScore();
    score = clearVoice(score, voiceId);
    void saveScore();
  }

  function toggleMute(voiceId: string): void {
    mutedVoiceIds = mutedVoiceIds.includes(voiceId)
      ? mutedVoiceIds.filter((id) => id !== voiceId)
      : [...mutedVoiceIds, voiceId];
  }

  async function togglePlay(): Promise<void> {
    if (playing) {
      stopScore();
      return;
    }
    await playScore();
  }

  async function playScore(): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    stopScore();
    const audible = withoutVoices(score, mutedVoiceIds);
    const pattern = scoreToPattern(audible, { bpm: runtimeBpm() });
    const durationSec = grid.beatCount * secondsPerBeat();
    runtime.sound.startPatternLoop(pattern.steps, durationSec, 0.9);
    startStepIndicator(durationSec);
    playing = true;
  }

  function stopScore(): void {
    runtime.sound.stopPatternLoop();
    stopStepIndicator();
    playing = false;
  }

  function startStepIndicator(durationSec: number): void {
    stopStepIndicator();
    activeStep = 0;
    let step = 0;
    stepTimer = setInterval(
      () => {
        step = (step + 1) % grid.stepCount;
        activeStep = step;
      },
      Math.max(20, (durationSec / grid.stepCount) * 1000),
    );
  }

  function stopStepIndicator(): void {
    if (stepTimer !== undefined) clearInterval(stepTimer);
    stepTimer = undefined;
    activeStep = -1;
  }

  function exportMidi(): void {
    downloadBlob(scoreToMidiBlob(score), "piano-roll.mid");
  }

  let exporting = $state(false);

  async function exportWav(): Promise<void> {
    if (exporting) return;
    exporting = true;
    status = "Rendering audio…";
    try {
      const spb = secondsPerBeat();
      const events: AudioRenderEvent[] = score.notes.map((note) => ({
        startSec: note.startBeat * spb,
        frequency: midiToFrequency(note.midiNote),
        durationSec: note.durationBeats * spb,
        velocity: note.velocity,
      }));
      const blob = await renderEventsToWav(events, {
        durationSec: grid.beatCount * spb,
      });
      downloadBlob(blob, "piano-roll.wav");
      status = "Exported piano-roll.wav.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Audio export failed.";
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

  async function loadScore(): Promise<void> {
    const saved = await runtime.readLocalState<Score>(SCORE_ID);
    if (isScore(saved)) {
      score = saved;
      status = "Loaded saved piano roll.";
    }
  }

  async function saveScore(): Promise<void> {
    try {
      await runtime.writeLocalState(SCORE_ID, score);
      status = "Saved locally.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Could not save.";
    }
  }

  function isScore(value: unknown): value is Score {
    return (
      !!value &&
      typeof value === "object" &&
      Array.isArray((value as Score).notes) &&
      Array.isArray((value as Score).voices)
    );
  }

  function cellLabel(midiNote: number, step: number): string {
    return `${midiToNote(midiNote)} step ${step + 1}`;
  }

  function activeVoiceName(): string {
    return score.voices.find((voice) => voice.id === activeVoiceId)?.name ?? "track";
  }

  function trackColor(index: number): string {
    return TRACK_COLORS[index % TRACK_COLORS.length] ?? "bg-chart-1";
  }

  function velocityPercent(velocity: number): string {
    return `${Math.round(velocity * 100)}%`;
  }

  function gridSummary(): string {
    return `${grid.barCount} ${grid.barCount === 1 ? "bar" : "bars"}`;
  }
</script>

<svelte:head>
  <title>Piano Roll | Musicianship OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Piano Roll"
    subtitle="Multitrack note editor — sketch melodies and parts on a pitch × time grid, then play or export. {gridSummary()}, 4/4."
  >
    {#snippet controls()}
      <Button type="button" variant="outline" onclick={() => clearTrack(activeVoiceId)}>
        <Trash2 class="size-4" aria-hidden="true" />Clear track
      </Button>
      <Button type="button" variant="outline" onclick={() => void addTrack()}>Add track</Button>
      <Button
        type="button"
        variant="outline"
        disabled={score.voices.length <= 1}
        onclick={() => void removeActiveTrack()}
      >
        Remove track
      </Button>
      <Button
        type="button"
        variant={resizeMode ? "default" : "outline"}
        aria-pressed={resizeMode}
        onclick={toggleResizeMode}
      >
        Resize notes
      </Button>
      <Button type="button" variant="outline" onclick={addBar}>Add bar</Button>
      <Button type="button" variant="outline" onclick={exportMidi}>
        <Download class="size-4" aria-hidden="true" />Export MIDI
      </Button>
      <Button type="button" variant="outline" disabled={exporting} onclick={() => void exportWav()}>
        <Download class="size-4" aria-hidden="true" />Export WAV
      </Button>
      <Button type="button" onclick={() => void togglePlay()}>
        {#if playing}
          <Pause class="size-4" aria-hidden="true" />Stop
        {:else}
          <Play class="size-4" aria-hidden="true" />Play
        {/if}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <Card.Root>
    <Card.Header class="flex-row flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        {#each score.voices as voice, voiceIndex (voice.id)}
          <div class="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={activeVoiceId === voice.id}
              onclick={() => (activeVoiceId = voice.id)}
              class="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors {activeVoiceId ===
              voice.id
                ? 'border-primary bg-primary/10'
                : 'border-input hover:bg-muted'}"
            >
              <span class="size-3 rounded-sm {trackColor(voiceIndex)} {mutedVoiceIds.includes(voice.id) ? 'opacity-30' : ''}"></span>
              {voice.name}
            </button>
            <button
              type="button"
              aria-label="Mute {voice.name}"
              aria-pressed={mutedVoiceIds.includes(voice.id)}
              onclick={() => toggleMute(voice.id)}
              class="rounded-md border border-input p-1 transition-colors hover:bg-muted {mutedVoiceIds.includes(
                voice.id,
              )
                ? 'text-destructive'
                : 'text-muted-foreground'}"
            >
              <VolumeX class="size-3.5" aria-hidden="true" />
            </button>
          </div>
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">{status}</span>
        <div class="flex items-center gap-1" role="group" aria-label="Note length">
          {#each NOTE_LENGTHS as length (length.beats)}
            <button
              type="button"
              aria-pressed={noteLengthBeats === length.beats}
              onclick={() => (noteLengthBeats = length.beats)}
              class="rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors {noteLengthBeats ===
              length.beats
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-muted'}"
            >
              {length.label}
            </button>
          {/each}
        </div>
        <label class="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Velocity
          <input
            aria-label="Note velocity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={noteVelocity}
            oninput={onVelocityInput}
            class="w-28 accent-primary"
          />
          <span class="w-9 text-right tabular-nums">{velocityPercent(noteVelocity)}</span>
        </label>
        <Button type="button" variant="outline" size="sm" onclick={() => void applyVelocityToTrack()}>
          Apply velocity
        </Button>
        <label class="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Zoom
          <input
            aria-label="Horizontal zoom"
            type="range"
            min="1"
            max="2"
            step="0.25"
            value={gridZoom}
            oninput={onZoomInput}
            class="w-24 accent-primary"
          />
          <span class="w-8 text-right tabular-nums">{gridZoom.toFixed(2)}x</span>
        </label>
      </div>
    </Card.Header>
    <Card.Content>
      <div class="max-h-[28rem] overflow-auto">
        <div style={`min-width: ${gridMinWidth}px`}>
          <!-- step ruler -->
          <div class="sticky top-0 z-10 flex gap-px bg-background pl-12">
            {#each grid.steps as step (step.step)}
              <div
                class="flex-1 text-center text-[10px] font-semibold {activeStep === step.step
                  ? 'text-primary'
                  : 'text-muted-foreground'}"
              >
                {step.isBarStart ? step.bar : ""}
              </div>
            {/each}
          </div>

          {#each pitches as midiNote (midiNote)}
            {@const isC = midiNote % 12 === 0}
            <div class="flex items-center gap-px">
              <div
                class="w-12 shrink-0 pr-1 text-right text-[10px] tabular-nums {isC
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground/60'}"
              >
                {isC ? midiToNote(midiNote) : ""}
              </div>
              {#each grid.steps as step (step.step)}
                {@const cover = coverMap.get(midiNote * 100 + step.step)}
                <button
                  type="button"
                  aria-label={cellLabel(midiNote, step.step)}
                  aria-pressed={!!cover && cover.active}
                  onpointerdown={() => startResize(midiNote, step.step)}
                  onpointerup={() => void finishResize(midiNote, step.step)}
                  onclick={() => toggleCell(midiNote, step.step)}
                  class="h-3.5 flex-1 rounded-[2px] border border-transparent transition-colors {cover
                    ? `${trackColor(cover.voiceIndex)} ${cover.active ? '' : 'opacity-40'}`
                    : isC
                      ? 'bg-muted/70 hover:bg-muted'
                        : step.step % 4 === 0
                          ? 'bg-muted/40 hover:bg-muted'
                          : 'bg-background hover:bg-muted/60'} {resizeMode
                    ? 'cursor-ew-resize'
                    : ''} {activeStep === step.step
                    ? 'ring-1 ring-primary/40'
                    : ''}"
                ></button>
              {/each}
            </div>
          {/each}

          <div class="mt-3 flex items-end gap-px pl-12" aria-label="Velocity lane">
            {#each activeVoiceVelocityLane as velocity, step (step)}
              <button
                type="button"
                aria-label={`Velocity step ${step + 1}: ${velocityPercent(velocity)}`}
                onclick={() => setVelocity(velocity || noteVelocity)}
                class="flex h-14 flex-1 items-end rounded-[2px] bg-muted/40 p-px hover:bg-muted {activeStep ===
                step
                  ? 'ring-1 ring-primary/40'
                  : ''}"
              >
                <span
                  class="w-full rounded-[1px] bg-primary/70"
                  style={`height: ${Math.max(velocity * 100, velocity > 0 ? 8 : 0)}%`}
                ></span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</PracticeScreen>
