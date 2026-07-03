<script lang="ts">
  import { onMount } from "svelte";

  import { monotonicMs, type InstrumentId, type NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";
  import type { Instrument as PianoInstrument, INoteValue } from "piano-chart";

  import { pianoFingerMarkers, pianoOctaveRange } from "./piano-visual";

  const DEFAULT_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

  let {
    router,
    instrument = "piano",
    notes,
    suggestedFingerings,
    onAccepted,
  }: {
    router: InputRouter;
    instrument?: InstrumentId;
    notes?: string[];
    suggestedFingerings?: Record<number, number>;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  // The screen-reader / keyboard layer mirrors the notes the caller cares about;
  // the piano-chart SVG is the visual. Both emit the same NoteEvent.
  const accessibleNotes = $derived(notes ?? DEFAULT_NOTES);
  const range = $derived(pianoOctaveRange(notes ?? [], { startOctave: 3, endOctave: 5 }));
  const fingerMarkers = $derived(pianoFingerMarkers(suggestedFingerings, range));

  let container = undefined as unknown as HTMLDivElement;
  let piano = $state<PianoInstrument | undefined>();

  /** Span the octaves the highlighted notes need, else a default 2-octave view. */
  function octaveRange(): { startOctave: number; endOctave: number } {
    return range;
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

  // --- QWERTY-as-piano: answer without reaching for the mouse or a cable. ---
  // Classic DAW mapping: the home row walks the white keys from C, the row
  // above it plays the sharps.
  const QWERTY_SEMITONES: Record<string, number> = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
    o: 13,
    l: 14,
    p: 15,
    ";": 16,
  };

  // Anchor the mapping's C at the lowest highlighted octave so `A` plays the
  // drill's own register (falls back to C4).
  const qwertyBaseMidi = $derived.by(() => {
    const octaves = accessibleNotes
      .map((note) => Number.parseInt(note.match(/-?\d+$/)?.[0] ?? "", 10))
      .filter((octave) => Number.isFinite(octave));
    const baseOctave = octaves.length > 0 ? Math.min(...octaves) : 4;
    return 12 * (baseOctave + 1);
  });

  function isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable)
    );
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const semitones = QWERTY_SEMITONES[event.key.toLowerCase()];
    if (semitones === undefined) return;
    event.preventDefault();
    const midiNote = qwertyBaseMidi + semitones;
    emit(midiNote);
    flashKey(midiNote);
  }

  /** Mirror the mouse-press visual on the SVG keyboard, best effort. */
  function flashKey(midiNote: number): void {
    const match = /^([A-G])(#|b)?(-?\d+)$/.exec(midiToNote(midiNote));
    if (!match || !piano) return;
    const note = {
      note: match[1],
      ...(match[2] ? { accidental: match[2] } : {}),
      octave: Number(match[3]),
    } as INoteValue;
    try {
      piano.keyDown(note);
      setTimeout(() => piano?.keyUp(note), 150);
    } catch {
      // The note may sit outside the rendered range — the emit still counted.
    }
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

<svelte:window onkeydown={onWindowKeydown} />

<div role="group" aria-label="On-screen keyboard" class="grid gap-2">
  <div class="relative">
    <div
      bind:this={container}
      aria-hidden="true"
      class="h-28 w-full min-w-0 overflow-x-auto rounded-md border bg-card p-2 pt-8 sm:h-32"
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
  <!-- Keyboard/screen-reader accessible layer (also the deterministic test surface). -->
  <div class="sr-only">
    {#each accessibleNotes as note (note)}
      <button type="button" onclick={() => emit(noteToMidi(note))}>{note}</button>
    {/each}
  </div>
  <p class="hidden text-xs text-muted-foreground sm:block">
    Type to play: <kbd class="rounded border bg-muted px-1 font-mono">A</kbd>–<kbd
      class="rounded border bg-muted px-1 font-mono">L</kbd
    > white keys · <kbd class="rounded border bg-muted px-1 font-mono">W</kbd>–<kbd
      class="rounded border bg-muted px-1 font-mono">P</kbd
    > sharps
  </p>
</div>
