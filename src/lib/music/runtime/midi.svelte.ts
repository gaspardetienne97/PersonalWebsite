// Web MIDI for the whole app (hardware notes 1, 3, 5). The MPC controller link
// lives here, not on a page: whenever MIDI is on, SysEx is granted and a profile
// is flagged `controllerLink`, that output gets the init handshake once and a
// heartbeat every second until MIDI is disabled or the link is dropped.
import { browser } from "$app/env";
import { parseMidiMessage, isSysex, toHex } from "@repo/music-core/io/midi-message";
import {
  applyProfile,
  detectInstrument,
  pickMpcOutput,
  sanitizeProfile,
} from "@repo/music-core/io/devices";
import {
  allPadsOffFrames,
  heartbeatFrame,
  HEARTBEAT_MS,
  initFrames,
  padColorFrame,
  rainbowFrames,
} from "@repo/music-core/io/mpc-sysex";
import type { DeviceProfile } from "@repo/music-core";
import { getSetting, putSetting } from "./db.svelte";
import { settings } from "./settings.svelte";
import { input } from "./input.svelte";

export interface PortInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}
export interface RawMidiEntry {
  portId: string;
  port: string;
  hex: string;
  at: number;
}
export interface RawMidiMessage {
  portId: string;
  port: string;
  data: Uint8Array;
  at: number;
}
export type MpcLinkState = "off" | "no-sysex" | "no-output" | "linked";

const PROFILES_KEY = "music.device-profiles";
const LOG_SIZE = 40;

let access: MIDIAccess | null = null;
let enabled = $state(false);
let sysexEnabled = $state(false);
let error = $state("");
let inputs = $state.raw<PortInfo[]>([]);
let outputs = $state.raw<PortInfo[]>([]);
let rawLog = $state.raw<RawMidiEntry[]>([]);
let lastInboundSysex = $state("");
let lastOutboundFrame = $state("");
let profiles = $state.raw<DeviceProfile[]>([]);
let mpcLink = $state.raw<{ state: MpcLinkState; outputId?: string }>({ state: "off" });

const rawListeners = new Set<(m: RawMidiMessage) => void>();
let heartbeat: ReturnType<typeof setInterval> | undefined;
let heartbeatOutput: string | undefined;
let learner:
  | {
      deviceId: string;
      notes: number[];
      onProgress?: (notes: number[]) => void;
      done: (n: number[]) => void;
    }
  | undefined;

const supported = () =>
  browser && typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
const info = (p: MIDIPort): PortInfo => ({
  id: p.id,
  name: p.name ?? "",
  manufacturer: p.manufacturer ?? "",
  state: p.state,
});

const profilesReady: Promise<void> = browser
  ? getSetting<unknown[]>(PROFILES_KEY, [])
      .then((list) =>
        setProfiles((Array.isArray(list) ? list : []).map(sanitizeProfile).filter((p) => !!p)),
      )
      .catch((e) => console.error("Woodshed: could not read device profiles", e))
  : Promise.resolve();

function setProfiles(next: DeviceProfile[]) {
  // Per-device latency offsets reach the router through calibration.svelte.ts.
  profiles = next;
}

function persistProfiles() {
  return putSetting(PROFILES_KEY, profiles).catch((e) => {
    error = `Device settings didn't save: ${(e as Error).message}`;
  });
}

function onMessage(port: MIDIInput, e: MIDIMessageEvent) {
  const data = e.data;
  if (!data || !data.length) return;
  const at = e.timeStamp || performance.now();
  const name = port.name ?? port.id;
  rawLog = [{ portId: port.id, port: name, hex: toHex(data), at }, ...rawLog].slice(0, LOG_SIZE);
  for (const l of rawListeners) l({ portId: port.id, port: name, data, at });
  if (isSysex(data)) {
    lastInboundSysex = toHex(data);
    return;
  }
  const parsed = parseMidiMessage(data, at, port.id);
  if (!parsed) return;
  // Learn captures hardware notes before any pad-map rewrite.
  if (
    learner &&
    learner.deviceId === port.id &&
    parsed.kind === "noteon" &&
    !learner.notes.includes(parsed.midi)
  ) {
    learner.notes.push(parsed.midi);
    learner.onProgress?.([...learner.notes]);
    if (learner.notes.length === 16) learner.done([...learner.notes]);
  }
  const profile = profiles.find((p) => p.id === port.id);
  const event = applyProfile(parsed, profile);
  if (!event) return; // ignored port or wrong channel: raw listeners already saw it
  event.instrument ??= detectInstrument(port.name ?? "", port.manufacturer ?? "");
  input.router.push(event);
}

