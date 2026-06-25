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

export function rangeFromHits(
  start: NotationHitTarget,
  end: NotationHitTarget,
): BeatRange | undefined {
  if (start.boundaryId === end.boundaryId) return undefined;
  const startBeat = Math.min(start.startBeat, end.startBeat);
  const endBeat = Math.max(start.endBeat, end.endBeat);
  return endBeat > startBeat ? { startBeat, endBeat } : undefined;
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
