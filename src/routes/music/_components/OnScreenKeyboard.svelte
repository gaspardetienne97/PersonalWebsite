<script lang="ts">
  import { onMount } from "svelte";

  import { monotonicMs, type InstrumentId, type NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { noteToMidi } from "@repo/music-core/engines/theory";
  import type { Instrument as PianoInstrument, INoteValue } from "piano-chart";

  const DEFAULT_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

  let {
    router,
    instrument = "piano",
    notes,
    onAccepted,
  }: {
    router: InputRouter;
    instrument?: InstrumentId;
    notes?: string[];
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  // The screen-reader / keyboard layer mirrors the notes the caller cares about;
  // the piano-chart SVG is the visual. Both emit the same NoteEvent.
  const accessibleNotes = $derived(notes ?? DEFAULT_NOTES);

  let container = undefined as unknown as HTMLDivElement;
  let piano = $state<PianoInstrument | undefined>();

  /** Span the octaves the highlighted notes need, else a default 2-octave view. */
  function octaveRange(): { startOctave: number; endOctave: number } {
    const octaves = (notes ?? [])
      .map((note) => Number.parseInt(note.match(/(-?\d+)$/)?.[1] ?? "", 10))
      .filter((value) => Number.isFinite(value));
    if (octaves.length === 0) return { startOctave: 3, endOctave: 5 };
    return {
      startOctave: Math.max(0, Math.min(...octaves)),
      endOctave: Math.min(8, Math.max(...octaves)),
    };
  }

  // piano-chart sets SVG fill attributes, so CSS vars can't resolve — read the
  // resolved theme token (already a complete oklch() color) at mount. ponytail:
  // re-reads on mount; a live theme toggle won't recolor until remount (rare).
  function themeColor(token: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  function emit(midiNote: number): void {
    const event: NoteEvent = {
      type: "noteOn",
      midiNote,
      velocity: 1,
      source: "onscreen",
      timestamp: monotonicMs(performance.now()),
      clock: "performance",
      instrument,
    };
    if (router.push(event)) onAccepted?.(event);
  }

  function pressKey(note: INoteValue): void {
    piano?.keyDown(note);
    setTimeout(() => piano?.keyUp(note), 150);
    emit(noteToMidi(`${note.note}${note.accidental ?? ""}${note.octave ?? 4}`));
  }

  onMount(() => {
    let destroyed = false;
    let instance: PianoInstrument | undefined;
    void (async () => {
      const { Instrument } = await import("piano-chart");
      if (destroyed) return;
      const { startOctave, endOctave } = octaveRange();
      instance = new Instrument(container, {
        startOctave,
        endOctave,
        startNote: "C",
        endNote: "C",
        showNoteNames: "onpress",
        keyPressStyle: "vivid",
        vividKeyPressColor: themeColor("--practice-accent", "#7c5cff"),
        highlightedNotes: notes ?? [],
        highlightColor: themeColor("--practice-accent", "#7c5cff"),
      });
      instance.create();
      instance.addKeyMouseDownListener(pressKey);
      piano = instance;
    })();
    return () => {
      destroyed = true;
      instance?.destroy();
      piano = undefined;
    };
  });

  // Re-highlight / re-range when the target notes change.
  $effect(() => {
    const next = notes ?? [];
    if (!piano) return;
    const { startOctave, endOctave } = octaveRange();
    piano.applySettings({ startOctave, endOctave, highlightedNotes: next });
    piano.reload();
  });
</script>

<div role="group" aria-label="On-screen keyboard" class="grid gap-2">
  <div
    bind:this={container}
    aria-hidden="true"
    class="h-28 w-full min-w-0 overflow-x-auto rounded-md border bg-card p-2 sm:h-32"
  ></div>
  <!-- Keyboard/screen-reader accessible layer (also the deterministic test surface). -->
  <div class="sr-only">
    {#each accessibleNotes as note (note)}
      <button type="button" onclick={() => emit(noteToMidi(note))}>{note}</button>
    {/each}
  </div>
</div>
