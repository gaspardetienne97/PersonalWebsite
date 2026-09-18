import type { LoopSnap, ScoreSelectionMap } from "@repo/music-core/engines/score-practice";

const PIXEL_EPSILON = 0.5;

export interface BeatRange {
  startBeat: number;
  endBeat: number;
}

export interface NotationRangeHighlight extends BeatRange {
  id: string;
  active?: boolean;
}

export interface NotationHitTarget extends BeatRange {
  boundaryId: string;
  beat: number;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export interface NotationSelectionProps {
  selectionMap?: ScoreSelectionMap;
  highlightedRanges?: NotationRangeHighlight[];
  customSelection?: BeatRange;
  snap?: LoopSnap;
  selectionEnabled?: boolean;
  onSelectionChange?: (range: BeatRange) => void;
}

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function nearestHit(
  point: { x: number; y: number },
  targets: NotationHitTarget[],
): NotationHitTarget | undefined {
  return [...targets].sort(
    (left, right) =>
      pointDistanceSquared(point, left.rect) - pointDistanceSquared(point, right.rect),
  )[0];
}

/**
 * The range spanned by two boundaries, in either order. Both hits landing on
 * the same boundary is a deliberate single-bar (or single note-group) range,
 * not a mistake: it is how a player loops one hard bar.
 */
export function rangeFromHits(start: NotationHitTarget, end: NotationHitTarget): BeatRange {
  return {
    startBeat: Math.min(start.startBeat, end.startBeat),
    endBeat: Math.max(start.endBeat, end.endBeat),
  };
}

export interface RangeHandle {
  edge: "start" | "end";
  left: number;
  top: number;
  height: number;
}

/**
 * Where the Start and End handles sit for a range: the left edge of its first
 * rectangle and the right edge of its last, so a range wrapping systems is
 * handled at the two ends the player reads it from.
 */
export function rangeHandles(range: BeatRange, targets: NotationHitTarget[]): RangeHandle[] {
  const rects = overlayRects(range, targets);
  const first = rects[0];
  const last = rects.at(-1);
  if (!first || !last) return [];
  return [
    { edge: "start", left: first.left, top: first.top, height: first.height },
    { edge: "end", left: last.left + last.width, top: last.top, height: last.height },
  ];
}

export function overlayRects(range: BeatRange, targets: NotationHitTarget[]): OverlayRect[] {
  const selected = targets
    .filter((target) => target.startBeat < range.endBeat && target.endBeat > range.startBeat)
    .map(({ rect }) => ({ ...rect }))
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const merged: Array<{ left: number; top: number; right: number; bottom: number }> = [];

  for (const rect of selected) {
    const current = merged.at(-1);
    if (current && sameRow(current, rect) && rect.left <= current.right + PIXEL_EPSILON) {
      current.right = Math.max(current.right, rect.right);
      current.bottom = Math.max(current.bottom, rect.bottom);
    } else {
      merged.push(rect);
    }
  }

  return merged.map(({ left, top, right, bottom }) => ({
    left,
    top,
    width: right - left,
    height: bottom - top,
  }));
}

function pointDistanceSquared(
  point: { x: number; y: number },
  rect: NotationHitTarget["rect"],
): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return dx * dx + dy * dy;
}

function sameRow(
  left: { top: number; bottom: number },
  right: { top: number; bottom: number },
): boolean {
  return (
    Math.abs(left.top - right.top) <= PIXEL_EPSILON &&
    Math.abs(left.bottom - right.bottom) <= PIXEL_EPSILON
  );
}
