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
    targetPositions,
    activePosition,
    correctPositions = [],
    router,
    visibleFrets = 12,
    visibleStrings,
    fretWindow,
    dotLabels,
    hideNoteNames = false,
    anchorPosition,
    onAccepted,
  }: {
    tuning: TuningProfile;
    targetMidiNotes?: number[];
    activeMidiNotes?: number[];
    correctMidiNotes?: number[];
    wrongMidiNotes?: number[];
    /**
     * Position-based targets. A pitch usually sits at several string/fret pairs,
     * so a drill that grades the position (a pentatonic box, a fretted lick)
     * passes the authored pairs here and only those dots light, each with its
     * own label. Leaving it undefined keeps the MIDI highlighting every other
     * caller uses.
     */
    targetPositions?: { stringNumber: number; fretNumber: number; label?: string }[];
    /** With `targetPositions`, the one position sounding now. */
    activePosition?: { stringNumber: number; fretNumber: number };
    /** With `targetPositions`, the positions already played. */
    correctPositions?: { stringNumber: number; fretNumber: number }[];
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
    hideNoteNames?: boolean;
    anchorPosition?: { stringNumber: number; fretNumber: number };
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  type FretState = "target" | "active" | "correct" | "wrong" | "focus" | "anchor";
  type FretDot = Position & {
    color: string;
    label: string;
    state: FretState;
    focused: boolean;
  };
  type FocusedFret = { stringNumber: number; fret: number; midiNote: number };
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

  function play(midiNote: number, stringNumber: number, fretNumber: number): void {
    const event = router.noteOn(midiNote, "onscreen", tuning.instrument, { inputProfileId: tuning.id, fretPosition: { stringNumber, fretNumber } });
    onAccepted?.(event);
  }

  const positionKey = (stringNumber: number, fretNumber: number) => `${stringNumber}:${fretNumber}`;
  const targetPositionLabels = $derived(
    targetPositions === undefined
      ? undefined
      : new Map(
          targetPositions.map((position) => [
            positionKey(position.stringNumber, position.fretNumber),
            position.label,
          ]),
        ),
  );
  const correctPositionKeys = $derived(
    new Set(correctPositions.map((position) => positionKey(position.stringNumber, position.fretNumber))),
  );

  function fretState(
    stringNumber: number,
    fretNumber: number,
    midiNote: number,
  ): FretState | undefined {
    if (wrongMidiNotes.includes(midiNote)) return "wrong";
    // Position-graded drills: the same pitch elsewhere on the neck is not a target.
    if (targetPositionLabels) {
      const key = positionKey(stringNumber, fretNumber);
      if (correctPositionKeys.has(key)) return "correct";
      if (
        activePosition?.stringNumber === stringNumber &&
        activePosition.fretNumber === fretNumber
      ) {
        return "active";
      }
      return targetPositionLabels.has(key) ? "target" : undefined;
    }
    if (correctMidiNotes.includes(midiNote)) return "correct";
    if (activeMidiNotes.includes(midiNote)) return "active";
    if (targetMidiNotes.includes(midiNote)) return "target";
    return undefined;
  }

  // --- fretboard.js visual layer -------------------------------------------
  let visual = $state<HTMLDivElement>();
  let visualWidth = $state(0);
  let resizeFrame = 0;
  let fretboard = $state<FretboardType | undefined>();
  let FretboardCtor = $state<FretboardConstructor>();
  let focusedFret = $state<FocusedFret>();

  function resizeVisual(width: number): void {
    cancelAnimationFrame(resizeFrame);
    // Rebuild after ResizeObserver delivery, outside its layout notification loop.
    resizeFrame = requestAnimationFrame(() => (visualWidth = width));
  }

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
    if (s === "focus") return themeColor("--stage", "#ffffff");
    // Targets are the chord or pattern itself: ink, not amber (amber means "needs work").
    return themeColor("--stage-foreground", "#111111");
  }

  function stateTextColor(s: FretState): string {
    if (s === "wrong") return themeColor("--background", "#ffffff");
    if (s === "correct") return themeColor("--success-foreground", "#052e16");
    if (s === "active") return themeColor("--practice-accent-foreground", "#ffffff");
    return themeColor("--stage", "#ffffff");
  }

  function noteLabel(stringNumber: number, fretNumber: number, midiNote: number): string {
    if (hideNoteNames) return "";
    const positionLabel = targetPositionLabels?.get(positionKey(stringNumber, fretNumber));
    return positionLabel ?? dotLabels?.[midiNote] ?? midiToNote(midiNote).replace(/\d+$/, "");
  }

  /**
   * Position markers at the real frets (3, 5, 7, 9, 15 …, a double at 12),
   * drawn between the fret wires and under the dots. fretboard.js has no inlay
   * option, so they are added to its SVG after each render.
   */
  function drawInlays(): void {
    const svg = visual?.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".inlays")?.remove();
    // fretboard.js places fret wires at percentage x (they stretch with the
    // board) and strings at pixel y; the circles reuse the same units.
    const fretX = [...svg.querySelectorAll<SVGLineElement>(".frets line")]
      .map((line) => parseFloat(line.getAttribute("x1") ?? ""))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b);
    const fretUnit = svg.querySelector(".frets line")?.getAttribute("x1")?.endsWith("%") ? "%" : "";
    const stringY = [...svg.querySelectorAll<SVGLineElement>(".strings line")]
      .map((line) => parseFloat(line.getAttribute("y1") ?? ""))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    if (fretX.length < 2 || stringY.length < 2) return;
    const top = stringY[0]!;
    const bottom = stringY[stringY.length - 1]!;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "inlays");
    group.setAttribute("aria-hidden", "true");
    const ink = themeColor("--fretboard-fret", "#ddd");
    for (let index = 1; index < fretX.length; index += 1) {
      const fret = index + fretOffset;
      if (!INLAY_FRETS.includes(fret)) continue;
      const cx = (fretX[index - 1]! + fretX[index]!) / 2;
      const centres =
        fret === 12
          ? [top + (bottom - top) / 3, top + (2 * (bottom - top)) / 3]
          : [(top + bottom) / 2];
      for (const cy of centres) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", `${cx}${fretUnit}`);
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", fret === 12 ? "4.5" : "5.5");
        circle.setAttribute("fill", ink);
        circle.setAttribute("fill-opacity", "0.5");
        group.append(circle);
      }
    }
    // Under the dots, over the strings: the dots' own parent keeps the order.
    const dots = svg.querySelector(".dots");
    if (dots?.parentNode) dots.parentNode.insertBefore(group, dots);
    else svg.append(group);
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
        const stringNumber = fbStringFor(openMidi);
        const anchor = anchorPosition?.stringNumber === stringNumber && anchorPosition?.fretNumber === fret;
        const s = anchor ? "anchor" : fretState(stringNumber, fret, midiNote);
        const focused = focusedFret?.stringNumber === stringNumber && focusedFret.fret === fret;
        if (s || focused) {
          dots.push({
            string: stringNumber,
            fret: fret - fretOffset,
            color: stateColor(s ?? "focus"),
            label: anchor ? "A" : noteLabel(stringNumber, fret, midiNote),
            state: s ?? "focus",
            focused,
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
      cancelAnimationFrame(resizeFrame);
      FretboardCtor = undefined;
    };
  });

  $effect(() => {
    const Fretboard = FretboardCtor;
    if (!Fretboard || !visual || !visualWidth) return;

    const openMidiByString = [...fbOpenMidi];
    const offset = fretOffset;
    const firstFret = windowStart;
    const board = new Fretboard({
      el: visual,
      tuning: fbTuning,
      stringCount: fbTuning.length,
      fretCount: boardFretCount,
      // Match SVG units to the available pixels; long necks scroll locally.
      width: visualWidth - 32,
      leftPadding: 16,
      rightPadding: 16,
      scaleFrets: false,
      height: 180,
      topPadding: 14,
      bottomPadding: 14,
      dotSize: 26,
      dotStrokeWidth: 1.5,
      dotTextSize: 14,
      dotText: (dot: FretDot) => dot.label,
      // The neck as material: wood from --fretboard (on the wrapper), light fret
      // wire, strings that thicken toward the bass side, real fret numbers in
      // the readout face.
      font: "Fira Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
      dotStrokeColor: "oklch(0 0 0 / 0.25)",
      stringWidth: fbTuning.map(
        (_, index) => 1 + (index * 2.2) / Math.max(1, fbTuning.length - 1),
      ) as unknown as number,
      stringColor: themeColor("--fretboard-fret", "#ddd"),
      fretColor: themeColor("--fretboard-fret", "#ddd"),
      fretWidth: 2,
      // A real nut only when the window starts at fret 0; otherwise a thin fret-coloured edge.
      nutColor: offset === 0 ? themeColor("--foreground", "#fff") : themeColor("--muted-foreground", "#888"),
      nutWidth: offset === 0 ? 7 : 2,
      middleFretColor: themeColor("--fretboard-fret", "#ddd"),
      fretNumbersColor: themeColor("--stage-foreground", "#111"),
      showFretNumbers: true,
    });
    board.render();
    relabelFretNumbers();
    drawInlays();
    board.on("click", (position: Position) => {
      const openMidi = openMidiByString[position.string - 1];
      const fret = position.fret + offset;
      if (openMidi !== undefined && fret >= firstFret) play(openMidi + fret, position.string, fret);
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
    drawInlays();
    fretboard.style({
      fill: (dot: FretDot) => dot.color,
      text: (dot: FretDot) => dot.label,
      fontSize: 14,
      fontFill: themeColor("--foreground", "#111111"),
    });
    for (const state of ["target", "active", "correct", "wrong", "focus", "anchor"] as const) {
      fretboard.style({
        filter: { state },
        text: (dot: FretDot) => dot.label,
        fontSize: 14,
        fontFill: stateTextColor(state),
      });
    }
    fretboard.style({
      filter: { focused: true },
      stroke: themeColor("--practice-accent", "#7c5cff"),
      "stroke-width": 4,
    });
    visual?.querySelector('.dot-circle[stroke-width="4"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<!-- Visual fretboard (mouse/touch). Decorative: input + a11y live in the grid below. -->
<div
  aria-hidden="true"
  class="fretboard-wood w-full max-w-full min-w-0 overflow-x-auto rounded-lg border border-stage-line p-2"
>
  <div bind:this={visual} bind:clientWidth={null, resizeVisual} style:min-width={`${boardFretCount * 44 + 32}px`}></div>
</div>

{#if focusedFret}
  <p data-testid="fretboard-focus" class="mt-2 text-xs font-medium text-stage-foreground">
    Keyboard focus: String {focusedFret.stringNumber}, fret {focusedFret.fret}{hideNoteNames ? "" : `, ${midiToNote(focusedFret.midiNote)}`}
  </p>
{/if}

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
      {@const noteState = fretState(stringNumber, fret, midiNote)}
      <button
        type="button"
        aria-label={`String ${stringNumber} fret ${fret}${hideNoteNames ? "" : `, ${note}`}${anchorPosition?.stringNumber === stringNumber && anchorPosition?.fretNumber === fret ? ", anchor" : noteState ? `, ${noteState}` : ""}`}
        class={cn(
          "grid size-10 place-items-center rounded-sm border bg-background text-xs font-medium",
          noteState === "target" && "border-warn/60 bg-warn/15 text-foreground",
          noteState === "active" &&
            "border-practice-accent/70 bg-practice-accent/15 text-foreground",
          noteState === "correct" && "border-success/70 bg-success/15 text-foreground",
          noteState === "wrong" && "border-destructive/70 bg-destructive/15 text-foreground",
        )}
        onfocus={() => (focusedFret = { stringNumber, fret, midiNote })}
        onblur={() => (focusedFret = undefined)}
        onclick={() => play(midiNote, stringNumber, fret)}
      >
        {hideNoteNames ? `S${stringNumber} F${fret}` : note.replace(/\d+$/, "")}
      </button>
    {/each}
  {/each}
</div>
