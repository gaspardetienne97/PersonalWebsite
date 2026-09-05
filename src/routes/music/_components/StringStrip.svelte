<script lang="ts">
  import { midiToNote } from "@repo/music-core/engines/theory";

  // One chip per open string, low to high. The nearest string to what is
  // sounding lights; tapping a chip targets that string so the gauge reads
  // against it instead of the nearest note.
  let {
    openStrings,
    nearestMidi,
    targetMidi,
    onTarget,
    class: cls = "",
  }: {
    /** Open-string MIDI notes in string-number order (string 1 first). */
    openStrings: number[];
    nearestMidi?: number;
    targetMidi?: number;
    onTarget: (midi: number | undefined) => void;
    class?: string;
  } = $props();

  const lowToHigh = $derived([...openStrings].reverse());
</script>

<div class="grid gap-2 {cls}" data-testid="string-strip">
  <p class="eyebrow text-stage-muted">Strings · the nearest string lights · tap one to target it</p>
  <div class="grid gap-2" style={`grid-template-columns: repeat(${lowToHigh.length}, minmax(0, 1fr));`} role="group" aria-label="Strings">
    {#each lowToHigh as midi (midi)}
      {@const targeted = targetMidi === midi}
      {@const nearest = targetMidi === undefined && nearestMidi === midi}
      <button
        type="button"
        aria-pressed={targeted}
        aria-label={`String ${midiToNote(midi)}${targeted ? ", targeted" : nearest ? ", sounding" : ""}`}
        class={[
          "h-12 rounded-full border font-mono text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-practice-accent",
          targeted && "border-transparent bg-practice-accent text-practice-accent-foreground shadow-glow",
          nearest && "border-practice-accent bg-practice-accent/25 text-stage-foreground",
          !targeted && !nearest && "border-stage-line bg-stage-2 text-stage-foreground hover:bg-stage-2/70",
        ]}
        onclick={() => onTarget(targeted ? undefined : midi)}
      >
        {midiToNote(midi)}
      </button>
    {/each}
  </div>
</div>
