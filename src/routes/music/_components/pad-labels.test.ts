import { describe, expect, test } from "vitest";

import { padLayoutFor, padNumber } from "./pad-labels";

describe("padLayoutFor", () => {
  test("chunks an ascending bank into rows of 4, highest row first", () => {
    const layout = padLayoutFor([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(layout).toEqual([
      [48, 49, 50, 51],
      [44, 45, 46, 47],
      [40, 41, 42, 43],
      [36, 37, 38, 39],
    ]);
  });
});

describe("padNumber", () => {
  const bankA = padLayoutFor([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
  const bankB = padLayoutFor([52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]);

  test("numbers pad 1 bottom-left and pad 16 top-right for bank A", () => {
    expect(padNumber(36, bankA)).toBe(1);
    expect(padNumber(39, bankA)).toBe(4);
    expect(padNumber(40, bankA)).toBe(5);
    expect(padNumber(51, bankA)).toBe(16);
  });

  test("uses the same 1-based, bottom-left-first numbering for any bank", () => {
    expect(padNumber(52, bankB)).toBe(1);
    expect(padNumber(67, bankB)).toBe(16);
  });

  test("returns 0 for a note outside the given layout", () => {
    expect(padNumber(52, bankA)).toBe(0);
  });
});
