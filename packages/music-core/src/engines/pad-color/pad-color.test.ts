import { describe, expect, test } from "vitest";

import {
  kitPadColors,
  mpcControllerInitSysex,
  mpcHeartbeatSysex,
  MPC_ONE_PLUS_PRODUCT_ID,
  MPC_PAD_COUNT,
  padColorSysex,
  padIndexForMidi,
  padLayoutSysex,
  padsOffSysex,
  padTestPalette,
} from "./index";

describe("padColorSysex (captured from MPC 3 ↔ MPC One+)", () => {
  test("emits the verified pad-color frame", () => {
    // F0 47 7F 56 65 00 04 [pad] [R] [G] [B] F7 — pad 0, "fire" = 3F 00 00.
    expect(padColorSysex(0, { r: 0x3f, g: 0, b: 0 })).toEqual([
      0xf0, 0x47, 0x7f, 0x56, 0x65, 0x00, 0x04, 0x00, 0x3f, 0x00, 0x00, 0xf7,
    ]);
    expect(MPC_ONE_PLUS_PRODUCT_ID).toBe(0x56);
  });

  test("masks pad index to 0-15 and clamps RGB to 7-bit", () => {
    const f = padColorSysex(20, { r: 999, g: -5, b: 63.6 });
    expect(f[7]).toBe(20 & 0x0f); // 4
    expect(f[8]).toBe(127);
    expect(f[9]).toBe(0);
    expect(f[10]).toBe(64); // rounded
  });

  test("named MPC swatches decode as 7-bit RGB", () => {
    expect(padColorSysex(0, { r: 0x04, g: 0x3f, b: 0 }).slice(8, 11)).toEqual([0x04, 0x3f, 0x00]); // lime
    expect(padColorSysex(0, { r: 0, g: 0x08, b: 0x3f }).slice(8, 11)).toEqual([0x00, 0x08, 0x3f]); // midnight
    expect(padColorSysex(0, { r: 0x3f, g: 0x22, b: 0 }).slice(8, 11)).toEqual([0x3f, 0x22, 0x00]); // apricot
  });

  test("product id is overridable for other MPC models", () => {
    expect(padColorSysex(0, { r: 0, g: 0, b: 0 }, { productId: 0x46 })[3]).toBe(0x46);
  });
});

test("heartbeat matches the captured keep-alive frame", () => {
  expect(mpcHeartbeatSysex()).toEqual([
    0xf0, 0x47, 0x00, 0x56, 0x52, 0x00, 0x04, 0x41, 0x67, 0x16, 0x00, 0xf7,
  ]);
});

test("controller init replays the captured connect handshake", () => {
  const init = mpcControllerInitSysex();
  expect(init[0]).toEqual([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]); // identity request
  expect(init[1]).toEqual(mpcHeartbeatSysex()); // session hello
  expect(init[2]).toEqual([0xf0, 0x47, 0x7f, 0x56, 0x62, 0x00, 0x01, 0x61, 0xf7]); // enter mode
  expect(init.at(-1)).toEqual([0xf0, 0x47, 0x7f, 0x56, 0x41, 0x00, 0x00, 0xf7]); // cmd 41, 0 bytes
  // Every frame is well-formed SysEx.
  expect(init.every((f) => f[0] === 0xf0 && f.at(-1) === 0xf7)).toBe(true);
});

test("layout helpers produce one frame per pad", () => {
  expect(padLayoutSysex([]).length).toBe(MPC_PAD_COUNT);
  const off = padsOffSysex();
  expect(off).toHaveLength(MPC_PAD_COUNT);
  expect(off[0]!.slice(8, 11)).toEqual([0, 0, 0]); // black
});

test("padTestPalette gives 16 distinct colours", () => {
  const palette = padTestPalette();
  expect(palette).toHaveLength(MPC_PAD_COUNT);
  expect(new Set(palette.map((c) => `${c.r},${c.g},${c.b}`)).size).toBe(MPC_PAD_COUNT);
});

test("kitPadColors lights assigned pads and dims the rest", () => {
  const colors = kitPadColors([0, 2]);
  expect(colors[0]).toEqual({ r: 0, g: 110, b: 60 });
  expect(colors[1]).toEqual({ r: 12, g: 12, b: 20 });
  expect(colors[2]).toEqual({ r: 0, g: 110, b: 60 });
});

test("padIndexForMidi maps Bank A note 36-51 to 0-15", () => {
  expect(padIndexForMidi(36)).toBe(0);
  expect(padIndexForMidi(51)).toBe(15);
});
