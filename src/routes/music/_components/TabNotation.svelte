<script lang="ts">
  import { Dot, Formatter, GhostNote, Renderer, TabNote, TabStave, Voice } from "vexflow";

  import type { InstrumentProjection } from "@repo/music-core/domain";
  import type { NotationEvent, NotationView } from "@repo/music-core/engines/notation";
  import type { LoopSnap, ScoreSelectionMap } from "@repo/music-core/engines/score-practice";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";

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
    projection,
    tuning,
    selectionMap,
    highlightedRanges = [],
    customSelection,
    snap = "note-group",
    selectionEnabled = false,
    onSelectionChange,
    onError = () => undefined,
  }: {
    view: NotationView;
    projection: InstrumentProjection;
    tuning: TuningProfile;
    selectionMap?: ScoreSelectionMap;
    highlightedRanges?: NotationRangeHighlight[];
    customSelection?: BeatRange;
    snap?: LoopSnap;
    selectionEnabled?: boolean;
    onSelectionChange?: (range: BeatRange) => void;
    onError?: (message: string) => void;
  } = $props();

  const ROW_HEIGHT = 120;

  let wrapper = $state<HTMLDivElement>();
  let host = $state<HTMLDivElement>();
  let hitTargets = $state.raw<NotationHitTarget[]>([]);
  let previewRange = $state.raw<BeatRange>();
  let dragStart: NotationHitTarget | undefined;
  let pendingTap: NotationHitTarget | undefined;
  let dragging = false;

  // startBeat -> { str, fret }[] from the canonical fretboard projection.
  const fretByOnset = $derived.by(() => {
    const map = new Map<number, { str: number; fret: number }[]>();
    for (const note of projection.notes) {
      const position = note.frets?.[0];
      if (!position) continue;
      const group = map.get(note.startBeat) ?? [];
      group.push({ str: position.string, fret: position.fret });
      map.set(note.startBeat, group);
    }
    return map;
  });

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
    if (host && wrapper) draw(host, wrapper, view, fretByOnset, tuning, selectionMap, snap);
  });

  function draw(
    target: HTMLDivElement,
    container: HTMLDivElement,
    notationView: NotationView,
    frets: Map<number, { str: number; fret: number }[]>,
    tuningProfile: TuningProfile,
    boundaries: ScoreSelectionMap | undefined,
    snapMode: LoopSnap,
  ): void {
    try {
      target.replaceChildren();
      const clef = notationView.staves[0]?.clef;
      const width = Math.max(320, target.clientWidth || 720);
      const height = Math.max(140, notationView.measures.length * ROW_HEIGHT);
      const renderer = new Renderer(target, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const context = renderer.getContext();
      const renderedNotes: NotationEvent[] = [];

      for (const measure of notationView.measures) {
        const stave = new TabStave(12, measure.index * ROW_HEIGHT + 8, width - 24, {
          num_lines: tuningProfile.openStrings.length,
        });
        stave.addClef("tab").setContext(context).draw();

        const events = clef ? measure.events.filter((event) => event.staff === clef) : measure.events;
        if (events.length === 0) continue;

        const tickables = events.map((event) => {
          const positions = event.kind === "rest" ? [] : (frets.get(event.startBeat) ?? []);
          if (positions.length === 0) return withDots(new GhostNote({ duration: event.duration }), event.dots);
          renderedNotes.push(event);
          return withDots(new TabNote({ positions, duration: event.duration }), event.dots);
        });

        const voice = new Voice({ numBeats: measure.durationBeats, beatValue: 4 }).setMode(
          Voice.Mode.SOFT,
        );
        voice.addTickables(tickables);
        new Formatter().joinVoices([voice]).format([voice], width - 130);
        voice.draw(context, stave);
      }

      const svg = target.querySelector("svg");
      svg?.setAttribute("fill", "currentColor");
      svg?.setAttribute("stroke", "currentColor");
      svg?.querySelectorAll('[stroke="#444"]').forEach((element) => {
        element.setAttribute("stroke", "currentColor");
      });

      const noteGroups = target.querySelectorAll<SVGGElement>(".vf-tabnote");
      noteGroups.forEach((group, index) => {
        const event = renderedNotes[index];
        if (!event) return;
        const range = boundaryRange(event.startBeat, boundaries?.noteGroupBoundaries);
        group.dataset.eventId = event.id;
        group.dataset.selectionKind = "note-group";
        group.dataset.boundaryId = range?.boundaryId ?? event.id;
        group.dataset.startBeat = String(range?.startBeat ?? event.startBeat);
        group.dataset.endBeat = String(range?.endBeat ?? event.startBeat + event.durationBeats);
      });

      appendMeasureTargets(target, notationView, width);
      hitTargets = collectHitTargets(target, container, snapMode);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Tab could not be rendered.");
    }
  }

  function withDots<T extends TabNote | GhostNote>(note: T, dots: number): T {
    for (let index = 0; index < dots; index += 1) Dot.buildAndAttach([note], { all: true });
    return note;
  }

  function appendMeasureTargets(target: HTMLDivElement, notationView: NotationView, width: number): void {
    const svg = target.querySelector("svg");
    if (!svg) return;
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("pointer-events", "none");

    for (const measure of notationView.measures) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", "12");
      rect.setAttribute("y", String(measure.index * ROW_HEIGHT + 8));
      rect.setAttribute("width", String(width - 24));
      rect.setAttribute("height", "90");
      rect.setAttribute("fill", "transparent");
      rect.dataset.selectionKind = "measure";
      rect.dataset.boundaryId = `measure:${measure.index}`;
      rect.dataset.startBeat = String(measure.startBeat);
      rect.dataset.endBeat = String(measure.startBeat + measure.durationBeats);
      layer.append(rect);
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
      ...target.querySelectorAll<SVGGraphicsElement>(`[data-selection-kind="${snapMode}"]`),
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
    return nearestHit({ x: event.clientX - rect.left, y: event.clientY - rect.top }, hitTargets);
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
</script>

<div bind:this={wrapper} class="relative min-w-0 max-w-full">
  <div
    bind:this={host}
    class="min-h-32 w-full min-w-0 max-w-full overflow-x-auto rounded-md border bg-background p-2 text-foreground [&_svg]:min-w-[320px] {selectionEnabled
      ? 'cursor-crosshair'
      : ''}"
    role={selectionEnabled ? "group" : "img"}
    aria-label="Guitar tab"
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
          ? 'border-primary/60 bg-primary/20'
          : 'border-primary/30 bg-primary/10'}"
        style:left="{layer.left}px"
        style:top="{layer.top}px"
        style:width="{layer.width}px"
        style:height="{layer.height}px"
      ></span>
    {/each}
  </div>
</div>
