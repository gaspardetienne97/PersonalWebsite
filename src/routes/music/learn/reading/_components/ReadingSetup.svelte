<script lang="ts">
  import type { Clef } from "@repo/music-core/engines/notation";
  import { READING_LEVELS, type ReadingLevelId } from "@repo/music-core/exercises/sight-reading";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import type {
    ReadingAnswerMode,
    ReadingPromptKind,
  } from "@repo/music-core/exercises/note-reading";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";

  import TuningEditor from "./TuningEditor.svelte";

  export interface ReadingSetupValue {
    activity: "flashcards" | "sight-reading";
    instrument: "piano" | "guitar" | "ukulele";
    tuningId?: string;
    clefs: Clef[];
    keySignature: string;
    range: { lowestMidi: number; highestMidi: number };
    readingLevel: ReadingLevelId;
    difficulty: number;
    transposeSemitones: number;
    promptKind: ReadingPromptKind;
    answerMode: ReadingAnswerMode;
    mode: "wait" | "performance";
    bpm: number;
    strictness: "relaxed" | "normal" | "strict";
    meter: "simple" | "compound";
    measures: number;
  }

  let {
    value,
    tunings,
    midiEnabled,
    midiStatus,
    onChange,
    onStart,
    onEnableMidi,
    onSaveTuning,
    onDeleteTuning,
  }: {
    value: ReadingSetupValue;
    tunings: TuningProfile[];
    midiEnabled: boolean;
    midiStatus: string;
    onChange: (value: ReadingSetupValue) => void;
    onEnableMidi: () => void;
    onSaveTuning: (profile: TuningProfile) => void;
    onDeleteTuning: (id: string) => void;
  } = $props();

  const stringInstrument = $derived(value.instrument === "guitar" || value.instrument === "ukulele");
  const customTunings = $derived(tunings.filter(({ source }) => source === "custom"));

  function patch(next: Partial<ReadingSetupValue>): void {
    onChange({ ...value, ...next });
  }

  function setInstrument(instrument: ReadingSetupValue["instrument"]): void {
    const tuningId =
      instrument === "piano"
        ? undefined
        : tunings.find((tuning) => tuning.instrument === instrument)?.id;
    patch({
      instrument,
      ...(tuningId === undefined ? { tuningId: undefined } : { tuningId }),
      clefs: instrument === "piano" ? value.clefs : ["treble"],
    });
  }
</script>

