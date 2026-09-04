<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Upload from "lucide-svelte/icons/upload";

  import { monotonicMs, type NoteEvent, type Score } from "@repo/music-core/domain";
  import {
    buildScorePracticePlan,
    ScorePracticeSession,
    type ScorePracticeState,
  } from "@repo/music-core/engines/score-practice";
  import { scoreToPattern } from "@repo/music-core/engines/sound";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";
  import {
    extractedNotesToDraft,
    parseManualTranscription,
    transcriptionDraftToScore,
    type ExtractedTranscriptionNote,
    type TranscriptionDraft,
  } from "@repo/music-core/engines/transcription";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import type { AudioTakeRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import { createBasicPitchExtractor } from "../../transcribe/basic-pitch-extractor";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface TranscriptionSaver {
    saveScore(score: Score): Promise<{ id: string; title: string }>;
  }

  type TranscriptionExtractor = (file: File) => Promise<ExtractedTranscriptionNote[]>;

  const {
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
    extractor,
    runtime = useMusicRuntime(),
  }: {
    library?: TranscriptionSaver;
    extractor?: TranscriptionExtractor;
    runtime?: MusicRuntime;
  } = $props();

  let title = $state("Voice memo");
  let bpm = $state(90);
  let manual = $state("C4 0 1\nE4 1 1\nG4 2 1");
  let audioFile = $state<File | undefined>();
  let draft = $state<TranscriptionDraft | undefined>();
  let score = $state.raw<Score>();
  let status = $state("Add notes manually, or attach audio for metadata.");
  let saving = $state(false);
  let extracting = $state(false);
  let extractionProgress = $state(0);
  let savedSongId = $state<string | undefined>();
  let savedTakes = $state<AudioTakeRow[]>([]);
  let practiceSession: ScorePracticeSession | undefined;
  let practiceState = $state.raw<ScorePracticeState>();
  let finishingTrainer = false;
  let unsubscribeInput = () => undefined;
  let previewPlaying = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let previewGeneration = 0;

  const trainerProgress = $derived(practiceState?.progress ?? 0);
  const trainerRunning = $derived(practiceState?.status === "running");
  const trainerComplete = $derived(practiceState?.status === "complete");
  const expectedNames = $derived(
    (practiceState?.live?.expectedMidiNotes ?? []).map((midiNote) => midiToNote(midiNote)),
  );
  const practiceNotes = $derived(
    score ? [...new Set(score.notes.map(({ midiNote }) => midiToNote(midiNote)))] : [],
  );

  onMount(() => {
    unsubscribeInput = runtime.router.subscribe((event) => {
      if (!trainerRunning || !practiceSession) return;
      practiceState = practiceSession.accept(event);
      if ((practiceState.live?.progress ?? practiceState.progress) >= 1) finishTrainer();
    });
    void loadSavedTakes();
  });

  onDestroy(() => {
    unsubscribeInput();
    stopPreview();
  });

  function onAudioFile(files: FileList | null): void {
    audioFile = files?.[0];
    if (audioFile) status = `Attached ${audioFile.name}. Manual notes still drive this draft.`;
  }

  async function loadSavedTakes(): Promise<void> {
    savedTakes = (await runtime.media?.listTakes()) ?? [];
  }

  async function useSavedTake(take: AudioTakeRow): Promise<void> {
    const blob = await runtime.media?.takeBlob(take.id);
    if (!blob) {
      status = "Saved take audio is unavailable.";
      return;
    }
    const extension = take.mimeType.includes("webm") ? "webm" : take.mimeType.includes("wav") ? "wav" : "audio";
    audioFile = new File([blob], `${take.name}.${extension}`, { type: take.mimeType });
    status = `Attached ${audioFile.name}. Manual notes still drive this draft.`;
  }

  function buildTranscription(): void {
    stopPreview();
    try {
      draft = parseManualTranscription(manual, {
        id: "manual-transcription",
        title,
        bpm,
        source: audioFile
          ? {
              kind: "audio-file",
              name: audioFile.name,
              mimeType: audioFile.type,
            }
          : { kind: "manual", name: "Manual entry" },
      });
      score = transcriptionDraftToScore(draft);
      savedSongId = undefined;
      resetTrainer();
      status = `Built ${draft.notes.length} notes.`;
    } catch (error) {
      draft = undefined;
      score = undefined;
      resetTrainer();
      status = error instanceof Error ? error.message : "Could not build transcription.";
    }
  }

  async function extractNotes(): Promise<void> {
    stopPreview();
    if (!audioFile) {
      status = "Attach an audio file before extracting notes.";
      return;
    }
    const runExtractor =
      extractor ??
      (browser
        ? createBasicPitchExtractor((progress) => {
            extractionProgress = progress;
            status = `Extracting notes locally (${Math.round(progress * 100)}%).`;
          })
        : undefined);
    if (!runExtractor) {
      status = "Automatic pitch extraction is unavailable in this environment.";
      return;
    }

    extracting = true;
    extractionProgress = 0;
    try {
      draft = extractedNotesToDraft(await runExtractor(audioFile), {
        id: "audio-transcription",
        title,
        bpm,
        source: {
          kind: "audio-file",
          name: audioFile.name,
          mimeType: audioFile.type,
        },
      });
      score = transcriptionDraftToScore(draft);
      savedSongId = undefined;
      resetTrainer();
      status = `Extracted ${draft.notes.length} notes.`;
    } catch (error) {
      draft = undefined;
      score = undefined;
      resetTrainer();
      status = error instanceof Error ? error.message : "Could not extract notes from audio.";
    } finally {
      extractionProgress = 0;
      extracting = false;
    }
  }

  async function saveToRepertoire(): Promise<void> {
    if (!score || !library || saving) return;
    saving = true;
    try {
      const saved = await library.saveScore(score);
      savedSongId = saved.id;
      status = "Saved transcription to repertoire.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Could not save transcription.";
    } finally {
      saving = false;
    }
  }

  async function previewTranscription(): Promise<void> {
    if (previewPlaying) {
      stopPreview();
      status = "Preview paused.";
      return;
    }
    if (!score || score.notes.length === 0) {
      status = "Build or extract a transcription before previewing it.";
      return;
    }
    const generation = ++previewGeneration;
    try {
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === previewGeneration) status = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      if (generation !== previewGeneration) return;
      const pattern = scoreToPattern(score, { bpm });
      runtime.sound.playPattern(pattern.steps);
      previewPlaying = true;
      status = `Previewing ${score.notes.length} notes.`;
      previewTimer = setTimeout(finishPreview, Math.max(300, pattern.durationSec * 1_000));
    } catch (error) {
      if (generation !== previewGeneration) return;
      stopPreview();
      status = error instanceof Error ? error.message : "Transcription preview failed.";
    }
  }

  function finishPreview(): void {
    runtime.sound.stopPattern();
    previewTimer = undefined;
    previewPlaying = false;
    status = "Preview complete.";
  }

  function stopPreview(): void {
    previewGeneration += 1;
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    previewTimer = undefined;
    runtime.sound.stopPattern();
    previewPlaying = false;
  }

  function startTrainer(): void {
    stopPreview();
    if (!score || score.notes.length === 0) {
      status = "Build a transcription with at least one note before practicing.";
      return;
    }
    try {
      practiceSession = new ScorePracticeSession(
        buildScorePracticePlan(score, { kind: "full" }),
        {
          mode: "wait",
          bpm,
          strictness: "normal",
          totalTakes: 1,
        },
      );
      practiceState = practiceSession.startExecution(monotonicMs(performance.now()));
      status = "Trainer running. Play each expected note to advance.";
    } catch (error) {
      resetTrainer();
      status = error instanceof Error ? error.message : "Could not start transcription trainer.";
    }
  }

  function finishTrainer(): void {
    if (!practiceSession || finishingTrainer) return;
    finishingTrainer = true;
    try {
      practiceState = practiceSession.finishExecution();
      status = "Trainer complete.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Could not finish transcription trainer.";
    } finally {
      finishingTrainer = false;
    }
  }

  function resetTrainer(): void {
    practiceSession = undefined;
    practiceState = undefined;
    finishingTrainer = false;
  }

  function playPracticeNote(noteName: string): void {
    const event: NoteEvent = {
      type: "noteOn",
      midiNote: noteToMidi(noteName),
      velocity: 1,
      source: "onscreen",
      timestamp: monotonicMs(performance.now()),
      clock: "performance",
      instrument: runtime.activeInstrument,
    };
    runtime.router.push(event);
  }