function rebind() {
  if (!access) return;
  for (const port of access.inputs.values()) port.onmidimessage = (e) => onMessage(port, e);
  inputs = [...access.inputs.values()].map(info);
  outputs = [...access.outputs.values()].map(info);
  syncLink();
}

function stopHeartbeat() {
  clearInterval(heartbeat);
  heartbeat = undefined;
  heartbeatOutput = undefined;
}

/** Bring the heartbeat in line with the current state. `force` replays the handshake. */
function syncLink(force = false) {
  const linked = profiles.find((p) => p.controllerLink);
  if (!enabled || !linked) {
    stopHeartbeat();
    mpcLink = { state: "off", outputId: linked?.id };
    return;
  }
  if (!sysexEnabled) {
    stopHeartbeat();
    mpcLink = { state: "no-sysex", outputId: linked.id };
    return;
  }
  if (!access?.outputs.get(linked.id)) {
    stopHeartbeat();
    mpcLink = { state: "no-output", outputId: linked.id };
    return;
  }
  if (force || heartbeatOutput !== linked.id) {
    stopHeartbeat();
    for (const frame of initFrames()) send(linked.id, frame);
    heartbeatOutput = linked.id;
    // ponytail: a page hidden for 5+ minutes gets Chrome's intensive timer
    // throttling (about once a minute); schedule with MIDIOutput.send timestamps if that bites.
    heartbeat = setInterval(() => send(linked.id, heartbeatFrame()), HEARTBEAT_MS);
  }
  mpcLink = { state: "linked", outputId: linked.id };
}

/** Refuses SysEx frames (F0...) when SysEx is not granted. Never throws. */
function send(outputId: string, bytes: number[] | Uint8Array): boolean {
  if (bytes[0] === 0xf0 && !sysexEnabled) return false;
  const out = access?.outputs.get(outputId);
  if (!out) return false;
  try {
    out.send(bytes);
    lastOutboundFrame = toHex(bytes);
    return true;
  } catch (e) {
    error = `Couldn't send to ${out.name ?? outputId}: ${(e as Error).message}`;
    return false;
  }
}

const target = (outputId?: string) => outputId ?? mpcLink.outputId ?? pickMpcOutput(outputs)?.id;

function sendAll(frames: number[][], outputId?: string) {
  const id = target(outputId);
  return !!id && frames.every((f) => send(id, f));
}

async function enable(): Promise<boolean> {
  if (!supported()) {
    error =
      "Web MIDI is unavailable in this browser. Use a Chromium browser, or the microphone and on-screen input.";
    return false;
  }
  await profilesReady;
  try {
    access = await navigator.requestMIDIAccess({ sysex: true });
    sysexEnabled = access.sysexEnabled !== false;
    error = "";
  } catch (first) {
    const reason = (first as Error).message || (first as Error).name || "denied";
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      sysexEnabled = false;
      error = `SysEx wasn't allowed (${reason}), so MPC pad lights and the controller link are off. Plain MIDI works.`;
    } catch (second) {
      enabled = false;
      error = `The browser refused MIDI access: ${(second as Error).message || reason}`;
      return false;
    }
  }
  enabled = true;
  access.onstatechange = rebind;
  rebind();
  if (!settings.value.midiEnabledBefore) settings.update({ midiEnabledBefore: true });
  return true;
}

