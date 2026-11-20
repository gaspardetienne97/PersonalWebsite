// Range selection and overlay geometry shared by Staff and Tab: the same
// targets, taps, drags, readout and cursor in both views.

import { beatToMs, type BeatRange } from "./groups";
import type { Layout } from "./engrave";
import { m } from "@repo/i18n/messages.js";

export type Snap = "bar" | "group";

/** A tappable region over the engraving: a whole bar, or one note group. */
export interface Target extends BeatRange {
  bar: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

const EPS = 1e-6;

export function targets(layout: Layout, snap: Snap): Target[] {
  if (snap === "bar")
    return layout.bars.map((c) => ({ ...c, label: m.music_shell_lesson_bar({ bar: c.bar }) }));
  const out: Target[] = [];
  const attacks = layout.anchors.filter(
    (a, i, all) => a.group !== null && all.findIndex((b) => b.group === a.group) === i,
  );
  attacks.forEach((a, i) => {
    const cell = layout.bars.find(
      (c) => c.system === a.system && a.beat >= c.startBeat - EPS && a.beat < c.endBeat - EPS,
    );
    if (!cell) return;
    const next = attacks[i + 1];
    const lastInSystem = layout.bars.filter((c) => c.system === a.system).at(-1)!;
    const x = a.x - 10;
    const right =
      next && next.system === a.system ? next.x - 10 : lastInSystem.x + lastInSystem.width;
    const group = layout.groups[a.group!];
    const nth = out.filter((t) => t.bar === cell.bar).length + 1;
    out.push({
      startBeat: a.beat,
      endBeat: next ? next.beat : a.beat + group.durationBeats,
      bar: cell.bar,
      x,
      y: cell.y,
      width: Math.max(12, right - x),
      height: cell.height,
      label: m.music_shell_nt_bar_note({ bar: cell.bar, n: nth }),
    });
  });
  return out;
}

export const inRange = (t: BeatRange, r: BeatRange) =>
  t.startBeat < r.endBeat - EPS && t.endBeat > r.startBeat + EPS;

export function targetAt(list: Target[], x: number, y: number) {
  return list.find((t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height);
}

/** Two taps make a range; the first is kept as `pending` so its Start handle shows at once. */
export class RangePicker {
  pending = $state<Target | null>(null);
  drag = $state<BeatRange | null>(null);

  tap(t: Target): BeatRange | null {
    const a = this.pending;
    if (!a) {
      this.pending = t;
      return null;
    }
    this.pending = null;
    return {
      startBeat: Math.min(a.startBeat, t.startBeat),
      endBeat: Math.max(a.endBeat, t.endBeat),
    };
  }

  /** Moving one handle onto `t`; passing the other end pushes it along. */
  dragTo(which: "start" | "end", t: Target, sel: BeatRange) {
    this.drag =
      which === "start"
        ? { startBeat: t.startBeat, endBeat: Math.max(sel.endBeat, t.endBeat) }
        : { startBeat: Math.min(sel.startBeat, t.startBeat), endBeat: t.endBeat };
  }
}

export function ends(list: Target[], r: BeatRange) {
  const hit = list.filter((t) => inRange(t, r));
  return hit.length ? { start: hit[0], end: hit[hit.length - 1], count: hit.length } : null;
}

export function readout(
  list: Target[],
  sel: BeatRange | null,
  pending: Target | null,
  bpm: number,
  snap: Snap,
): string {
  const bars = snap === "bar";
  if (pending)
    return (bars ? m.music_shell_nt_pending_bar : m.music_shell_nt_pending_note)({
      bar: pending.bar,
    });
  const e = sel && ends(list, sel);
  if (!sel || !e) return bars ? m.music_shell_nt_tap_bar() : m.music_shell_nt_tap_note();
  const secs = Math.round(beatToMs(sel.endBeat - sel.startBeat, bpm) / 1000);
  return (bars ? m.music_shell_nt_range_bars : m.music_shell_nt_range_notes)({
    start: e.start.bar,
    end: e.end.bar,
    count: e.count,
    secs,
    bpm: Math.round(bpm),
  });
}

/** Where the single cursor stands for `beat`: interpolated between drawn onsets. */
export function cursorAt(layout: Layout, beat: number) {
  const last = layout.bars.at(-1);
  const cell =
    layout.bars.find((c) => beat >= c.startBeat - EPS && beat < c.endBeat - EPS) ??
    (last && Math.abs(beat - last.endBeat) < EPS ? last : undefined);
  if (!cell) return null;
  const inBar = layout.anchors.filter(
    (a) =>
      a.system === cell.system && a.beat >= cell.startBeat - EPS && a.beat < cell.endBeat - EPS,
  );
  const a0 = inBar.findLast((a) => a.beat <= beat + EPS);
  const a1 = inBar.find((a) => a.beat > beat + EPS);
  const [x0, b0] = a0 ? [a0.x, a0.beat] : [cell.x + 12, cell.startBeat];
  const [x1, b1] = a1 ? [a1.x, a1.beat] : [cell.x + cell.width - 6, cell.endBeat];
  const x = b1 - b0 > EPS ? x0 + ((x1 - x0) * (beat - b0)) / (b1 - b0) : x0;
  return {
    x,
    top: cell.top - 10,
    bottom: cell.bottom + 10,
    bar: cell.bar,
    beatInBar: beat - cell.startBeat,
  };
}
