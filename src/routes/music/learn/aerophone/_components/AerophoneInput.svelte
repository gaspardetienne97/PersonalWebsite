<script lang="ts">
  import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";

  import AerophoneFingering from "../../../_components/AerophoneFingering.svelte";
  import {
    QWERTY_SEMITONES,
    isTypingTarget,
    qwertyBaseMidi,
  } from "../../../_components/piano/piano-input";

  /**
   * Fingering-first on-screen input for the Aerophone: the target fingering is
   * the thing you play, and the note that last landed is shown beside it. It
   * replaces the piano fallback keyboard on this route — a wind controller has
   * no keys to look at.
   *
   * ATTACK-ONLY, DELIBERATELY. `aerophone-articulation` measures sounding time
   * from `noteOn`/`noteOff` pairs and scores a run with no releases as
   * unassessable (articulation 0% plus "use a wind controller for
   * articulation"). Routing an on-screen release would silently start grading
   * mouse/key hold time against the 35%/95%-of-beat style targets, so this
   * surface never emits `noteOff`: note length belongs to the controller. That
   * is also why it reuses only the shared QWERTY key map, not the piano hold
   * registry.
   */
  let {
    router,
    targetMidi,
    currentMidi,
    onAccepted,
  }: {
    router: InputRouter;
    targetMidi: number;
    /** The note that last landed, from any source; omit until one has. */
    currentMidi?: number;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const targetLabel = $derived(midiToNote(targetMidi));
  // Anchor the QWERTY mapping's C at the target's octave, as before.
  const baseMidi = $derived(qwertyBaseMidi([targetMidi]));
  const baseLabel = $derived(midiToNote(baseMidi));

  function emit(midiNote: number): void {
    const event: NoteEvent = {
      type: "noteOn",
      midiNote,
      velocity: 1,
      source: "onscreen",
      timestamp: monotonicMs(performance.now()),
      clock: "performance",
      instrument: "aerophone",
    };
    if (router.push(event)) onAccepted?.(event);
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const semitones = QWERTY_SEMITONES[event.key.toLowerCase()];
    if (semitones === undefined) return;
    event.preventDefault();
    emit(baseMidi + semitones);
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div role="group" aria-label="Aerophone fingering input" class="grid gap-3">
  <div class="flex flex-wrap items-end gap-4">
    <!--
      One button whose fingering changes with the target, rather than a button
      per note: keyboard focus survives a target change, so the next attack
      stays one Enter away for the whole run.
    -->
    <button
      type="button"
      data-note={targetLabel}
      aria-label={`Play ${targetLabel}, target fingering`}
      class="rounded-xl border border-primary bg-primary/5 p-1.5 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-practice-accent focus-visible:ring-offset-1"
      onclick={() => emit(targetMidi)}
    >
      <AerophoneFingering midi={targetMidi} size={96} />
    </button>

    {#if currentMidi !== undefined}
      <div class="grid gap-1" data-testid="aerophone-last-played">
        <span class="text-xs font-semibold uppercase text-muted-foreground">Last played</span>
        <AerophoneFingering midi={currentMidi} size={72} />
      </div>
    {/if}
  </div>

  <p class="hidden text-xs text-muted-foreground sm:block">
    Type to play: <kbd class="rounded border bg-muted px-1 font-mono">A</kbd>–<kbd
      class="rounded border bg-muted px-1 font-mono">L</kbd
    >
    steps up from {baseLabel} ·
    <kbd class="rounded border bg-muted px-1 font-mono">W</kbd>–<kbd
      class="rounded border bg-muted px-1 font-mono">P</kbd
    > the semitones between
  </p>
</div>
