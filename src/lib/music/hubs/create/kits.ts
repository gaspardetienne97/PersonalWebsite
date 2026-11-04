// Sample kits as stored in the setting `music.sample-kits` (a list of kits).
// Pure: the page reads and writes OPFS and Dexie; this decides where samples
// go, what the audio runtime plays and what the MPC export receives.
import {
  autoMapNote,
  autoMapSamples,
  BANKS,
  safeName,
  VELOCITY_SPLIT,
  type Bank,
  type KitPad as ExportPad,
  type SampleKit as ExportKit,
} from "@repo/music-core/io/mpc-kit";
import type { SampleKit as RuntimeKit } from "$lib/music/runtime/audio.svelte";

export const KITS_KEY = "music.sample-kits";

export interface StoredSample {
  id: string;
  /** The imported file name; its extension is what the MPC export keeps. */
  fileName: string;
  /** Display name, renameable. */
  name: string;
  /** OPFS key: music.sample-kits/<kitId>/<sampleId>-<safeFileName>. */
  path: string;
  size: number;
}
export interface StoredPad {
  note: number;
  /** Sample id for the soft layer (and for every hit when there is no hard layer). */
  soft?: string;
  /** Sample id for velocities 0.64..1. */
  hard?: string;
  /** MPC mute group 1..16. */
  chokeGroup?: number;
}
export interface StoredKit {
  id: string;
  name: string;
  samples: StoredSample[];
  pads: StoredPad[];
  createdAt: number;
  updatedAt: number;
}

export const BANK_IDS = Object.keys(BANKS) as Bank[];
export const bankNotes = (bank: Bank) => Array.from({ length: 16 }, (_, i) => BANKS[bank][0] + i);
/** "B03" for note 54. */
export function padLabel(note: number): string {
  const bank = BANK_IDS.find((b) => note >= BANKS[b][0] && note <= BANKS[b][1]) ?? "A";
  return `${bank}${String(note - BANKS[bank][0] + 1).padStart(2, "0")}`;
}

/**
 * What a pad plays with no sample on it: the built-in drum the audio runtime
 * synthesises for that note (its drumHit cases). The starter kit every pad has.
 */
export const BUILT_IN_DRUM: Record<number, string> = {
  35: "808",
  36: "Kick",
  37: "Rim",
  38: "Snare",
  39: "Clap",
  40: "Snare 2",
  41: "Low tom",
  42: "Hats",
  43: "Floor tom",
  44: "Pedal hat",
  45: "Mid tom",
  46: "Open hat",
  47: "Cowbell",
  48: "High tom",
  49: "Crash",
  50: "Top tom",
  51: "Ride",
};

export function samplePath(kitId: string, sampleId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  return `${KITS_KEY}/${kitId}/${sampleId}-${safeName(stem, "sample")}${ext}`;
}

export function newKit(name: string, id: string, now: number): StoredKit {
  return { id, name, samples: [], pads: [], createdAt: now, updatedAt: now };
}

const occupied = (kit: StoredKit) =>
  new Set(kit.pads.filter((p) => p.soft || p.hard).map((p) => p.note));

/**
 * Pads for newly imported files: the filename suggestion (autoMapSamples) when
 * that pad is free, else the next free pad from `from` onwards through bank D.
 * Null when every pad is taken.
 */
export function placeSamples(
  kit: StoredKit,
  fileNames: string[],
  from: number = BANKS.A[0],
): (number | null)[] {
  const used = occupied(kit);
  const suggested = autoMapSamples(fileNames);
  const nextFree = () => {
    for (let n = from; n <= BANKS.D[1]; n++) if (!used.has(n)) return n;
    for (let n = BANKS.A[0]; n < from; n++) if (!used.has(n)) return n;
    return null;
  };
  return fileNames.map((name, i) => {
    const s = suggested[i];
    // A recognised name ("Kick_01") keeps its pad when that pad is free; the
    // rest fill the next free pad of the bank on screen.
    const wanted = autoMapNote(name) !== null && s !== null && !used.has(s) ? s : nextFree();
    if (wanted !== null) used.add(wanted);
    return wanted;
  });
}

export function setPad(kit: StoredKit, note: number, patch: Partial<StoredPad>): StoredKit {
  const cur = kit.pads.find((p) => p.note === note) ?? { note };
  const next = { ...cur, ...patch };
  for (const k of ["soft", "hard", "chokeGroup"] as const)
    if (next[k] === undefined || next[k] === "" || next[k] === 0) delete next[k];
  const pads = kit.pads.filter((p) => p.note !== note);
  if (next.soft || next.hard || next.chokeGroup) pads.push(next);
  return { ...kit, pads: pads.sort((a, b) => a.note - b.note) };
}

/** Removes the sample and every pad layer that pointed at it. */
export function removeSample(kit: StoredKit, sampleId: string): StoredKit {
  let next: StoredKit = { ...kit, samples: kit.samples.filter((s) => s.id !== sampleId) };
  for (const p of kit.pads)
    if (p.soft === sampleId || p.hard === sampleId)
      next = setPad(next, p.note, {
        soft: p.soft === sampleId ? undefined : p.soft,
        hard: p.hard === sampleId ? undefined : p.hard,
      });
  return next;
}

/** A pad's layers: a lone hard sample also covers soft hits, like the audio runtime. */
export function padLayers(
  pad: StoredPad,
): { sampleId: string; velStart: number; velEnd: number }[] {
  if (pad.soft && pad.hard && pad.soft !== pad.hard)
    return [
      { sampleId: pad.soft, velStart: VELOCITY_SPLIT.soft[0], velEnd: VELOCITY_SPLIT.soft[1] },
      { sampleId: pad.hard, velStart: VELOCITY_SPLIT.hard[0], velEnd: VELOCITY_SPLIT.hard[1] },
    ];
  const only = pad.soft ?? pad.hard;
  return only ? [{ sampleId: only, velStart: 0, velEnd: 1 }] : [];
}

export function toExportKit(kit: StoredKit): ExportKit {
  const name = (id?: string) => kit.samples.find((s) => s.id === id)?.name;
  const pads: ExportPad[] = kit.pads
    .map((p) => ({
      note: p.note,
      name: name(p.soft ?? p.hard),
      layers: padLayers(p),
      chokeGroup: p.chokeGroup,
    }))
    .filter((p) => p.layers.length);
  return { name: kit.name, pads };
}

export function toRuntimeKit(kit: StoredKit): RuntimeKit {
  const path = (id?: string) => kit.samples.find((s) => s.id === id)?.path;
  return {
    id: kit.id,
    name: kit.name,
    pads: kit.pads
      .filter((p) => p.soft || p.hard)
      .map((p) => ({
        midi: p.note,
        soft: path(p.soft),
        hard: path(p.hard),
        chokeGroup: p.chokeGroup,
      })),
  };
}

export const sampleName = (kit: StoredKit, id?: string) =>
  kit.samples.find((s) => s.id === id)?.name;