<section class="grid gap-6">
  <Card.Root>
    <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
      <div class="space-y-1">
        <Card.Description>Activity</Card.Description>
        <Card.Title class="text-base">Flashcards or sight-reading</Card.Title>
      </div>
      <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Reading activity">
        <Button
          type="button"
          size="sm"
          variant={value.activity === "flashcards" ? "secondary" : "ghost"}
          aria-pressed={value.activity === "flashcards"}
          onclick={() => patch({ activity: "flashcards" })}
        >
          Flashcards
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value.activity === "sight-reading" ? "secondary" : "ghost"}
          aria-pressed={value.activity === "sight-reading"}
          onclick={() => patch({ activity: "sight-reading" })}
        >
          Sight-Reading
        </Button>
      </div>
    </Card.Header>
    <Card.Content class="grid gap-6">
      <div class="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm text-muted-foreground" aria-live="polite">{midiStatus}</p>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={onEnableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </div>

      {#if value.activity === "sight-reading"}
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <div class="grid gap-2">
            <p class="text-sm font-medium">Mode</p>
            <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Sight-reading mode">
              {#each ["wait", "performance"] as mode}
                <Button
                  type="button"
                  size="sm"
                  variant={value.mode === mode ? "secondary" : "ghost"}
                  aria-pressed={value.mode === mode}
                  onclick={() => patch({ mode: mode as ReadingSetupValue["mode"] })}
                >
                  {mode === "wait" ? "Learn" : "Assess"}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid gap-2">
            <span class="text-sm font-medium">Tempo</span>
            <p aria-label="Tempo" class="flex h-10 items-center rounded-md border px-3 text-sm">
              {value.bpm} BPM
            </p>
          </div>

          <div class="grid gap-2">
            <p class="text-sm font-medium">Timing</p>
            <div class="grid grid-cols-3 rounded-md border p-1" aria-label="Timing strictness">
              {#each ["relaxed", "normal", "strict"] as strictness}
                <Button
                  type="button"
                  size="sm"
                  variant={value.strictness === strictness ? "secondary" : "ghost"}
                  aria-pressed={value.strictness === strictness}
                  onclick={() =>
                    patch({ strictness: strictness as ReadingSetupValue["strictness"] })}
                >
                  {strictness[0]!.toUpperCase() + strictness.slice(1)}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid gap-2">
            <p class="text-sm font-medium">Meter</p>
            <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Meter">
              {#each ["simple", "compound"] as meter}
                <Button
                  type="button"
                  size="sm"
                  variant={value.meter === meter ? "secondary" : "ghost"}
                  aria-pressed={value.meter === meter}
                  onclick={() => patch({ meter: meter as ReadingSetupValue["meter"] })}
                >
                  {meter === "simple" ? "Simple" : "Compound"}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid gap-2">
            <Label for="reading-measures">Measures</Label>
            <Input
              id="reading-measures"
              type="number"
              min="1"
              max="8"
              step="1"
              value={value.measures}
              onchange={(event) => patch({ measures: Number(event.currentTarget.value) })}
            />
          </div>
        </div>
      {/if}

      <div class="grid gap-2">
        <p class="text-sm font-medium">Instrument</p>
        <div class="flex flex-wrap gap-2" aria-label="Instrument">
          {#each ["piano", "guitar", "ukulele"] as instrument}
            <Button
              type="button"
              variant={value.instrument === instrument ? "secondary" : "outline"}
              aria-pressed={value.instrument === instrument}
              onclick={() => setInstrument(instrument as ReadingSetupValue["instrument"])}
            >
              {instrument[0]!.toUpperCase() + instrument.slice(1)}
            </Button>
          {/each}
        </div>
      </div>

      {#if stringInstrument}
        <div class="grid gap-3">
          <p class="text-sm font-medium">Tuning</p>
          <div class="flex flex-wrap gap-2" aria-label="Tuning">
            {#each tunings as tuning (tuning.id)}
              <Button
                type="button"
                size="sm"
                variant={value.tuningId === tuning.id ? "secondary" : "outline"}
                aria-pressed={value.tuningId === tuning.id}
                onclick={() => patch({ tuningId: tuning.id })}
              >
                {tuning.name}
              </Button>
            {/each}
          </div>
          <div class="flex flex-wrap gap-2">
            <TuningEditor
              instrument={value.instrument as "guitar" | "ukulele"}
              onSave={onSaveTuning}
            />
            {#each customTunings as tuning (tuning.id)}
              <TuningEditor
                instrument={value.instrument as "guitar" | "ukulele"}
                profile={tuning}
                onSave={onSaveTuning}
                onDelete={onDeleteTuning}
              />
            {/each}
          </div>
        </div>
      {/if}

      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="grid gap-2">
          <p class="text-sm font-medium">Answer</p>
          <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Answer mode">
            {#each ["choice", "play"] as mode}
              <Button
                type="button"
                size="sm"
                variant={value.answerMode === mode ? "secondary" : "ghost"}
                aria-pressed={value.answerMode === mode}
                onclick={() => patch({ answerMode: mode as ReadingAnswerMode })}
              >
                {mode === "choice" ? "Choice" : "Play"}
              </Button>
            {/each}
          </div>
        </div>

        <div class="grid gap-2">
          <p class="text-sm font-medium">Prompt</p>
          <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Prompt kind">
            {#each ["single-note", "chord"] as kind}
              <Button
                type="button"
                size="sm"
                variant={value.promptKind === kind ? "secondary" : "ghost"}
                aria-pressed={value.promptKind === kind}
                onclick={() => patch({ promptKind: kind as ReadingPromptKind })}
              >
                {kind === "single-note" ? "Single" : "Chord"}
              </Button>
            {/each}
          </div>
        </div>

        <div class="grid gap-2">
          <Label for="reading-key">Key</Label>
          <select
            id="reading-key"
            class="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={value.keySignature}
            onchange={(event) => patch({ keySignature: event.currentTarget.value })}
          >
            {#each ["C major", "G major", "F major", "D major", "Bb major", "A minor", "E minor", "D minor"] as key}
              <option value={key}>{key}</option>
            {/each}
          </select>
        </div>

        <div class="grid gap-2">
          <Label for="reading-level">Level</Label>
          <select
            id="reading-level"
            class="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={value.readingLevel}
            onchange={(event) => patch({ readingLevel: event.currentTarget.value as ReadingLevelId })}
          >
            {#each READING_LEVELS as level (level.id)}
              <option value={level.id}>{level.label}</option>
            {/each}
          </select>
        </div>

        <div class="grid gap-2">
          <Label for="reading-transpose">Transpose</Label>
          <select
            id="reading-transpose"
            class="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={String(value.transposeSemitones)}
            onchange={(event) => patch({ transposeSemitones: Number(event.currentTarget.value) })}
          >
            {#each [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] as semitones}
              <option value={String(semitones)}>
                {semitones === 0 ? "Written pitch" : `${semitones > 0 ? "+" : ""}${semitones} st`}
              </option>
            {/each}
          </select>
        </div>

        <div class="grid gap-2">
          <Label for="reading-difficulty">Difficulty</Label>
          <Input
            id="reading-difficulty"
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={value.difficulty}
            onchange={(event) => patch({ difficulty: Number(event.currentTarget.value) })}
          />
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</section>
