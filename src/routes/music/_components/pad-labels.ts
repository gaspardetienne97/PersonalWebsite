/**
 * Pad-numbering helpers for the MPC-style 4x4 layout: the hardware pad index
 * (A01 bottom-left … A16 top-right, as on the physical unit) for a MIDI
 * note. Extracted out of `MpcPadGrid.svelte` (bank A only, single instance)
 * so the sample-kit builder (`SampleKitPanel.svelte`, banks A-D) computes the
 * same "A05"-style pad label from the same logic instead of a second,
 * independently maintained implementation that could silently diverge.
 */

/** One bank's 16 pads in MPC visual (grid) row order: top row is the highest notes. */
export type PadLayout = readonly (readonly number[])[];

/**
 * Chunks an ascending, 16-note bank into MPC visual pad rows: groups of 4,
 * highest-note group first, so the last row (lowest notes) renders at the
 * bottom of a normal-flow grid — pad 1 bottom-left, as on the hardware.
 */
export function padLayoutFor(midiNotes: readonly number[]): PadLayout {
  const rows: number[][] = [];
  for (let i = 0; i < midiNotes.length; i += 4) rows.push(midiNotes.slice(i, i + 4));
  return rows.reverse();
}

/** Pad index on the hardware (A01 bottom-left … A16 top-right) for `midi` in `layout`. */
export function padNumber(midi: number, layout: PadLayout): number {
  const row = layout.findIndex((pads) => pads.includes(midi));
  if (row < 0) return 0;
  return (layout.length - 1 - row) * 4 + layout[row]!.indexOf(midi) + 1;
}
