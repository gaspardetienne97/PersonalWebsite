<script lang="ts" module>
  import type { PianoHand, PianoTimelineNote } from "./piano-timeline";

  /** Layer types stay colocated with the only component that renders them. */
  export type { PianoHand, PianoTimelineNote };

  export type PianoHighlightRole =
    | "target"
    | "active"
    | "correct"
    | "wrong"
    /** Sounding right now under the route's playback position. */
    | "sounding"
    | "upcoming"
    | "locate";

  export interface PianoHighlight {
    role: PianoHighlightRole;
    hand?: PianoHand;
  }

  export type PianoToneRole = "chord" | "scale" | "avoid";

  /** Which keys carry a visible note name; hidden names stay screen-reader only. */
  export type PianoNoteNames = "none" | "c" | "all";

  type PianoKeyState =
    | "wrong"
    | "correct"
    | "active"
    | "target"
    | "target-left"
    | "target-right"
    | "sounding"
    | "sounding-left"
    | "sounding-right"
    | "upcoming"
    | "locate"
    | PianoToneRole
    | "neutral";

  const STATE_LABELS: Record<PianoKeyState, string> = {
    wrong: "wrong",
    correct: "correct",
    active: "held",
    target: "target",
    "target-left": "target, left hand",
    "target-right": "target, right hand",
    sounding: "sounding",
    "sounding-left": "sounding, left hand",
    "sounding-right": "sounding, right hand",
    upcoming: "upcoming",
    locate: "locate",
    chord: "chord tone",
    scale: "scale tone",
    avoid: "avoid",
    neutral: "",
  };

  /** How far ahead the waterfall lane looks, in beats. One bar of 4/4. */
  const LOOKAHEAD_BEATS = 4;

  const HANDS: PianoHand[] = ["left", "right"];
</script>

