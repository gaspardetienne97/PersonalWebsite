<script lang="ts">
  import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";

  import {
    writtenPitchName,
    type NotationEvent,
    type NotationView,
  } from "@repo/music-core/engines/notation";
  import type {
    LoopSnap,
    ScoreSelectionMap,
  } from "@repo/music-core/engines/score-practice";

  import {
    nearestHit,
    overlayRects,
    rangeFromHits,
    type BeatRange,
    type NotationHitTarget,
    type NotationRangeHighlight,
  } from "./notation-selection";

  let {
    view,
    activeEventIds = [],
    errorEventIds = [],
    selectionMap,
    highlightedRanges = [],
    customSelection,
    snap = "note-group",
    selectionEnabled = false,
    onSelectionChange,
    onError = () => undefined,
  }: {
    view: NotationView;
    activeEventIds?: string[];
    errorEventIds?: string[];
    selectionMap?: ScoreSelectionMap;
    highlightedRanges?: NotationRangeHighlight[];
    customSelection?: BeatRange;
    snap?: LoopSnap;
    selectionEnabled?: boolean;
    onSelectionChange?: (range: BeatRange) => void;
    onError?: (message: string) => void;
  } = $props();

  let wrapper = $state<HTMLDivElement>();
  let host = $state<HTMLDivElement>();
  let hitTargets = $state.raw<NotationHitTarget[]>([]);
  let previewRange = $state.raw<BeatRange>();
  let dragStart: NotationHitTarget | undefined;
  let pendingTap: NotationHitTarget | undefined;
  let dragging = false;

  const overlayLayers = $derived.by(() => {
    const ranges: NotationRangeHighlight[] = [
      ...highlightedRanges,
      ...(customSelection ? [{ id: "custom", ...customSelection, active: true }] : []),
      ...(previewRange ? [{ id: "preview", ...previewRange, active: true }] : []),
    ];
    return ranges.flatMap((range) =>
      overlayRects(range, hitTargets).map((rect, index) => ({
        id: `${range.id}:${index}`,
        rangeId: range.id,
        active: range.active ?? false,
        ...rect,
      })),
    );
  });

  $effect(() => {
    if (host && wrapper) {
      draw(host, wrapper, view, activeEventIds, errorEventIds, selectionMap, snap);
    }
  });

  function draw(
    target: HTMLDivElement,
    container: HTMLDivElement,
    notationView: NotationView,
    activeIds: string[],
    errorIds: string[],
    boundaries: ScoreSelectionMap | undefined,
    snapMode: LoopSnap,
  ): void {
    try {
      target.replaceChildren();
      const width = Math.max(320, target.clientWidth || 720);
      const rows = notationView.measures.length * Math.max(1, notationView.staves.length);
      const height = Math.max(150, rows * 130);
      const renderer = new Renderer(target, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const context = renderer.getContext();
      const renderedEvents: NotationEvent[] = [];

      for (const measure of notationView.measures) {
        for (const [staffIndex, staffView] of notationView.staves.entries()) {
          const row = measure.index * notationView.staves.length + staffIndex;
          const stave = new Stave(12, row * 130 + 18, width - 24);
          stave
            .addClef(staffView.clef)
            .addKeySignature(vexKey(notationView.keySignature))
            .addTimeSignature(
              `${notationView.timeSignature.numerator}/${notationView.timeSignature.denominator}`,
            )
            .setContext(context)
            .draw();

          const events = measure.events.filter(({ staff }) => staff === staffView.clef);
          if (events.length === 0) continue;
          const notes = events.map((event) => {
            renderedEvents.push(event);
            return staveNote(event, staffView.clef);
          });
          const voice = new Voice({
            numBeats: measure.durationBeats,
            beatValue: 4,
          }).setMode(Voice.Mode.SOFT);
          voice.addTickables(notes);
          new Formatter().joinVoices([voice]).format([voice], width - 130);
          voice.draw(context, stave);
        }
      }

      const svg = target.querySelector("svg");
      svg?.setAttribute("fill", "currentColor");
      svg?.setAttribute("stroke", "currentColor");
      svg?.querySelectorAll('[stroke="#444"]').forEach((element) => {
        element.setAttribute("stroke", "currentColor");
      });

      const noteGroups = target.querySelectorAll<SVGGElement>(".vf-stavenote");
      noteGroups.forEach((group, index) => {
        const event = renderedEvents[index];
        if (!event) return;
        const range = boundaryRange(event.startBeat, boundaries?.noteGroupBoundaries);
        const active = activeIds.includes(event.id);
        group.dataset.eventId = event.id;
        group.dataset.selectionKind = "note-group";
        group.dataset.boundaryId = range?.boundaryId ?? event.id;
        group.dataset.startBeat = String(range?.startBeat ?? event.startBeat);
        group.dataset.endBeat = String(range?.endBeat ?? event.startBeat + event.durationBeats);
        group.dataset.activeNote = active ? "true" : "false";
        group.classList.toggle("text-practice-accent", active);
        group.classList.toggle("text-destructive", errorIds.includes(event.id));
      });

      appendMeasureTargets(target, notationView, width);
      hitTargets = collectHitTargets(target, container, snapMode);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Notation could not be rendered.");
    }
  }

  function appendMeasureTargets(
    target: HTMLDivElement,
    notationView: NotationView,
    width: number,
  ): void {
    const svg = target.querySelector("svg");
    if (!svg) return;
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("pointer-events", "none");

    for (const measure of notationView.measures) {
      for (const staffIndex of notationView.staves.keys()) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", "12");
        rect.setAttribute("y", String(measure.index * notationView.staves.length * 130 + staffIndex * 130 + 18));
        rect.setAttribute("width", String(width - 24));
        rect.setAttribute("height", "80");
        rect.setAttribute("fill", "transparent");
        rect.dataset.selectionKind = "measure";
        rect.dataset.boundaryId = `measure:${measure.index}`;
        rect.dataset.startBeat = String(measure.startBeat);
        rect.dataset.endBeat = String(measure.startBeat + measure.durationBeats);
        layer.append(rect);
      }
    }
    svg.append(layer);
  }

  function collectHitTargets(
    target: HTMLDivElement,
    container: HTMLDivElement,
    snapMode: LoopSnap,
  ): NotationHitTarget[] {
    const containerRect = container.getBoundingClientRect();
    return [
      ...target.querySelectorAll<SVGGraphicsElement>(
        `[data-selection-kind="${snapMode}"]`,
      ),
    ].map((element) => {
      const rect = element.getBoundingClientRect();
      const startBeat = Number(element.dataset.startBeat);
      return {
        boundaryId: element.dataset.boundaryId ?? `${snapMode}:${startBeat}`,
        beat: startBeat,
        startBeat,
        endBeat: Number(element.dataset.endBeat),
        rect: {
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          right: rect.right - containerRect.left,
          bottom: rect.bottom - containerRect.top,
        },
      };
    });
  }

  function boundaryRange(
    beat: number,
    boundaries: ScoreSelectionMap["noteGroupBoundaries"] | undefined,
  ): { boundaryId: string; startBeat: number; endBeat: number } | undefined {
    if (!boundaries) return undefined;
    const index = boundaries.findIndex((boundary) => Math.abs(boundary.beat - beat) < 1e-6);
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (!start || !end) return undefined;
    return { boundaryId: start.id, startBeat: start.beat, endBeat: end.beat };
  }

  function pointerHit(event: PointerEvent): NotationHitTarget | undefined {
    if (!wrapper) return undefined;
    const rect = wrapper.getBoundingClientRect();
    return nearestHit(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      hitTargets,
    );
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!selectionEnabled) return;
    dragStart = pointerHit(event);
    dragging = dragStart !== undefined;
    previewRange = undefined;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!selectionEnabled || !dragging || !dragStart) return;
    const end = pointerHit(event);
    previewRange = end ? rangeFromHits(dragStart, end) : undefined;
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!selectionEnabled || !dragStart) return;
    const end = pointerHit(event);
    const draggedRange = end ? rangeFromHits(dragStart, end) : undefined;

    if (draggedRange) {
      onSelectionChange?.(draggedRange);
      pendingTap = undefined;
    } else if (end && pendingTap) {
      const tappedRange = rangeFromHits(pendingTap, end);
      if (tappedRange) {
        onSelectionChange?.(tappedRange);
        pendingTap = undefined;
      }
    } else if (end) {
      pendingTap = end;
    }

    dragStart = undefined;
    dragging = false;
    previewRange = undefined;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  function handlePointerCancel(): void {
    dragStart = undefined;
    dragging = false;
    previewRange = undefined;
  }

  function staveNote(event: NotationEvent, clef: "treble" | "bass"): StaveNote {
    const note = new StaveNote({
      clef,
      keys:
        event.kind === "rest"
          ? [clef === "bass" ? "d/3" : "b/4"]
          : event.pitches.map((pitch) => vexPitch(writtenPitchName(pitch, true))),
      duration: `${event.duration}${event.kind === "rest" ? "r" : ""}`,
    });
    if (event.kind === "note") {
      event.pitches.forEach((pitch, index) => {
        if (pitch.accidental && pitch.accidental !== "natural") {
          note.addModifier(new Accidental(pitch.accidental), index);
        } else if (pitch.accidental === "natural") {
          note.addModifier(new Accidental("n"), index);
        }
      });
    }
    for (let index = 0; index < event.dots; index += 1) Dot.buildAndAttach([note], { all: true });
    return note;
  }

  function vexPitch(note: string): string {
    const match = /^([A-Ga-g])(?:bb|b|##|#)?(-?\d+)$/.exec(note);
    if (!match) throw new Error(`Unsupported written pitch: ${note}`);
    return `${match[1]!.toLowerCase()}/${match[2]}`;
  }

  function vexKey(keySignature: string): string {
    return keySignature.replace(/\s+(major|minor)$/i, "");
  }
</script>

<div bind:this={wrapper} class="relative min-w-0 max-w-full">
  <div
    bind:this={host}
    class="min-h-40 w-full min-w-0 max-w-full overflow-x-auto rounded-md border bg-background p-2 text-foreground [&_svg]:min-w-[320px] {selectionEnabled
      ? 'cursor-crosshair'
      : ''}"
    role={selectionEnabled ? "group" : "img"}
    aria-label="Staff notation"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
  ></div>
  <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-md" aria-hidden="true">
    {#each overlayLayers as layer (layer.id)}
      <span
        data-notation-highlight={layer.rangeId}
        data-active={layer.active}
        class="absolute rounded-sm border {layer.active
          ? 'border-practice-accent/80 bg-practice-accent/20 shadow-[0_0_0_1px_hsl(var(--practice-accent)/0.22)]'
          : 'border-practice-accent/30 bg-practice-accent/10'}"
        style:left="{layer.left}px"
        style:top="{layer.top}px"
        style:width="{layer.width}px"
        style:height="{layer.height}px"
      >
        {#if layer.active}
          <span
            data-notation-cursor={layer.rangeId}
            class="absolute -top-1 bottom-[-0.25rem] left-0 w-1.5 rounded-full bg-practice-accent ring-2 ring-background"
          ></span>
          <span
            data-notation-cursor-label={layer.rangeId}
            class="absolute left-2 top-1 rounded-sm bg-practice-accent px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-practice-accent-foreground shadow-sm"
          >
            Now
          </span>
        {/if}
      </span>
    {/each}
  </div>
</div>
