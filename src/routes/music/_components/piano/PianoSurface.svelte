<script lang="ts" module>
  /** Layer types stay colocated with the only component that renders them. */
  export type PianoHand = "left" | "right";

  export type PianoHighlightRole =
    | "target"
    | "active"
    | "correct"
    | "wrong"
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
    upcoming: "upcoming",
    locate: "locate",
    chord: "chord tone",
    scale: "scale tone",
    avoid: "avoid",
    neutral: "",
  };
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
    pianoGeometry,
    toMidiNote,
    type PianoKey,
  } from "./piano-geometry";
  import { PianoInput, QWERTY_SEMITONES, isTypingTarget, qwertyBaseMidi } from "./piano-input";

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
    onAccepted,
    waitGroupKey,
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
    onAccepted?: (event: NoteEvent) => void;
    /**
     * The follower group id + generation. Providing it opts this instance into
     * wait-mode takeover/reset; omit it to keep ordinary holder lifetime.
     */
    waitGroupKey?: string;
    label?: string;
    class?: string;
  } = $props();

  const geometry = $derived(pianoGeometry({ lowMidi, highMidi, notes }));
  const material = $derived((notes ?? []).map(toMidiNote));
  // Anchor QWERTY's C at the lowest relevant note's octave; with no material,
  // one octave into the view (C4 for the default range), as before.
  const baseMidi = $derived(qwertyBaseMidi(material.length > 0 ? material : [geometry.lowMidi + 12]));
  const playable = $derived(interactive && router !== undefined);

  let heldNotes = $state<ReadonlySet<number>>(new Set());
  let latchedNotes = $state<ReadonlySet<number>>(new Set());
  /** A pointer sequence already handled this activation, so skip its click. */
  let pointerHandled = false;

  const input = new PianoInput({
    router: () => router,
    instrument: () => instrument,
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

  function highlightFor(midiNote: number): PianoHighlight | undefined {
    const highlight = highlights?.[midiNote];
    return typeof highlight === "string" ? { role: highlight } : highlight;
  }

  /** wrong/correct > active > target/hand > upcoming/locate > tone role > neutral. */
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

  function nameVisible(key: PianoKey): boolean {
    if (noteNames === "all") return true;
    return noteNames === "c" && key.midiNote % 12 === 0;
  }

  function stateClass(state: PianoKeyState): string {
    switch (state) {
      case "wrong":
        return "bg-destructive text-destructive-foreground";
      case "correct":
        return "bg-success text-success-foreground";
      case "active":
        return "bg-practice-accent text-practice-accent-foreground";
      case "target":
        return "bg-practice-accent/45 ring-1 ring-inset ring-practice-accent";
      case "target-left":
        return "bg-chart-4/70 ring-1 ring-inset ring-chart-4";
      case "target-right":
        return "bg-chart-2/70 ring-1 ring-inset ring-chart-2";
      case "upcoming":
        return "bg-info/25";
      case "locate":
        return "bg-info/20 ring-2 ring-inset ring-info";
      case "chord":
        return "bg-primary text-primary-foreground";
      case "scale":
        return "bg-primary/25";
      case "avoid":
      case "neutral":
        return "";
    }
  }

  function keyClass(key: PianoKey, state: PianoKeyState): string {
    return cn(
      "relative grid items-end justify-center border border-piano-key-line pb-1 text-[10px] font-semibold leading-none transition-colors",
      key.kind === "white"
        ? "h-28 rounded-b-md bg-piano-key text-piano-key-black sm:h-32"
        : "absolute top-0 z-10 h-[62%] rounded-b-sm border-piano-key-black bg-piano-key-black text-piano-key",
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

  {#if latchedNotes.size > 0}
    <div>
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
