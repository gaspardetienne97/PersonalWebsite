<script lang="ts">
  import { onMount } from "svelte";

  import type { Instrument as PianoInstrument } from "piano-chart";

  import { pianoOctaveRange } from "../../../_components/piano-visual";

  const PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  let { notes }: { notes: string[] } = $props();

  const activePitches = $derived(new Set(notes.map((note) => note.replace(/\d+$/, ""))));
  const highlightedNotes = $derived([...activePitches]);
  const range = $derived(pianoOctaveRange(notes, { startOctave: 4, endOctave: 4 }));

  let container = $state<HTMLDivElement>();
  let piano = $state<PianoInstrument | undefined>();

  function themeColor(token: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  onMount(() => {
    let destroyed = false;
    let instance: PianoInstrument | undefined;
    void (async () => {
      const { Instrument } = await import("piano-chart");
      if (destroyed || !container) return;
      instance = new Instrument(container, {
        ...range,
        startNote: "C",
        endNote: "B",
        showNoteNames: "onhighlight",
        highlightedNotes,
        highlightColor: themeColor("--practice-accent", "#7c5cff"),
      });
      instance.create();
      piano = instance;
    })();
    return () => {
      destroyed = true;
      instance?.destroy();
      piano = undefined;
    };
  });

  $effect(() => {
    if (!piano) return;
    piano.applySettings({
      ...range,
      startNote: "C",
      endNote: "B",
      highlightedNotes,
    });
    piano.reload();
  });
</script>

<div class="grid gap-2" role="group" aria-label="Piano voicing">
  <div
    bind:this={container}
    aria-hidden="true"
    class="h-28 w-full min-w-0 overflow-x-auto rounded-md border bg-card p-2 sm:h-32"
  ></div>
  <div class="sr-only">
    {#each PITCHES as pitch (pitch)}
      {@const active = activePitches.has(pitch)}
      <button type="button" aria-label={`${pitch}${active ? ", active" : ""}`} aria-pressed={active}>
        {pitch}
      </button>
    {/each}
  </div>
</div>
