/**
 * Akai MPC One+ controller-mode pad-LED protocol.
 *
 * Reverse-engineered by tracing the MPC 3 desktop app's CoreMIDI output while
 * changing pad colors (docs/tools/run-mpc-usb-trace.sh). Every frame below is a
 * literal capture, not a guess.
 *
 * Pad color:   F0 47 7F 56 65 00 04 [pad] [R] [G] [B] F7   (RGB 7-bit, 0-127)
 * Heartbeat:   F0 47 00 56 52 00 04 41 67 16 00 F7         (MPC 3 repeats ~1/sec)
 * Enter mode:  F0 47 7F 56 62 00 01 61 F7
 *
 * Framing: F0, Akai id 47, target (00=device / 7F=all-call), product 56 (One+),
 * command, 2-byte big-endian length, payload, F7.
 *
 * The init handshake (mpcControllerInitSysex) is the exact sequence MPC 3 sends
 * on connect. Whether the LEDs need all of it — or just controller mode set on
 * the hardware plus color frames — is a hardware question; send what's needed.
 */

export const AKAI_MANUFACTURER_ID = 0x47;
export const MPC_ALL_CALL = 0x7f;
export const MPC_DEVICE_ID = 0x00;
export const MPC_ONE_PLUS_PRODUCT_ID = 0x56;
export const MPC_PAD_COUNT = 16;

const CMD_SET_PAD_COLOR = 0x65;
const CMD_SESSION = 0x52;

export interface PadRgb {
  r: number;
  g: number;
  b: number;
}

export interface MpcPadOptions {
  /** Override the product id (calibration knob for other MPC models). */
  productId?: number;
}

const BLACK: PadRgb = { r: 0, g: 0, b: 0 };

function clamp7bit(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function frame(target: number, productId: number, command: number, payload: number[]): number[] {
  return [
    0xf0,
    AKAI_MANUFACTURER_ID,
    target,
    productId,
    command,
    (payload.length >> 7) & 0x7f,
    payload.length & 0x7f,
    ...payload,
    0xf7,
  ];
}

/** Set one pad (0-15) to an RGB color. Captured, verified on MPC One+. */
export function padColorSysex(
  padIndex: number,
  color: PadRgb,
  options: MpcPadOptions = {},
): number[] {
  return frame(MPC_ALL_CALL, options.productId ?? MPC_ONE_PLUS_PRODUCT_ID, CMD_SET_PAD_COLOR, [
    padIndex & 0x0f,
    clamp7bit(color.r),
    clamp7bit(color.g),
    clamp7bit(color.b),
  ]);
}

export function padLayoutSysex(colors: PadRgb[], options: MpcPadOptions = {}): number[][] {
  return Array.from({ length: MPC_PAD_COUNT }, (_, pad) =>
    padColorSysex(pad, colors[pad] ?? BLACK, options),
  );
}

export function padsOffSysex(options: MpcPadOptions = {}): number[][] {
  return padLayoutSysex(
    Array.from({ length: MPC_PAD_COUNT }, () => BLACK),
    options,
  );
}

/**
 * Keep-alive MPC 3 repeats ~once per second to hold controller mode. The 4-byte
 * payload is opaque (captured literal); send periodically if the device drops
 * out of controller mode without it.
 */
export function mpcHeartbeatSysex(options: MpcPadOptions = {}): number[] {
  return frame(
    MPC_DEVICE_ID,
    options.productId ?? MPC_ONE_PLUS_PRODUCT_ID,
    CMD_SESSION,
    [0x41, 0x67, 0x16, 0x00],
  );
}

/**
 * Exact connect handshake captured from MPC 3 before it drives pad LEDs. These
 * are opaque device frames replayed verbatim; only the product id is swapped.
 * ponytail: literal capture — minimal subset is a hardware question, replay all.
 */
export function mpcControllerInitSysex(options: MpcPadOptions = {}): number[][] {
  const product = options.productId ?? MPC_ONE_PLUS_PRODUCT_ID;
  const identityRequest = [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7];
  return [
    identityRequest,
    mpcHeartbeatSysex(options),
    frame(MPC_ALL_CALL, product, 0x62, [0x61]),
    frame(MPC_ALL_CALL, product, 0x64, [0x00, 0x01, 0x01]),
    frame(MPC_ALL_CALL, product, 0x64, [0x01, 0x01, 0x01]),
    frame(MPC_ALL_CALL, product, 0x64, [0x02, 0x00, 0x00]),
    frame(MPC_ALL_CALL, product, 0x64, [0x03, 0x00, 0x00]),
    frame(MPC_ALL_CALL, product, 0x63, [0x00, 0x00, 0x00]),
    frame(MPC_ALL_CALL, product, 0x63, [0x01, 0x00, 0x00]),
    frame(MPC_ALL_CALL, product, 0x41, []),
  ];
}

/** A hue sweep for reading pad-index order off physical hardware. */
export function padTestPalette(): PadRgb[] {
  return Array.from({ length: MPC_PAD_COUNT }, (_, index) =>
    hsvToRgb127(index / MPC_PAD_COUNT, 1, 1),
  );
}

/** Assigned sample pads glow green; empty app pads stay dim. */
export function kitPadColors(assignedPadIndexes: Iterable<number>): PadRgb[] {
  const assigned = new Set(assignedPadIndexes);
  const lit: PadRgb = { r: 0, g: 110, b: 60 };
  const dim: PadRgb = { r: 12, g: 12, b: 20 };
  return Array.from({ length: MPC_PAD_COUNT }, (_, pad) => (assigned.has(pad) ? lit : dim));
}

/** Standalone Bank A MIDI note 36-51 to app pad index 0-15. */
export function padIndexForMidi(midiNote: number): number {
  return midiNote - 36;
}

function hsvToRgb127(h: number, s: number, v: number): PadRgb {
  const sector = Math.floor(h * 6);
  const fraction = h * 6 - sector;
  const p = v * (1 - s);
  const q = v * (1 - fraction * s);
  const t = v * (1 - (1 - fraction) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][sector % 6]!;
  return { r: clamp7bit(r * 127), g: clamp7bit(g * 127), b: clamp7bit(b * 127) };
}
