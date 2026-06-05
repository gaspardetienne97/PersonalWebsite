<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { cn } from "@repo/ui/utils";

  let {
    midiNotes,
    targetMidiNotes = [],
    activeMidiNotes = [],
    correctMidiNotes = [],
    wrongMidiNotes = [],
    router,
    onAccepted,
  }: {
    midiNotes: number[];
    targetMidiNotes?: number[];
    activeMidiNotes?: number[];
    correctMidiNotes?: number[];
    wrongMidiNotes?: number[];
    router: InputRouter;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  function play(midiNote: number): void {
    const event = router.noteOn(midiNote, "onscreen", "piano");
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

<div
  class="flex w-full max-w-full min-w-0 gap-1 overflow-x-auto rounded-md border bg-muted p-2"
  role="group"
  aria-label="Piano input"
>
  {#each midiNotes as midiNote}
    {@const note = midiToNote(midiNote)}
    {@const noteState = state(midiNote)}
    <button
      type="button"
      aria-label={`${note}${noteState ? `, ${noteState}` : ""}`}
      aria-pressed={activeMidiNotes.includes(midiNote)}
      class={cn(
        "flex h-24 min-w-11 items-end justify-center rounded-sm border px-1 pb-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        note.includes("#")
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground",
        noteState === "target" && "border-primary bg-primary/15 text-foreground",
        noteState === "active" && "border-primary bg-primary text-primary-foreground",
        noteState === "correct" && "border-primary bg-primary text-primary-foreground",
        noteState === "wrong" && "border-destructive bg-destructive text-destructive-foreground",
      )}
      onclick={() => play(midiNote)}
    >
      {note}
    </button>
  {/each}
</div>
