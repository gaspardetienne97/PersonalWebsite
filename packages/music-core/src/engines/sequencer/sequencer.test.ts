import { describe, expect, test } from "vitest";

import { BOOM_BAP_KIT, StepSequencer } from "./index";

describe("StepSequencer", () => {
  test("toggles cells and reports active pads at a step", () => {
    const seq = new StepSequencer(BOOM_BAP_KIT, 16);
    expect(seq.steps).toBe(16);
    expect(seq.isOn(0, 0)).toBe(false);

    seq.toggle(0, 0); // kick on step 0
    seq.toggle(2, 0); // hats on step 0
    expect(seq.isOn(0, 0)).toBe(true);
    expect(
      seq
        .padsAt(0)
        .map((pad) => pad.id)
        .sort(),
    ).toEqual(["hats", "kick"]);
    expect(seq.padsAt(1)).toEqual([]);
  });

  test("toggling twice clears the cell", () => {
    const seq = new StepSequencer(BOOM_BAP_KIT, 16);
    seq.toggle(1, 4);
    seq.toggle(1, 4);
    expect(seq.isOn(1, 4)).toBe(false);
  });

  test("clear empties the whole grid", () => {
    const seq = new StepSequencer(BOOM_BAP_KIT, 16);
    seq.toggle(0, 0);
    seq.toggle(3, 8);
    seq.clear();
    for (let step = 0; step < seq.steps; step += 1) {
      expect(seq.padsAt(step)).toEqual([]);
    }
  });

  test("rowPattern returns the boolean row", () => {
    const seq = new StepSequencer(BOOM_BAP_KIT, 8);
    seq.toggle(0, 0);
    seq.toggle(0, 4);
    expect(seq.rowPattern(0)).toEqual([true, false, false, false, true, false, false, false]);
  });
});
