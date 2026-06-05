<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import { cn } from "@repo/ui/utils";

  let {
    tuning,
    targetMidiNotes = [],
    activeMidiNotes = [],
    correctMidiNotes = [],
    wrongMidiNotes = [],
    router,
    visibleFrets = 12,
    onAccepted,
  }: {
    tuning: TuningProfile;
    targetMidiNotes?: number[];
    activeMidiNotes?: number[];
    correctMidiNotes?: number[];
    wrongMidiNotes?: number[];
    router: InputRouter;
    visibleFrets?: number;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const fretCount = $derived(Math.min(tuning.fretCount, Math.max(0, visibleFrets)));

  function play(midiNote: number): void {
    const event = router.noteOn(midiNote, "onscreen", tuning.instrument);
    event.inputProfileId = tuning.id;
    onAccepted?.(event);
  }

  function state(midiNote: number): "target" | "active" | "correct" | "wrong" | undefined {
    if (wrongMidiNotes.includes(midiNote)) return "wrong";
    if (correctMidiNotes.includes(midiNote)) return "correct";
    if (activeMidiNotes.includes(midiNote)) return "active";
    if (targetMidiNotes.includes(midiNote)) return "target";
    return undefined;
  }
</script>

<div class="w-full max-w-full min-w-0 overflow-x-auto rounded-md border bg-muted p-2">
  <div
    class="grid min-w-max gap-1"
    style={`grid-template-columns: 3rem repeat(${fretCount + 1}, minmax(2.5rem, 1fr));`}
    role="group"
    aria-label={`${tuning.name} fretboard input`}
  >
    <span></span>
    {#each Array.from({ length: fretCount + 1 }, (_, fret) => fret) as fret}
      <span class="text-center text-xs text-muted-foreground">{fret}</span>
    {/each}

    {#each tuning.openStrings as openMidi, index}
      <span class="flex items-center justify-center text-xs font-medium text-muted-foreground">
        {index + 1}
      </span>
      {#each Array.from({ length: fretCount + 1 }, (_, fret) => fret) as fret}
        {@const midiNote = openMidi + fret}
        {@const note = midiToNote(midiNote)}
        {@const noteState = state(midiNote)}
        <button
          type="button"
          aria-label={`String ${index + 1} fret ${fret}, ${note}${noteState ? `, ${noteState}` : ""}`}
          class={cn(
            "grid size-10 place-items-center rounded-sm border bg-background text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            noteState === "target" && "border-primary bg-primary/15",
            noteState === "active" && "border-primary bg-primary text-primary-foreground",
            noteState === "correct" && "border-primary bg-primary text-primary-foreground",
            noteState === "wrong" && "border-destructive bg-destructive text-destructive-foreground",
          )}
          onclick={() => play(midiNote)}
        >
          {note.replace(/\d+$/, "")}
        </button>
      {/each}
    {/each}
  </div>
</div>
