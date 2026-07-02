<script lang="ts">
  import { tick } from "svelte";

  import type {
    LoopSnap,
    ScoreSelectionBoundary,
    ScoreSelectionMap,
  } from "@repo/music-core/engines/score-practice";
  import { filterMusicXmlParts } from "@repo/music-core/engines/score-import";

  import {
    nearestHit,
    overlayRects,
    rangeFromHits,
    type BeatRange,
    type NotationHitTarget,
    type NotationRangeHighlight,
  } from "./notation-selection";

  let {
    xml,
    partIds,
    selectionMap,
    highlightedRanges = [],
    customSelection,
    cursorBeat,
    snap = "note-group",
    selectionEnabled = false,
    onSelectionChange,
    onError = () => undefined,
  }: {
    xml: string;
    partIds?: string[];
    selectionMap?: ScoreSelectionMap;
    highlightedRanges?: NotationRangeHighlight[];
    customSelection?: BeatRange;
    cursorBeat?: number;
    snap?: LoopSnap;
    selectionEnabled?: boolean;
    onSelectionChange?: (range: BeatRange) => void;
    onError?: (message: string) => void;
  } = $props();

  interface SelectionRegion extends BeatRange {
    id: string;
    kind: LoopSnap;
    left: number;
    top: number;
    width: number;
    height: number;
  }

  interface GraphicalBox {
    AbsolutePosition: { x: number; y: number };
    BorderLeft: number;
    BorderRight: number;
    BorderTop: number;
    BorderBottom: number;
  }

  interface OsmdSelectionSource {
    GraphicSheet: {
      VerticalGraphicalStaffEntryContainers: Array<{
        AbsoluteTimestamp: { RealValue: number };
        StaffEntries: Array<{ PositionAndShape: GraphicalBox } | undefined>;
      }>;
      MeasureList: Array<Array<{ PositionAndShape: GraphicalBox }>>;
    };
    cursor: OsmdCursor;
  }

  interface OsmdCursor {
    cursorElement?: HTMLElement;
    Iterator?: {
      EndReached: boolean;
      CurrentSourceTimestamp?: { RealValue: number };
      currentTimeStamp?: { RealValue: number };
    };
    show(): void;
    hide(): void;
    reset(): void;
    next(): void;
    update(): void;
  }

  let wrapper = $state<HTMLDivElement>();
  let host = $state<HTMLDivElement>();
  let renderedOsmd = $state.raw<OsmdSelectionSource>();
  let status = $state<"loading" | "rendered" | "error">("loading");
  let errorMessage = $state("");
  let selectionRegions = $state.raw<SelectionRegion[]>([]);
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
    if (!host || !wrapper || !xml) return;

    let disposed = false;
    let clear: () => void = () => undefined;
    status = "loading";
    errorMessage = "";
    selectionRegions = [];
    hitTargets = [];
    renderedOsmd = undefined;
    host.replaceChildren();

    void renderSelectedMusicXml(host, xml, partIds).then(
      async ({ cleanup, osmd }) => {
        if (disposed) {
          cleanup();
          return;
        }
        clear = cleanup;
        try {
          selectionRegions = buildSelectionRegions(osmd, selectionMap, snap);
          renderedOsmd = osmd;
          await tick();
          if (!disposed) hitTargets = collectHitTargets(wrapper!, snap);
        } catch (error) {
          const selectionError =
            error instanceof Error
              ? `Direct score selection is unavailable: ${error.message}`
              : "Direct score selection is unavailable.";
          onError(selectionError);
        }
        status = "rendered";
      },
      (error) => {
        if (disposed) return;
        const message =
          error instanceof Error
            ? `MusicXML could not be rendered: ${error.message}`
            : "MusicXML could not be rendered.";
        errorMessage = message;
        status = "error";
        onError(message);
      },
    );

    return () => {
      disposed = true;
      clear();
      host?.replaceChildren();
    };
  });

  $effect(() => {
    if (!renderedOsmd) return;
    syncCursor(renderedOsmd, cursorBeat);
  });

  async function renderMusicXml(
    target: HTMLDivElement,
    content: string,
  ): Promise<{ cleanup: () => void; osmd: OsmdSelectionSource }> {
    const document = new DOMParser().parseFromString(content, "application/xml");
    if (
      document.querySelector("parsererror") ||
      document.documentElement.localName !== "score-partwise"
    ) {
      throw new Error("Invalid score-partwise MusicXML.");
    }

    const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
    const osmd = new OpenSheetMusicDisplay(target, {
      backend: "svg",
      autoResize: false,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawingParameters: "compacttight",
      cursorsOptions: [{ type: 1, color: "#7c3aed", alpha: 1, follow: false }],
    });
    await osmd.load(content);
    osmd.render();
    return {
      cleanup: () => osmd.clear(),
      osmd: osmd as unknown as OsmdSelectionSource,
    };
  }

  async function renderSelectedMusicXml(
    target: HTMLDivElement,
    content: string,
    selectedPartIds: string[] | undefined,
  ): Promise<{ cleanup: () => void; osmd: OsmdSelectionSource }> {
    return renderMusicXml(
      target,
      selectedPartIds?.length ? filterMusicXmlParts(content, selectedPartIds) : content,
    );
  }

  function syncCursor(osmd: OsmdSelectionSource, beat: number | undefined): void {
    const cursor = osmd.cursor;
    if (beat === undefined || !Number.isFinite(beat)) {
      cursor.hide();
      return;
    }

    cursor.reset();
    const targetTimestamp = beat / 4;
    for (let guard = 0; guard < 10_000 && !cursor.Iterator?.EndReached; guard += 1) {
      if (cursorSourceTimestamp(cursor) >= targetTimestamp - 1e-6) break;
      cursor.next();
    }
    cursor.show();
    cursor.update();
    styleCursor(cursor.cursorElement);
  }

  function cursorSourceTimestamp(cursor: OsmdCursor): number {
    return (
      cursor.Iterator?.CurrentSourceTimestamp?.RealValue ??
      cursor.Iterator?.currentTimeStamp?.RealValue ??
      0
    );
  }

  function styleCursor(cursorElement: HTMLElement | undefined): void {
    if (!cursorElement) return;
    cursorElement.dataset.osmdCursor = "follow-line";
    cursorElement.style.zIndex = "20";
    cursorElement.style.pointerEvents = "none";
    cursorElement.style.filter = "drop-shadow(0 0 3px rgba(124, 58, 237, 0.75))";
  }

  function buildSelectionRegions(
    osmd: OsmdSelectionSource,
    map: ScoreSelectionMap | undefined,
    snapMode: LoopSnap,
  ): SelectionRegion[] {
    if (!map) return [];
    const boundaries =
      snapMode === "measure" ? map.measureBoundaries : map.noteGroupBoundaries;
    if (boundaries.length < 2) return [];

    return boundaries.slice(0, -1).flatMap((boundary, index) => {
      const next = boundaries[index + 1]!;
      if (snapMode === "note-group") {
        return noteGroupRegions(osmd, map, boundary, next, index);
      }
      return measureBoxes(osmd, boundary).map((box, boxIndex) => ({
        id: `${snapMode}:${boundary.id}:${boxIndex}`,
        kind: snapMode,
        startBeat: boundary.beat,
        endBeat: next.beat,
        ...boxRegion(box, index),
      }));
    });
  }

  function measureBoxes(
    osmd: OsmdSelectionSource,
    boundary: ScoreSelectionBoundary,
  ): GraphicalBox[] {
    return (osmd.GraphicSheet.MeasureList[boundary.measureIndex] ?? []).map(
      ({ PositionAndShape }) => PositionAndShape,
    );
  }

  function noteGroupRegions(
    osmd: OsmdSelectionSource,
    map: ScoreSelectionMap,
    boundary: ScoreSelectionBoundary,
    next: ScoreSelectionBoundary,
    fallbackIndex: number,
  ): SelectionRegion[] {
    const containers = osmd.GraphicSheet.VerticalGraphicalStaffEntryContainers;
    if (containers.length > 0) {
      const container = containers.reduce(
      (nearest, candidate) =>
        Math.abs(candidate.AbsoluteTimestamp.RealValue * 4 - boundary.beat) <
        Math.abs(nearest.AbsoluteTimestamp.RealValue * 4 - boundary.beat)
          ? candidate
          : nearest,
      );
      return container.StaffEntries.flatMap((entry, index) =>
        entry
          ? [
              {
                id: `note-group:${boundary.id}:${index}`,
                kind: "note-group" as const,
                startBeat: boundary.beat,
                endBeat: next.beat,
                ...boxRegion(entry.PositionAndShape, fallbackIndex),
              },
            ]
          : [],
      );
    }

    const measureStart =
      map.measureBoundaries[boundary.measureIndex]?.beat ?? boundary.beat;
    const measureEnd =
      map.measureBoundaries[boundary.measureIndex + 1]?.beat ?? next.beat;
    const measureDuration = Math.max(1e-6, measureEnd - measureStart);
    const startRatio = (boundary.beat - measureStart) / measureDuration;
    const endRatio = (next.beat - measureStart) / measureDuration;
    return measureBoxes(osmd, boundary).map((box, index) => {
      const region = boxRegion(box, fallbackIndex);
      return {
        id: `note-group:${boundary.id}:${index}`,
        kind: "note-group" as const,
        startBeat: boundary.beat,
        endBeat: next.beat,
        left: region.left + region.width * startRatio,
        top: region.top,
        width: Math.max(12, region.width * (endRatio - startRatio)),
        height: region.height,
      };
    });
  }

  function boxRegion(box: GraphicalBox, fallbackIndex: number) {
    const left = (box.AbsolutePosition.x + box.BorderLeft) * 10;
    const top = (box.AbsolutePosition.y + box.BorderTop) * 10;
    const width = Math.max(12, (box.BorderRight - box.BorderLeft) * 10);
    const height = Math.max(32, (box.BorderBottom - box.BorderTop) * 10);
    return {
      left: Number.isFinite(left) ? left : 12 + fallbackIndex * 24,
      top: Number.isFinite(top) ? top : 12,
      width,
      height,
    };
  }

  function collectHitTargets(
    container: HTMLDivElement,
    snapMode: LoopSnap,
  ): NotationHitTarget[] {
    const containerRect = container.getBoundingClientRect();
    return [
      ...container.querySelectorAll<HTMLElement>(
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
</script>

<div bind:this={wrapper} class="relative min-w-0 max-w-full">
  <div
    class="relative min-h-48 w-full min-w-0 max-w-full overflow-x-auto rounded-md border bg-background p-2 text-foreground [&_svg]:min-w-[320px] {selectionEnabled
      ? 'cursor-crosshair'
      : ''}"
    role={selectionEnabled ? "group" : "img"}
    aria-label="MusicXML score"
    aria-busy={status === "loading"}
    bind:this={host}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
  ></div>
  <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-md" aria-hidden="true">
    {#each selectionRegions as region (region.id)}
      <span
        data-selection-kind={region.kind}
        data-boundary-id={region.id}
        data-start-beat={region.startBeat}
        data-end-beat={region.endBeat}
        class="absolute"
        style:left="{region.left}px"
        style:top="{region.top}px"
        style:width="{region.width}px"
        style:height="{region.height}px"
      ></span>
    {/each}
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

{#if status === "loading"}
  <p class="text-sm text-muted-foreground" aria-live="polite">Rendering MusicXML.</p>
{:else if status === "error"}
  <p class="text-sm text-destructive" role="alert">{errorMessage}</p>
{/if}
