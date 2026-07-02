<script lang="ts">
  import { onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import { cn } from "@repo/ui/utils";
  import type { Fretboard as FretboardType, Position } from "@moonwave99/fretboard.js";

  let {
    tuning,
    targetMidiNotes = [],
    activeMidiNotes = [],
    correctMidiNotes = [],
    wrongMidiNotes = [],
    router,
    visibleFrets = 12,
    visibleStrings,
    onAccepted,
  }: {
    tuning: TuningProfile;
    targetMidiNotes?: number[];
    activeMidiNotes?: number[];
    correctMidiNotes?: number[];
    wrongMidiNotes?: number[];
    router: InputRouter;
    visibleFrets?: number;
    visibleStrings?: number[];
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  type FretState = "target" | "active" | "correct" | "wrong";
  type FretDot = Position & { color: string; label: string; state: FretState };
  type FretboardConstructor = new (options?: Record<string, unknown>) => FretboardType;

  const fretCount = $derived(Math.min(tuning.fretCount, Math.max(0, visibleFrets)));
  const strings = $derived(
    tuning.openStrings
      .map((openMidi, index) => ({ openMidi, stringNumber: index + 1 }))
      .filter(
        ({ stringNumber }) => visibleStrings === undefined || visibleStrings.includes(stringNumber),
      ),
  );

  // fretboard.js draws tuning[0] at the top and numbers strings 1..N from there.
  // Our openStrings already run high-to-low, so pass them as-is to keep the high E
  // on top (TAB convention, matching the previous grid). Map midi → string index.
  const fbOpenMidi = $derived([...tuning.openStrings]);
  const fbTuning = $derived(fbOpenMidi.map((midi) => midiToNote(midi)));
  const fbStringFor = (openMidi: number) => fbOpenMidi.indexOf(openMidi) + 1;

  function play(midiNote: number): void {
    const event = router.noteOn(midiNote, "onscreen", tuning.instrument);
    event.inputProfileId = tuning.id;
    onAccepted?.(event);
  }

  function fretState(midiNote: number): FretState | undefined {
    if (wrongMidiNotes.includes(midiNote)) return "wrong";
    if (correctMidiNotes.includes(midiNote)) return "correct";
    if (activeMidiNotes.includes(midiNote)) return "active";
    if (targetMidiNotes.includes(midiNote)) return "target";
    return undefined;
  }

  // --- fretboard.js visual layer -------------------------------------------
  let visual = $state<HTMLDivElement>();
  let fretboard = $state<FretboardType | undefined>();
  let FretboardCtor = $state<FretboardConstructor>();

  function themeColor(token: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    // Tokens are already complete CSS colors (oklch(...)); use as-is.
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  function stateColor(s: FretState): string {
    if (s === "wrong") return themeColor("--destructive", "#ef4444");
    if (s === "correct") return themeColor("--success", "#22c55e");
    if (s === "active") return themeColor("--practice-accent", "#7c5cff");
    return themeColor("--warn", "#d97706");
  }

  function stateTextColor(s: FretState): string {
    if (s === "wrong") return themeColor("--background", "#ffffff");
    if (s === "correct") return themeColor("--success-foreground", "#052e16");
    if (s === "active") return themeColor("--practice-accent-foreground", "#ffffff");
    return themeColor("--warn-foreground", "#422006");
  }

  function noteLabel(midiNote: number): string {
    return midiToNote(midiNote).replace(/\d+$/, "");
  }

  /** One dot per highlighted position across the visible strings/frets. */
  function highlightDots(): FretDot[] {
    const dots: FretDot[] = [];
    for (const { openMidi } of strings) {
      for (let fret = 0; fret <= fretCount; fret++) {
        const midiNote = openMidi + fret;
        const s = fretState(midiNote);
        if (s) {
          dots.push({
            string: fbStringFor(openMidi),
            fret,
            color: stateColor(s),
            label: noteLabel(midiNote),
            state: s,
          });
        }
      }
    }
    return dots;
  }

  onMount(() => {
    let destroyed = false;
    void (async () => {
      const { Fretboard } = await import("@moonwave99/fretboard.js");
      if (destroyed) return;
      FretboardCtor = Fretboard as FretboardConstructor;
    })();
    return () => {
      destroyed = true;
      FretboardCtor = undefined;
    };
  });

  $effect(() => {
    const Fretboard = FretboardCtor;
    if (!Fretboard || !visual) return;

    const openMidiByString = [...fbOpenMidi];
    const board = new Fretboard({
      el: visual,
      tuning: fbTuning,
      stringCount: fbTuning.length,
      fretCount,
      height: 180,
      dotSize: 26,
      dotTextSize: 11,
      dotText: (dot: FretDot) => dot.label,
      dotStrokeColor: themeColor("--border", "#555"),
      stringColor: themeColor("--muted-foreground", "#888"),
      fretColor: themeColor("--muted-foreground", "#888"),
      nutColor: themeColor("--foreground", "#fff"),
      middleFretColor: themeColor("--muted-foreground", "#888"),
      fretNumbersColor: themeColor("--muted-foreground", "#888"),
      showFretNumbers: true,
    });
    board.render();
    board.on("click", (position: Position) => {
      const openMidi = openMidiByString[position.string - 1];
      if (openMidi !== undefined) play(openMidi + position.fret);
    });
    fretboard = board;

    return () => {
      board.removeEventListeners();
      visual?.replaceChildren();
      if (fretboard === board) fretboard = undefined;
    };
  });

  // Re-paint the highlight dots whenever the pedagogical state changes.
  $effect(() => {
    const dots = highlightDots();
    if (!fretboard) return;
    fretboard.setDots(dots).render();
    fretboard.style({
      fill: (dot: FretDot) => dot.color,
      text: (dot: FretDot) => dot.label,
      fontSize: 11,
      fontFill: themeColor("--foreground", "#111111"),
    });
    for (const state of ["target", "active", "correct", "wrong"] as const) {
      fretboard.style({
        filter: { state },
        text: (dot: FretDot) => dot.label,
        fontSize: 11,
        fontFill: stateTextColor(state),
      });
    }
  });
</script>

<!-- Visual fretboard (mouse/touch). Decorative: input + a11y live in the grid below. -->
<div
  bind:this={visual}
  aria-hidden="true"
  class="w-full max-w-full min-w-0 overflow-x-auto rounded-md border bg-stage/70 p-3 shadow-inner"
></div>

<!-- Accessible/keyboard layer: real per-fret buttons, screen-reader friendly. -->
<div
  class="sr-only grid gap-1"
  style={`grid-template-columns: 3rem repeat(${fretCount + 1}, minmax(2.5rem, 1fr));`}
  role="group"
  aria-label={`${tuning.name} fretboard input`}
>
  <span></span>
  {#each Array.from({ length: fretCount + 1 }, (_, fret) => fret) as fret (fret)}
    <span class="text-center text-xs text-muted-foreground">{fret}</span>
  {/each}

  {#each strings as { openMidi, stringNumber } (stringNumber)}
    <span class="flex items-center justify-center text-xs font-medium text-muted-foreground">
      {stringNumber}
    </span>
    {#each Array.from({ length: fretCount + 1 }, (_, fret) => fret) as fret (fret)}
      {@const midiNote = openMidi + fret}
      {@const note = midiToNote(midiNote)}
      {@const noteState = fretState(midiNote)}
      <button
        type="button"
        aria-label={`String ${stringNumber} fret ${fret}, ${note}${noteState ? `, ${noteState}` : ""}`}
        class={cn(
          "grid size-10 place-items-center rounded-sm border bg-background text-xs font-medium",
          noteState === "target" && "border-warn/60 bg-warn/15 text-foreground",
          noteState === "active" &&
            "border-practice-accent/70 bg-practice-accent/15 text-foreground",
          noteState === "correct" && "border-success/70 bg-success/15 text-foreground",
          noteState === "wrong" && "border-destructive/70 bg-destructive/15 text-foreground",
        )}
        onclick={() => play(midiNote)}
      >
        {note.replace(/\d+$/, "")}
      </button>
    {/each}
  {/each}
</div>