</script>

<svelte:head>
  <title>Transcription Trainer | Practice OS</title>
  <meta
    name="description"
    content="Draft an audio transcription locally and save it as a canonical practice score."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader level={2} compact
    title="Transcription Trainer"
    subtitle="Extract notes locally from an audio file, edit or enter them manually, then practice and save a canonical transcription score."
  />

  <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <Card.Root>
      <Card.Header>
        <Card.Description>Manual transcription</Card.Description>
        <Card.Title>Notes, start beat, duration</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-sm font-medium">
            Title
            <input bind:value={title} class="rounded-md border bg-background px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm font-medium">
            BPM
            <input
              bind:value={bpm}
              type="number"
              min="30"
              max="240"
              class="rounded-md border bg-background px-3 py-2"
            />
          </label>
        </div>
        <textarea
          bind:value={manual}
          aria-label="Manual transcription notes"
          class="min-h-44 rounded-md border bg-background p-3 font-mono text-sm"
          spellcheck="false"
        ></textarea>
        <p class="text-xs text-muted-foreground">
          Format: one note per line, for example <code>C4 0 1</code> or <code>F#4 1.5 0.5</code>.
        </p>
      </Card.Content>
      <Card.Footer class="flex flex-wrap items-center gap-2">
        <Button onclick={buildTranscription}>Build transcription</Button>
        <Button disabled={!score || !library || saving} onclick={() => void saveToRepertoire()}>
          {saving ? "Saving..." : "Save to repertoire"}
        </Button>
        {#if savedSongId}
          <Button href="/music/library?tab=songs" variant="outline">Open songs</Button>
        {/if}
      </Card.Footer>
    </Card.Root>

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Audio context</Card.Description>
          <Card.Title class="text-base">Attach source audio</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3">
          <label
            class="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center text-sm"
          >
            <Upload class="size-5 text-primary" aria-hidden="true" />
            <span>{audioFile?.name ?? "Choose an audio file"}</span>
            <input
              type="file"
              accept="audio/*"
              class="hidden"
              aria-label="Audio file"
              onchange={(event) => onAudioFile(event.currentTarget.files)}
            />
          </label>
          <p class="text-xs text-muted-foreground">
            Automatic extraction runs locally with Basic Pitch. For clean results, use one
            instrument at a time.
          </p>
          {#if extracting}
            <Progress value={extractionProgress} max={1} />
          {/if}
        </Card.Content>
        <Card.Footer>
          <Button
            type="button"
            variant="outline"
            disabled={!audioFile || extracting}
            onclick={() => void extractNotes()}
          >
            {extracting ? "Extracting..." : "Extract notes"}
          </Button>
        </Card.Footer>
      </Card.Root>

      {#if savedTakes.length > 0}
        <Card.Root>
          <Card.Header>
            <Card.Description>Saved recorder takes</Card.Description>
            <Card.Title class="text-base">Use Practice Lab audio</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-2">
            {#each savedTakes as take (take.id)}
              <div class="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold">{take.name}</span>
                  <span class="text-xs text-muted-foreground">
                    {Math.round(take.durationMs / 1_000)}s · {take.instrument}
                  </span>
                </span>
                <Button type="button" size="sm" variant="outline" onclick={() => void useSavedTake(take)}>
                  Use as source
                </Button>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      <Card.Root>
        <Card.Header role="status" aria-live="polite">
          <Card.Description>Status</Card.Description>
          <Card.Title class="text-base">{status}</Card.Title>
        </Card.Header>
        {#if score}
          <Card.Content class="grid gap-2 text-sm text-muted-foreground">
            <p>{score.notes.length} notes</p>
            <p>{score.tempoMap[0]?.bpm ?? bpm} bpm</p>
            <p>{score.origin}</p>
          </Card.Content>
          <Card.Footer>
            <Button type="button" variant="outline" onclick={() => void previewTranscription()}>
              {#if previewPlaying}
                <Pause class="size-4" aria-hidden="true" />Pause
              {:else}
                <Play class="size-4" aria-hidden="true" />Play
              {/if}
            </Button>
          </Card.Footer>
        {/if}
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Practice transcription</Card.Description>
          <Card.Title class="text-base">
            {trainerComplete ? "Trainer complete" : trainerRunning ? "Follow the melody" : "Wait mode trainer"}
          </Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3">
          <Progress value={trainerProgress} max={1} />
          <p class="text-sm text-muted-foreground">{Math.round(trainerProgress * 100)}%</p>
          {#if trainerRunning}
            <div class="grid gap-2">
              <p class="text-sm font-medium">
                Expected {expectedNames.length > 0 ? expectedNames.join(", ") : "complete"}
              </p>
              <div class="flex flex-wrap gap-2">
                {#each practiceNotes as noteName (noteName)}
                  <Button
                    type="button"
                    variant={expectedNames.includes(noteName) ? "default" : "outline"}
                    size="sm"
                    data-note={noteName}
                    onclick={() => playPracticeNote(noteName)}
                  >
                    {noteName}
                  </Button>
                {/each}
              </div>
            </div>
          {:else if trainerComplete}
            <p class="text-sm text-muted-foreground">
              The generated transcription can be practiced before or after saving it.
            </p>
          {:else}
            <p class="text-sm text-muted-foreground">
              Build or extract a score, then use MIDI or the note buttons to follow it.
            </p>
          {/if}
        </Card.Content>
        <Card.Footer>
          <Button type="button" disabled={!score || score.notes.length === 0} onclick={startTrainer}>
            Start trainer
          </Button>
        </Card.Footer>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