<script lang="ts">
  import { onDestroy } from "svelte";

  import type { InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";

  import { cn } from "@repo/ui/utils";

  import {
    MIN_WHITE_KEY_PX,
    keyPercent,
    minKeyboardWidthPx,
    noteLane,
    pianoGeometry,
    toMidiNote,
    type PianoKey,
  } from "./piano-geometry";
  import {
    PianoInput,
    QWERTY_SEMITONES,
    isTypingTarget,
    qwertyBaseMidi,
    type PianoPointerMode,
  } from "./piano-input";

  /**
   * The shared piano surface: one keyboard visual whose layers (highlights,
   * hands, fingering, note names, tone roles, input) compose additively. It
   * never owns a session, runtime, transport, clock, or audio engine.
   */
  let {
    lowMidi,
    highMidi,
    notes,
    highlights,
    fingerings,
    noteNames = "none",
    toneRoles,
    router,
    instrument = "piano",
    interactive = true,
    pointerMode = "auto",
    onAccepted,
    waitGroupKey,
    timelineNotes,
    positionBeat,
    mutedHands = [],
    onMutedHandsChange,
    label = "On-screen keyboard",
    class: cls = "",
  }: {
    /** Explicit range ends; omit both to derive the range from `notes`. */
    lowMidi?: number;
    highMidi?: number;
    /** Note material the view must enclose (MIDI numbers or note names). */
    notes?: readonly (number | string)[];
    highlights?: Record<number, PianoHighlightRole | PianoHighlight>;
    fingerings?: Record<number, number>;
    noteNames?: PianoNoteNames;
    toneRoles?: Record<number, PianoToneRole>;
    router?: InputRouter;
    instrument?: InstrumentId;
    interactive?: boolean;
    /**
     * `hold` is press-and-hold, `latch` makes a click toggle the held note, and
     * `auto` (default) latches only while a wait-mode group (`waitGroupKey`)
     * asks for more than one note at once: one mouse can hold one key, so a
     * chord target is otherwise unplayable on screen. Sequence drills, which
     * light every upcoming note as a target, keep press-and-hold.
     */
    pointerMode?: PianoPointerMode | "auto";
    onAccepted?: (event: NoteEvent) => void;
    /**
     * The follower group id + generation. Providing it opts this instance into
     * wait-mode takeover/reset; omit it to keep ordinary holder lifetime.
     */
    waitGroupKey?: string;
    /** Score notes for the waterfall lane and playback highlights. */
    timelineNotes?: readonly PianoTimelineNote[];
    /**
     * The route's authoritative playback position, in score beats. The surface
     * only reads it: it never starts, stops, or advances playback.
     */
    positionBeat?: number;
    /** Authoritative muted hands; the surface only requests changes to them. */
    mutedHands?: readonly PianoHand[];
    onMutedHandsChange?: (hands: PianoHand[]) => void;
    label?: string;
    class?: string;
  } = $props();

  const geometry = $derived(pianoGeometry({ lowMidi, highMidi, notes }));
  const material = $derived((notes ?? []).map(toMidiNote));
  // Anchor QWERTY's C at the lowest relevant note's octave; with no material,
  // one octave into the view (C4 for the default range), as before.
  const baseMidi = $derived(qwertyBaseMidi(material.length > 0 ? material : [geometry.lowMidi + 12]));
  const playable = $derived(interactive && router !== undefined);
  const targetCount = $derived(
    Object.values(highlights ?? {}).filter((highlight) =>
      (typeof highlight === "string" ? highlight : highlight.role) === "target",
    ).length,
  );
  const resolvedPointerMode = $derived<PianoPointerMode>(
    pointerMode === "auto"
      ? waitGroupKey !== undefined && targetCount > 1
        ? "latch"
        : "hold"
      : pointerMode,
  );

  let heldNotes = $state<ReadonlySet<number>>(new Set());
  let latchedNotes = $state<ReadonlySet<number>>(new Set());
  /** A pointer sequence already handled this activation, so skip its click. */
  let pointerHandled = false;

  const input = new PianoInput({
    router: () => router,
    instrument: () => instrument,
    pointerMode: () => resolvedPointerMode,
    onAccepted: (event) => onAccepted?.(event),
    onChange: (held) => {
      heldNotes = new Set(held);
      latchedNotes = new Set(input.latchedNotes);
    },
  });

  $effect(() => {
    input.setWaitGroupKey(waitGroupKey);
  });

  // Only a wait-mode instance watches the router: an accepted foreign attack
  // takes the group over, so the local virtual/latch holds must go.
  $effect(() => {
    if (waitGroupKey === undefined || router === undefined) return;
    return router.subscribe((event) => input.observe(event));
  });

  // Leaving the surface abandons local holds silently - cleanup must never
  // depend on an event the router may reject during MIDI arbitration.
  onDestroy(() => input.reset());

  const fingerMarkers = $derived(
    Object.entries(fingerings ?? {})
      .map(([midiNote, finger]) => ({ midiNote: Number(midiNote), finger }))
      .map((marker) => ({
        ...marker,
        key: geometry.keys.find((candidate) => candidate.midiNote === marker.midiNote),
      }))
      .filter((marker): marker is typeof marker & { key: PianoKey } => marker.key !== undefined)
      .sort((left, right) => left.midiNote - right.midiNote),
  );

  /** Hand of each rendered key, from route highlights or playback. */
  const handMarkers = $derived(
    geometry.keys.flatMap((key) => {
      const hand = highlightFor(key.midiNote)?.hand;
      return hand ? [{ key, hand }] : [];
    }),
  );
  /** Any hand in view earns the legend; the swatches repeat the key forms. */
  const showHandLegend = $derived(
    handMarkers.length > 0 || timeline.some((note) => note.hand !== undefined),
  );

  function handSwatchClass(hand: PianoHand): string {
    return cn(
      "inline-block size-3 shrink-0 rounded-sm",
      hand === "left" ? "ring-2 ring-inset ring-hand-left bg-hand-left/20" : "bg-hand-right",
    );
  }

  // ── Waterfall + playback layer ────────────────────────────────────────────
  // Everything here is read-only motion: positions come from the route's
  // `positionBeat`, and nothing feeds back into playback or grading.

  let reducedMotion = $state(false);
  $effect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    reducedMotion = query.matches;
    const onChange = (event: MediaQueryListEvent) => (reducedMotion = event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  });

  const timeline = $derived(timelineNotes ?? []);
  /** Reduced motion drops the scrolling lane; the highlights below carry on. */
  const showWaterfall = $derived(
    timeline.length > 0 && positionBeat !== undefined && !reducedMotion,
  );

  const fallingNotes = $derived.by(() => {
    const position = positionBeat;
    if (position === undefined) return [];
    return timeline.flatMap((note, index) => {
      const lane = noteLane(geometry, note.midiNote);
      if (!lane) return [];
      const startAhead = note.startBeat - position;
      const endAhead = startAhead + note.durationBeats;
      if (endAhead <= 0 || startAhead >= LOOKAHEAD_BEATS) return [];
      const box = keyPercent(geometry, lane);
      // A note's distance from the keys *is* its height in the lane, so it
      // lands on its own key exactly when `startBeat - positionBeat` hits 0.
      const bottom = (Math.max(0, startAhead) / LOOKAHEAD_BEATS) * 100;
      const top = (Math.min(LOOKAHEAD_BEATS, endAhead) / LOOKAHEAD_BEATS) * 100;
      return [
        {
          id: `${index}:${note.midiNote}`,
          note,
          left: box.left,
          width: box.width,
          bottom,
          height: Math.max(1, top - bottom),
        },
      ];
    });
  });

  /** Keys light as the score sounds, with the next bar's notes hinted. */
  const playbackHighlights = $derived.by(() => {
    const position = positionBeat;
    const lit: Record<number, PianoHighlight> = {};
    if (position === undefined) return lit;
    for (const note of timeline) {
      const startAhead = note.startBeat - position;
      if (startAhead > 0 && startAhead < LOOKAHEAD_BEATS) {
        lit[note.midiNote] = { role: "upcoming", ...(note.hand ? { hand: note.hand } : {}) };
      }
    }
    for (const note of timeline) {
      const startAhead = note.startBeat - position;
      if (startAhead <= 0 && startAhead + note.durationBeats > 0) {
        lit[note.midiNote] = { role: "sounding", ...(note.hand ? { hand: note.hand } : {}) };
      }
    }
    return lit;
  });

  function requestMuteToggle(hand: PianoHand): void {
    const next = mutedHands.includes(hand)
      ? mutedHands.filter((candidate) => candidate !== hand)
      : [...mutedHands, hand];
    onMutedHandsChange?.([...next]);
  }

  // ──────────────────────────────────────────────────────────────────────────

  function highlightFor(midiNote: number): PianoHighlight | undefined {
    // Input and target state is the route's word; playback only fills the gaps.
    const highlight = highlights?.[midiNote] ?? playbackHighlights[midiNote];
    return typeof highlight === "string" ? { role: highlight } : highlight;
  }

  /** wrong/correct > active > target/hand > sounding > upcoming/locate > tone role > neutral. */
  function keyState(midiNote: number): PianoKeyState {
    const highlight = highlightFor(midiNote);
    if (highlight?.role === "wrong") return "wrong";
    if (highlight?.role === "correct") return "correct";
    if (heldNotes.has(midiNote) || highlight?.role === "active") return "active";
    if (highlight?.role === "target") {
      return highlight.hand === "left"
        ? "target-left"
        : highlight.hand === "right"
          ? "target-right"
          : "target";
    }
    if (highlight?.role === "sounding") {
      return highlight.hand === "left"
        ? "sounding-left"
        : highlight.hand === "right"
          ? "sounding-right"
          : "sounding";
    }
    if (highlight?.role === "upcoming") return "upcoming";
    if (highlight?.role === "locate") return "locate";
    return toneRoles?.[midiNote] ?? "neutral";
  }

  function accessibleName(key: PianoKey, state: PianoKeyState): string {
    const finger = fingerings?.[key.midiNote];
    return [key.name, STATE_LABELS[state], finger ? `finger ${finger}` : ""]
      .filter(Boolean)
      .join(", ");
  }

  /**
   * A static diagram exposes no key controls, so everything its colours say
   * lives in this one summary: each non-neutral key with its state, hand, tone
   * role, and fingering. It replaces per-key tab stops, it does not add any.
   */
  const staticSummary = $derived.by(() => {
    if (playable) return "";
    const named = geometry.keys
      .map((key) => ({ key, state: keyState(key.midiNote) }))
      .filter(({ state }) => state !== "neutral")
      .map(({ key, state }) => accessibleName(key, state));
    // Semicolons keep "C4, chord tone" from running into the next key.
    return named.length > 0 ? named.join("; ") : "No highlighted notes";
  });

  function nameVisible(key: PianoKey): boolean {
    if (noteNames === "all") return true;
    return noteNames === "c" && key.midiNote % 12 === 0;
  }

  function stateClass(state: PianoKeyState): string {
    switch (state) {
      case "wrong":
        return "bg-destructive text-destructive-foreground hit-wrong";
      case "correct":
        return "bg-success text-success-foreground hit-correct";
      case "active":
        return "bg-practice-accent text-practice-accent-foreground";
      case "target":
        return "bg-practice-accent/45 ring-1 ring-inset ring-practice-accent";
      // Hands differ in form as well as hue: left is an outlined ring over a
      // light tint, right is a solid fill. Both carry an L / R glyph below.
      case "target-left":
        return "bg-hand-left/20 ring-[3px] ring-inset ring-hand-left";
      case "target-right":
        return "bg-hand-right/75 ring-1 ring-inset ring-hand-right text-hand-right-foreground";
      // Playing keys sit a shade stronger than their target/upcoming forms so
      // "sounding now" reads at a glance without a new hue.
      case "sounding":
        return "bg-practice-accent/70 ring-2 ring-inset ring-practice-accent";
      case "sounding-left":
        return "bg-hand-left/45 ring-[3px] ring-inset ring-hand-left";
      case "sounding-right":
        return "bg-hand-right ring-2 ring-inset ring-hand-right text-hand-right-foreground";
      case "upcoming":
        return "bg-info/25";
      case "locate":
        return "bg-info/20 ring-2 ring-inset ring-info";
      case "chord":
        return "bg-primary text-primary-foreground";
      case "scale":
        // Outlined, not just a paler fill, so chord/scale/avoid differ in form.
        return "bg-primary/25 ring-1 ring-inset ring-primary";
      case "avoid":
      case "neutral":
        return "";
    }
  }

  function keyClass(key: PianoKey, state: PianoKeyState): string {
    return cn(
      "relative grid items-end justify-center border border-piano-key-line pb-1 text-[10px] font-semibold leading-none transition-colors",
      // Keys read as keys: a top-to-bottom shade and a bottom lip on the white
      // keys, an edge highlight on the black ones. State fills replace the shade.
      key.kind === "white"
        ? "h-28 rounded-b-md bg-piano-key text-piano-key-black shadow-[inset_0_-4px_0_var(--piano-key-line)] sm:h-32"
        : "absolute top-0 z-10 h-[62%] rounded-b-sm border-piano-key-black bg-piano-key-black text-piano-key shadow-[inset_0_-5px_0_oklch(0_0_0/40%),inset_1px_0_0_oklch(1_0_0/15%)]",
      key.kind === "white" &&
        state === "neutral" &&
        "bg-linear-to-b from-piano-key to-[color-mix(in_oklab,var(--piano-key)_93%,black)]",
      playable && "cursor-pointer",
      playable &&
        "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-practice-accent focus-visible:ring-offset-1",
      stateClass(state),
    );
  }

  function onKeyPointerDown(event: PointerEvent, midiNote: number): void {
    pointerHandled = true;
    // Capture keeps the release on this key even if the finger slides off.
    // ponytail: synthetic pointers have nothing to capture, hence the guard.
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* no live pointer for this id */
    }
    input.press(midiNote, "pointer", event.pointerId);
  }

  function onKeyClick(midiNote: number): void {
    if (pointerHandled) {
      pointerHandled = false;
      return;
    }
    // An activation with neither a pointer nor a key-up of its own (assistive
    // or programmatic click) plays one momentary note, so repeating a note
    // re-attacks it. Real keyboard activation latches instead, below.
    input.tap(midiNote);
  }

  function onKeyKeydown(event: KeyboardEvent, midiNote: number): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Swallow the synthetic click this would otherwise produce.
    event.preventDefault();
    input.toggleLatch(midiNote);
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!playable) return;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const semitones = QWERTY_SEMITONES[event.key.toLowerCase()];
    if (semitones === undefined) return;
    event.preventDefault();
    input.press(baseMidi + semitones, "qwerty", event.code || event.key.toLowerCase());
  }

  function onWindowKeyup(event: KeyboardEvent): void {
    if (!playable) return;
    input.release("qwerty", event.code || event.key.toLowerCase());
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onkeyup={onWindowKeyup} />

{#snippet pianoKeyView(key: PianoKey)}
  {@const state = keyState(key.midiNote)}
  {@const box = keyPercent(geometry, key)}
  {#if playable}
    <button
      type="button"
      data-note={key.name}
      data-state={state}
      data-tone-role={toneRoles?.[key.midiNote]}
      aria-label={accessibleName(key, state)}
      aria-pressed={heldNotes.has(key.midiNote)}
      class={keyClass(key, state)}
      style:left={key.kind === "black" ? `${box.left}%` : undefined}
      style:width={key.kind === "black" ? `${box.width}%` : undefined}
      onpointerdown={(event) => onKeyPointerDown(event, key.midiNote)}
      onpointerup={(event) => input.release("pointer", event.pointerId)}
      onpointercancel={(event) => {
        pointerHandled = false;
        input.release("pointer", event.pointerId);
      }}
      onlostpointercapture={(event) => input.release("pointer", event.pointerId)}
      onclick={() => onKeyClick(key.midiNote)}
      onkeydown={(event) => onKeyKeydown(event, key.midiNote)}
    >
      <span class={nameVisible(key) ? "" : "sr-only"}>{key.name}</span>
    </button>
  {:else}
    <div
      data-note={key.name}
      data-state={state}
      data-tone-role={toneRoles?.[key.midiNote]}
      aria-hidden="true"
      class={keyClass(key, state)}
      style:left={key.kind === "black" ? `${box.left}%` : undefined}
      style:width={key.kind === "black" ? `${box.width}%` : undefined}
    >
      <span class={nameVisible(key) ? "" : "sr-only"}>{key.name}</span>
    </div>
  {/if}
{/snippet}

<div role="group" aria-label={label} class={cn("grid min-w-0 gap-2", cls)}>
  <div class="min-w-0 overflow-x-auto">
    {#if showWaterfall}
      <!--
        One scroll container, one min-width: the lane can never drift sideways
        from the keys it falls onto. Notes are decoration - what they mean is
        said by each key's own state and name.
      -->
      <div
        data-testid="piano-waterfall"
        aria-hidden="true"
        class="relative h-32 overflow-hidden rounded-t-md bg-stage-2 sm:h-40"
        style:min-width={`${minKeyboardWidthPx(geometry)}px`}
      >
        {#each fallingNotes as fall (fall.id)}
          <span
            data-testid="waterfall-note"
            data-note={fall.note.midiNote}
            data-hand={fall.note.hand}
            data-muted={fall.note.hand !== undefined && mutedHands.includes(fall.note.hand)
              ? "true"
              : undefined}
            class={cn(
              "absolute rounded-sm",
              // Fill vs outline, not hue alone, separates the hands.
              fall.note.hand === "left"
                ? "border-2 border-hand-left bg-hand-left/40"
                : "bg-hand-right opacity-90",
              fall.note.hand !== undefined && mutedHands.includes(fall.note.hand) && "opacity-40",
            )}
            style:left={`${fall.left}%`}
            style:width={`${fall.width}%`}
            style:bottom={`${fall.bottom}%`}
            style:height={`${fall.height}%`}
          ></span>
        {/each}
      </div>
    {/if}
    <div
      class="relative grid touch-none select-none"
      style:grid-template-columns={`repeat(${geometry.whiteCount}, minmax(${MIN_WHITE_KEY_PX}px, 1fr))`}
      style:min-width={`${minKeyboardWidthPx(geometry)}px`}
    >
      {#each geometry.whiteKeys as key (key.midiNote)}
        {@render pianoKeyView(key)}
      {/each}
      {#each geometry.blackKeys as key (key.midiNote)}
        {@render pianoKeyView(key)}
      {/each}
      {#each handMarkers as marker (marker.key.midiNote)}
        {@const box = keyPercent(geometry, marker.key)}
        <span
          data-testid={`hand-marker-${marker.key.midiNote}`}
          class={cn(
            "pointer-events-none absolute z-20 grid size-4 place-items-center rounded-full text-[10px] font-bold leading-none",
            marker.hand === "left"
              ? "bg-hand-left text-hand-left-foreground"
              : "bg-hand-right-foreground text-hand-right ring-1 ring-inset ring-hand-right",
            marker.key.kind === "white" ? "bottom-12" : "top-7",
          )}
          style:left={`${box.left + box.width / 2}%`}
          style:transform="translateX(-50%)"
          aria-hidden="true"
        >
          {marker.hand === "left" ? "L" : "R"}
        </span>
      {/each}
      {#each fingerMarkers as marker (marker.midiNote)}
        {@const box = keyPercent(geometry, marker.key)}
        <span
          data-testid={`finger-${marker.midiNote}`}
          class={cn(
            "pointer-events-none absolute z-20 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold leading-none text-primary-foreground shadow-sm",
            marker.key.kind === "white" ? "bottom-6" : "top-1",
          )}
          style:left={`${box.left + box.width / 2}%`}
          style:transform="translateX(-50%)"
          aria-hidden="true"
        >
          {marker.finger}
        </span>
      {/each}
    </div>
  </div>

  {#if !playable}
    <p class="sr-only" data-testid="piano-summary">{staticSummary}</p>
  {/if}

  {#if showHandLegend}
    <p
      data-testid="piano-hand-legend"
      class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-stage-muted"
    >
      <span class="flex items-center gap-1.5">
        <span class={handSwatchClass("left")} aria-hidden="true"></span>Left hand, outlined L
      </span>
      <span class="flex items-center gap-1.5">
        <span class={handSwatchClass("right")} aria-hidden="true"></span>Right hand, filled R
      </span>
    </p>
  {/if}

  {#if onMutedHandsChange}
    <div class="flex flex-wrap gap-2" role="group" aria-label="Hand mute">
      {#each HANDS as hand (hand)}
        {@const muted = mutedHands.includes(hand)}
        <button
          type="button"
          data-testid={`mute-${hand}`}
          aria-pressed={muted}
          class={cn(
            "flex items-center gap-2 rounded border border-stage-line px-2 py-1 text-xs font-semibold text-stage-foreground hover:bg-stage-2",
            muted && "opacity-60",
          )}
          onclick={() => requestMuteToggle(hand)}
        >
          <span class={handSwatchClass(hand)} aria-hidden="true"></span>
          {muted ? "Unmute" : "Mute"}
          {hand} hand
        </button>
      {/each}
    </div>
  {/if}

  {#if latchedNotes.size > 0}
    <!-- Latched notes stay down with no finger on them, so the surface says
         what it is holding and offers the release in the same breath. -->
    <div
      data-testid="piano-holding"
      class="flex flex-wrap items-center gap-2 text-xs font-semibold text-stage-foreground"
    >
      <span class="inline-flex items-center gap-1.5 rounded border border-stage-line bg-stage-2 px-2 py-1">
        <span class="size-2 rounded-full bg-practice-accent" aria-hidden="true"></span>
        Holding {[...latchedNotes].sort((a, b) => a - b).map((midiNote) => geometry.keys.find((key) => key.midiNote === midiNote)?.name ?? String(midiNote)).join(" ")}
      </span>
      <button
        type="button"
        class="rounded border border-stage-line px-2 py-1 text-xs font-semibold text-stage-foreground hover:bg-stage-2"
        onclick={() => input.clearLatches()}
      >
        Clear held notes
      </button>
    </div>
  {/if}

  {#if playable}
    <p class="hidden text-xs text-muted-foreground sm:block">
      Type to play: <kbd class="rounded border bg-muted px-1 font-mono">A</kbd>–<kbd
        class="rounded border bg-muted px-1 font-mono">L</kbd
      > white keys · <kbd class="rounded border bg-muted px-1 font-mono">W</kbd>–<kbd
        class="rounded border bg-muted px-1 font-mono">P</kbd
      > sharps
    </p>
  {/if}
</div>