function disable() {
  stopHeartbeat();
  if (access) {
    access.onstatechange = null;
    for (const port of access.inputs.values()) port.onmidimessage = null;
  }
  access = null;
  enabled = false;
  sysexEnabled = false;
  inputs = [];
  outputs = [];
  mpcLink = { state: "off", outputId: profiles.find((p) => p.controllerLink)?.id };
}

/** Call once from the app shell: re-opens MIDI when it was enabled in this browser before. */
async function init() {
  if (!supported() || enabled) return;
  await settings.ready;
  if (!settings.value.midiEnabledBefore) return;
  try {
    const status = await navigator.permissions?.query({ name: "midi" as PermissionName });
    if (status?.state === "denied") return;
  } catch {
    // Permissions API without a midi descriptor: just try.
  }
  await enable();
}

function saveProfile(p: DeviceProfile) {
  const clean = sanitizeProfile(p);
  if (!clean) return Promise.resolve();
  setProfiles([...profiles.filter((x) => x.id !== clean.id), clean]);
  syncLink();
  return persistProfiles();
}

function removeProfile(id: string) {
  setProfiles(profiles.filter((p) => p.id !== id));
  syncLink();
  return persistProfiles();
}

function linkMpc(outputId: string) {
  setProfiles(
    profiles
      .map((p) => (p.controllerLink && p.id !== outputId ? { ...p, controllerLink: undefined } : p))
      .filter((p) => p.id !== outputId)
      .concat({
        ...(profiles.find((p) => p.id === outputId) ?? { id: outputId }),
        controllerLink: true,
      }),
  );

  syncLink(true);
  return persistProfiles();
}

function unlinkMpc() {
  const id = heartbeatOutput ?? profiles.find((p) => p.controllerLink)?.id;
  if (id) sendAll(allPadsOffFrames(), id);
  stopHeartbeat();
  setProfiles(profiles.map((p) => (p.controllerLink ? { ...p, controllerLink: undefined } : p)));
  syncLink();
  return persistProfiles();
}

/** Capture the next 16 distinct note-ons from one input. `cancel` rejects with an AbortError. */
function learnPads(deviceId: string, onProgress?: (notes: number[]) => void) {
  let cancel = () => {};
  const promise = new Promise<number[]>((resolve, reject) => {
    const mine = {
      deviceId,
      notes: [] as number[],
      onProgress,
      done: (n: number[]) => {
        if (learner === mine) learner = undefined;
        resolve(n);
      },
    };
    learner = mine;
    cancel = () => {
      if (learner === mine) learner = undefined;
      reject(new DOMException("Pad learning cancelled", "AbortError"));
    };
  });
  return { promise, cancel };
}

export const midi = {
  get supported() {
    return supported();
  },
  get enabled() {
    return enabled;
  },
  get sysexEnabled() {
    return sysexEnabled;
  },
  get error() {
    return error;
  },
  get inputs() {
    return inputs;
  },
  get outputs() {
    return outputs;
  },
  /** Last 40 messages, newest first. Not a live region. */
  get rawLog() {
    return rawLog;
  },
  get lastInboundSysex() {
    return lastInboundSysex;
  },
  get lastOutboundFrame() {
    return lastOutboundFrame;
  },
  get profiles() {
    return profiles;
  },
  get mpcLink() {
    return mpcLink;
  },
  profile: (id: string) => profiles.find((p) => p.id === id),
  /** Every message from every port, ignored ones included (diagnostics). */
  subscribeRaw(fn: (m: RawMidiMessage) => void) {
    rawListeners.add(fn);
    return () => rawListeners.delete(fn);
  },
  enable,
  disable,
  init,
  saveProfile,
  removeProfile,
  linkMpc,
  unlinkMpc,
  send,
  /** Defaults to the linked output, else the best MPC guess. */
  lightPad: (pad: number, rgb: { r: number; g: number; b: number }, outputId?: string) =>
    sendAll([padColorFrame(pad, rgb.r, rgb.g, rgb.b)], outputId),
  rainbow: (outputId?: string) => sendAll(rainbowFrames(), outputId),
  allOff: (outputId?: string) => sendAll(allPadsOffFrames(), outputId),
  learnPads,
};
