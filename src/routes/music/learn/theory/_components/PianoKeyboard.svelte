<script lang="ts">
  import { cn } from "@repo/ui/utils";

  const PITCHES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const BLACK_KEYS = new Set(["C#", "D#", "F#", "G#", "A#"]);

  let { notes }: { notes: string[] } = $props();
  const activePitches = $derived(new Set(notes.map((note) => note.replace(/\d+$/, ""))));
</script>

<div
  class="grid grid-cols-6 gap-1 rounded-md border bg-muted p-2 sm:grid-cols-12"
  role="group"
  aria-label="Piano voicing"
>
  {#each PITCHES as pitch}
    {@const active = activePitches.has(pitch)}
    <button
      type="button"
      aria-label={`${pitch}${active ? ", active" : ""}`}
      aria-pressed={active}
      class={cn(
        "flex h-24 min-w-0 items-end justify-center rounded-sm border px-1 pb-2 text-xs font-semibold transition-colors sm:h-32",
        BLACK_KEYS.has(pitch)
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground",
        active &&
          "border-practice-accent bg-practice-accent text-practice-accent-foreground",
      )}
    >
      {pitch}
    </button>
  {/each}
</div>
