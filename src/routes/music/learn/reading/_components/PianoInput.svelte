<script lang="ts">
  import { onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import type { Instrument as PianoInstrument, INoteValue } from "piano-chart";

  import {
    midiOctaveRange,
    noteLabel,
    noteMidi,
    noteName,
    pianoFingerMarkers,
  } from "../../../_components/piano-visual";

  let {
    midiNotes,
    targetMidiNotes = [],
    activeMidiNotes = [],
    correctMidiNotes = [],
    wrongMidiNotes = [],
    suggestedFingerings,
    router,
    onAccepted,
  }: {
    midiNotes: number[];
    targetMidiNotes?: number[];
    activeMidiNotes?: number[];
    correctMidiNotes?: number[];
    wrongMidiNotes?: number[];
    suggestedFingerings?: Record<number, number>;
    router: InputRouter;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  type PianoState = "target" | "active" | "correct" | "wrong";

  const range = $derived(midiOctaveRange(midiNotes, { startOctave: 3, endOctave: 5 }));
  const highlightNotes = $derived(
    [...new Set([...targetMidiNotes, ...activeMidiNotes, ...correctMidiNotes])].map(noteName),
  );
  const wrongNotes = $derived([...new Set(wrongMidiNotes)].map(noteName));
  const fingerMarkers = $derived(pianoFingerMarkers(suggestedFingerings, range));

  let container = $state<HTMLDivElement>();
  let piano = $state<PianoInstrument | undefined>();

  function themeColor(token: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  function play(midiNote: number): void {
    const event = router.noteOn(midiNote, "onscreen", "piano");
    onAccepted?.(event);
  }

  function pressKey(note: INoteValue): void {
    const octave = note.octave ?? 4;
    const accidental = note.accidental ?? "";
    play(noteMidi(`${note.note}${accidental}${octave}`));
  }

  function pianoState(midiNote: number): PianoState | undefined {
    if (wrongMidiNotes.includes(midiNote)) return "wrong";
    if (correctMidiNotes.includes(midiNote)) return "correct";
    if (activeMidiNotes.includes(midiNote)) return "active";
    if (targetMidiNotes.includes(midiNote)) return "target";
    return undefined;
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
        keyPressStyle: "vivid",
        vividKeyPressColor: themeColor("--practice-accent", "#7c5cff"),
        highlightedNotes: highlightNotes,
        highlightColor: themeColor("--practice-accent", "#7c5cff"),
        specialHighlightedNotes: wrongNotes,
        specialHighlightColor: themeColor("--destructive", "#ef4444"),
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

  $effect(() => {
    if (!piano) return;
    piano.applySettings({
      ...range,
      startNote: "C",
      endNote: "B",
      highlightedNotes: highlightNotes,
      specialHighlightedNotes: wrongNotes,
    });
    piano.reload();
  });
</script>

<div class="grid gap-2" role="group" aria-label="Piano input">
  <div class="relative">
    <div
      bind:this={container}
      aria-hidden="true"
      class="h-28 w-full min-w-0 overflow-x-auto rounded-md border bg-card p-2 pt-8 sm:h-36"
    ></div>
    {#each fingerMarkers as marker (marker.midiNote)}
      <span
        data-testid={`finger-${marker.midiNote}`}
        class="pointer-events-none absolute top-2 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold leading-none text-primary-foreground shadow-sm"
        style:left={`${marker.leftPercent}%`}
        style:transform="translateX(-50%)"
        aria-hidden="true"
      >
        {marker.finger}
      </span>
    {/each}
  </div>

  <div class="sr-only">
    {#each midiNotes as midiNote (midiNote)}
      {@const note = noteName(midiNote)}
      {@const noteState = pianoState(midiNote)}
      <button
        type="button"
        aria-label={`${note}${noteState ? `, ${noteState}` : ""}`}
        aria-pressed={activeMidiNotes.includes(midiNote)}
        onclick={() => play(midiNote)}
      >
        {noteLabel(midiNote)}
      </button>
    {/each}
  </div>
</div>
