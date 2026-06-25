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
    clearVoice,
    createPianoRollScore,
    scoreLoopBeats,
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
  const STEPS = 32; // 2 bars of 4/4
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

  // Per-cell cover lookup: key = midi*100 + step → which voice owns it + active?
  const coverMap = $derived.by(() => {
    const map = new Map<number, { voiceIndex: number; active: boolean }>();
    for (const note of score.notes) {
      const voiceIndex = score.voices.findIndex((voice) => voice.id === note.voiceId);
      const startStep = Math.round(note.startBeat / STEP_BEATS);
      const endStep = Math.round((note.startBeat + note.durationBeats) / STEP_BEATS);
      for (let step = startStep; step < endStep && step < STEPS; step += 1) {
        const key = note.midiNote * 100 + step;
        const active = note.voiceId === activeVoiceId;
        const existing = map.get(key);
        if (!existing || (active && !existing.active)) map.set(key, { voiceIndex, active });
      }
    }
    return map;
  });

  $effect(() => {
    void score;
    const durationSec = scoreLoopBeats(score) * secondsPerBeat();
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
    score = toggleNoteAt(score, {
      voiceId: activeVoiceId,
      midiNote,
      startBeat: step * STEP_BEATS,
      durationBeats: noteLengthBeats,
    });
    void saveScore();
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
    const durationSec = scoreLoopBeats(score) * secondsPerBeat();
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
        durationSec: scoreLoopBeats(score) * spb,
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
</script>

<svelte:head>
  <title>Piano Roll | Musicianship OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Piano Roll"
    subtitle="Multitrack note editor — sketch melodies and parts on a pitch × time grid, then play or export. Two bars, 4/4."
  >
    {#snippet controls()}
      <Button type="button" variant="outline" onclick={() => clearTrack(activeVoiceId)}>
        <Trash2 class="size-4" aria-hidden="true" />Clear track
      </Button>
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
              <span
                class="size-3 rounded-sm {TRACK_COLORS[voiceIndex]} {mutedVoiceIds.includes(voice.id)
                  ? 'opacity-30'
                  : ''}"
              ></span>
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
      </div>
    </Card.Header>
    <Card.Content>
      <div class="max-h-[28rem] overflow-auto">
        <div class="min-w-[680px]">
          <!-- step ruler -->
          <div class="sticky top-0 z-10 flex gap-px bg-background pl-12">
            {#each Array(STEPS) as _, step (step)}
              <div
                class="flex-1 text-center text-[10px] font-semibold {activeStep === step
                  ? 'text-primary'
                  : 'text-muted-foreground'}"
              >
                {step % 4 === 0 ? step / 4 + 1 : ""}
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
              {#each Array(STEPS) as _, step (step)}
                {@const cover = coverMap.get(midiNote * 100 + step)}
                <button
                  type="button"
                  aria-label={cellLabel(midiNote, step)}
                  aria-pressed={!!cover && cover.active}
                  onclick={() => toggleCell(midiNote, step)}
                  class="h-3.5 flex-1 rounded-[2px] border border-transparent transition-colors {cover
                    ? `${TRACK_COLORS[cover.voiceIndex]} ${cover.active ? '' : 'opacity-40'}`
                    : isC
                      ? 'bg-muted/70 hover:bg-muted'
                      : step % 4 === 0
                        ? 'bg-muted/40 hover:bg-muted'
                        : 'bg-background hover:bg-muted/60'} {activeStep === step
                    ? 'ring-1 ring-primary/40'
                    : ''}"
                ></button>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</PracticeScreen>
