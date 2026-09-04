<script lang="ts">
  import { onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import type { FretWindow } from "@repo/music-core/engines/projection";
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
    fretWindow,
    dotLabels,
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
    /**
     * Show only this stretch of the neck (absolute frets, inclusive). The board
     * keeps real fret numbers, the screen-reader grid keeps absolute labels, and
     * a neck strip shows where the window sits. Without it, frets 0..visibleFrets.
     */
    fretWindow?: FretWindow;
    /** Text on a highlighted dot per MIDI note (finger numbers); defaults to the note name. */
    dotLabels?: Record<number, string>;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  type FretState = "target" | "active" | "correct" | "wrong";
  type FretDot = Position & { color: string; label: string; state: FretState };
  type FretboardConstructor = new (options?: Record<string, unknown>) => FretboardType;

  const fretCount = $derived(Math.min(tuning.fretCount, Math.max(0, visibleFrets)));
  // Absolute window on the neck. fretboard.js counts frets from its own nut, so
  // the board is built `boardFretCount` frets wide and every fret we draw or
  // read back is shifted by `fretOffset` (0 when the window starts at the nut).
  const clampFret = (fret: number) => Math.min(tuning.fretCount, Math.max(0, Math.round(fret)));
  const windowStart = $derived(fretWindow ? clampFret(fretWindow.start) : 0);
  const windowEnd = $derived(
    fretWindow ? Math.max(windowStart, clampFret(fretWindow.end)) : fretCount,
  );
  const fretOffset = $derived(windowStart === 0 ? 0 : windowStart - 1);
  const boardFretCount = $derived(Math.max(1, windowEnd - fretOffset));
  const windowFrets = $derived(
    Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i),
  );
  const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
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
    // Targets are the chord or pattern itself: ink, not amber (amber means "needs work").
    return themeColor("--stage-foreground", "#111111");
  }

  function stateTextColor(s: FretState): string {
    if (s === "wrong") return themeColor("--background", "#ffffff");
    if (s === "correct") return themeColor("--success-foreground", "#052e16");
    if (s === "active") return themeColor("--practice-accent-foreground", "#ffffff");
    return themeColor("--stage", "#ffffff");
  }

  function noteLabel(midiNote: number): string {
    return dotLabels?.[midiNote] ?? midiToNote(midiNote).replace(/\d+$/, "");
  }

  /** fretboard.js numbers frets from its own nut; rewrite them to the real neck. */
  function relabelFretNumbers(): void {
    if (!visual || fretOffset === 0) return;
    visual.querySelectorAll(".fret-numbers text").forEach((node, index) => {
      node.textContent = String(index + 1 + fretOffset);
    });
  }

  /** One dot per highlighted position across the visible strings/frets. */
  function highlightDots(): FretDot[] {
    const dots: FretDot[] = [];
    for (const { openMidi } of strings) {
      for (const fret of windowFrets) {
        const midiNote = openMidi + fret;
        const s = fretState(midiNote);
        if (s) {
          dots.push({
            string: fbStringFor(openMidi),
            fret: fret - fretOffset,
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
    const offset = fretOffset;
    const firstFret = windowStart;
    const board = new Fretboard({
      el: visual,
      tuning: fbTuning,
      stringCount: fbTuning.length,
      fretCount: boardFretCount,
      height: 180,
      dotSize: 26,
      dotTextSize: 11,
      dotText: (dot: FretDot) => dot.label,
      // The neck as material: wood from --fretboard (on the wrapper), light fret
      // wire and strings, real fret numbers in the readout face.
      font: "Fira Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
      dotStrokeColor: "oklch(0 0 0 / 0.25)",
      stringColor: themeColor("--fretboard-fret", "#ddd"),
      fretColor: themeColor("--fretboard-fret", "#ddd"),
      // A real nut only when the window starts at fret 0; otherwise a thin fret-coloured edge.
      nutColor: offset === 0 ? themeColor("--foreground", "#fff") : themeColor("--muted-foreground", "#888"),
      nutWidth: offset === 0 ? 7 : 2,
      middleFretColor: themeColor("--fretboard-fret", "#ddd"),
      fretNumbersColor: themeColor("--stage-foreground", "#111"),
      showFretNumbers: true,
    });
    board.render();
    relabelFretNumbers();
    board.on("click", (position: Position) => {
      const openMidi = openMidiByString[position.string - 1];
      const fret = position.fret + offset;
      if (openMidi !== undefined && fret >= firstFret) play(openMidi + fret);
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
  class="w-full max-w-full min-w-0 overflow-x-auto rounded-lg border border-stage-line bg-fretboard p-2 shadow-inner"
></div>

{#if fretWindow}
  <!-- Where the window sits on the whole neck. -->
  <div class="mt-2 grid gap-1" data-testid="fret-window-strip">
    <div
      class="grid h-2.5 gap-px"
      style={`grid-template-columns: repeat(${tuning.fretCount + 1}, minmax(0, 1fr));`}
      role="img"
      aria-label={`Frets ${windowStart} to ${windowEnd} of ${tuning.fretCount}`}
    >
      {#each Array.from({ length: tuning.fretCount + 1 }, (_, fret) => fret) as fret (fret)}
        {@const inWindow = fret >= windowStart && fret <= windowEnd}
        <span
          data-fret={fret}
          data-in-window={inWindow ? "true" : undefined}
          class={cn(
            "relative rounded-[2px]",
            inWindow ? "bg-practice-accent" : "bg-stage-2 ring-1 ring-inset ring-stage-line/60",
          )}
        >
          {#if INLAY_FRETS.includes(fret)}
            <span
              class={cn(
                "absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                inWindow ? "bg-practice-accent-foreground" : "bg-stage-muted",
              )}
              aria-hidden="true"
            ></span>
          {/if}
        </span>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground tabular-nums" aria-hidden="true">
      Frets {windowStart} to {windowEnd} of {tuning.fretCount}
    </p>
  </div>
{/if}

<!-- Accessible/keyboard layer: real per-fret buttons, screen-reader friendly. -->
<div
  class="sr-only grid gap-1"
  style={`grid-template-columns: 3rem repeat(${windowFrets.length}, minmax(2.5rem, 1fr));`}
  role="group"
  aria-label={`${tuning.name} fretboard input`}
>
  <span></span>
  {#each windowFrets as fret (fret)}
    <span class="text-center text-xs text-muted-foreground">{fret}</span>
  {/each}

  {#each strings as { openMidi, stringNumber } (stringNumber)}
    <span class="flex items-center justify-center text-xs font-medium text-muted-foreground">
      {stringNumber}
    </span>
    {#each windowFrets as fret (fret)}
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
