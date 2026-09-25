// Akai MPC One+ Controller Mode frames: literal captures (hardware notes 1).
// Do not change these bytes without re-testing on the hardware.

export const AKAI = 0x47;
export const MPC_ONE_PLUS = 0x56;

export function akaiFrame(
  command: number,
  payload: number[],
  target = 0x7f,
  product = MPC_ONE_PLUS,
): number[] {
  const len = payload.length;
  return [0xf0, AKAI, target, product, command, (len >> 7) & 0x7f, len & 0x7f, ...payload, 0xf7];
}

export const heartbeatFrame = (product = MPC_ONE_PLUS) =>
  akaiFrame(0x52, [0x41, 0x67, 0x16, 0x00], 0x00, product);

/** Full connect handshake, in the order MPC 3 sends it. Replay all of it. */
export function initFrames(product = MPC_ONE_PLUS): number[][] {
  return [
    [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7],
    heartbeatFrame(product),
    akaiFrame(0x62, [0x61], 0x7f, product),
    akaiFrame(0x64, [0x00, 0x01, 0x01], 0x7f, product),
    akaiFrame(0x64, [0x01, 0x01, 0x01], 0x7f, product),
    akaiFrame(0x64, [0x02, 0x00, 0x00], 0x7f, product),
    akaiFrame(0x64, [0x03, 0x00, 0x00], 0x7f, product),
    akaiFrame(0x63, [0x00, 0x00, 0x00], 0x7f, product),
    akaiFrame(0x63, [0x01, 0x00, 0x00], 0x7f, product),
    akaiFrame(0x41, [], 0x7f, product),
  ];
}

export const HEARTBEAT_MS = 1000;

const c7 = (v: number) => Math.max(0, Math.min(127, Math.round(v)));

/** Set pad colour. pad 0..15 in bank A order, RGB 0..127. */
export const padColorFrame = (
  pad: number,
  r: number,
  g: number,
  b: number,
  product = MPC_ONE_PLUS,
) => akaiFrame(0x65, [pad & 0x0f, c7(r), c7(g), c7(b)], 0x7f, product);

export const allPadsOffFrames = (product = MPC_ONE_PLUS) =>
  Array.from({ length: 16 }, (_, pad) => padColorFrame(pad, 0, 0, 0, product));

/** HSV hue sweep across the 16 pads: the fastest way to read pad order off the unit. */
export function rainbowFrames(product = MPC_ONE_PLUS): number[][] {
  return Array.from({ length: 16 }, (_, pad) => {
    const [r, g, b] = hsvToRgb(pad / 16, 1, 1);
    return padColorFrame(pad, r * 127, g * 127, b * 127, product);
  });
}

export const PAD_COLORS = {
  assigned: { r: 0, g: 110, b: 60 },
  empty: { r: 12, g: 12, b: 20 },
  fire: { r: 0x3f, g: 0, b: 0 },
} as const;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  return (
    [
      [v, t, p],
      [q, v, p],
      [p, v, t],
      [p, q, v],
      [t, p, v],
      [v, p, q],
    ] as const
  )[i % 6] as [number, number, number];
}
