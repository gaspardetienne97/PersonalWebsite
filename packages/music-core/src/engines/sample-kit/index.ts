/**
 * Sample kit model — framework-agnostic mapping of imported audio samples onto
 * an Akai MPC 4-bank, 64-pad layout (Banks A-D, MIDI 36-99). No browser,
 * Svelte, or Tone APIs here: validation, filename normalization, deterministic
 * auto-mapping, and pure assignment helpers. Persistence, audio, and export live
 * in sibling files.
 */

export const MPC_BANK_A_MIDI = [
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
] as const;

export const MPC_BANK_B_MIDI = [
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67,
] as const;

export const MPC_BANK_C_MIDI = [
  68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
] as const;

export const MPC_BANK_D_MIDI = [
  84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
] as const;

export const MPC_BANKS = [
  { id: "A", label: "Bank A", midiNotes: MPC_BANK_A_MIDI },
  { id: "B", label: "Bank B", midiNotes: MPC_BANK_B_MIDI },
  { id: "C", label: "Bank C", midiNotes: MPC_BANK_C_MIDI },
  { id: "D", label: "Bank D", midiNotes: MPC_BANK_D_MIDI },
] as const;

export const MPC_PAD_MIDI = [
  ...MPC_BANK_A_MIDI,
  ...MPC_BANK_B_MIDI,
  ...MPC_BANK_C_MIDI,
  ...MPC_BANK_D_MIDI,
] as const;

export type MpcPadMidi = (typeof MPC_PAD_MIDI)[number];

export interface SampleAsset {
  id: string;
  fileName: string;
  displayName: string;
  mimeType: string;
  size: number;
  binaryKey: string;
}

export interface SampleVelocityLayer {
  sampleId: string;
  label: string;
  /** Normalized 0-1, inclusive lower bound. */
  minVelocity: number;
  /** Normalized 0-1, inclusive upper bound. */
  maxVelocity: number;
}

export interface SampleVelocityLayerInput {
  sampleId: string;
  minVelocity: number;
  maxVelocity: number;
}

export interface SamplePadAssignment {
  midiNote: MpcPadMidi;
  /** Back-compat primary layer; equivalent to the first velocity layer. */
  sampleId: string;
  label: string;
  velocityLayers?: SampleVelocityLayer[];
  /** MPC mute/choke group, 1-16. Undefined means no choke group. */
  chokeGroup?: number;
}

export interface SampleKit {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  samples: SampleAsset[];
  assignments: SamplePadAssignment[];
}

export const SAMPLE_KITS_SETTINGS_ID = "music.sample-kits";

const SUPPORTED_SAMPLE_EXTENSIONS = new Set([
  "wav",
  "wave",
  "aif",
  "aiff",
  "flac",
  "mp3",
  "ogg",
  "oga",
]);

/**
 * Preferred Bank A pad per drum token, in precedence order. The first entry
 * whose token list matches the normalized filename wins, so more specific
 * tokens (e.g. tom qualifiers, closed vs. open hat) precede generic ones.
 */
const PAD_TOKENS: { midiNote: MpcPadMidi; matches: (name: string) => boolean }[] = [
  { midiNote: 48, matches: (n) => has(n, "hightom") || (has(n, "tom") && has(n, "high")) },
  {
    midiNote: 45,
    matches: (n) => has(n, "midtom") || has(n, "tommid") || (has(n, "tom") && has(n, "mid")),
  },
  {
    midiNote: 41,
    matches: (n) => has(n, "lowtom") || has(n, "tomlow") || (has(n, "tom") && has(n, "low")),
  },
  { midiNote: 45, matches: (n) => has(n, "tom") },
  {
    midiNote: 36,
    matches: (n) => has(n, "kick") || has(n, "bassdrum") || has(n, "bd") || has(n, "808"),
  },
  { midiNote: 38, matches: (n) => has(n, "snare") || has(n, "sd") },
  { midiNote: 39, matches: (n) => has(n, "clap") },
  {
    midiNote: 37,
    matches: (n) => has(n, "sidestick") || has(n, "rimshot") || has(n, "rim") || has(n, "stick"),
  },
  {
    midiNote: 46,
    matches: (n) => has(n, "openhat") || has(n, "hho") || (has(n, "hat") && has(n, "open")),
  },
  {
    midiNote: 42,
    matches: (n) => has(n, "closedhat") || has(n, "hhc") || (has(n, "hat") && has(n, "closed")),
  },
  { midiNote: 42, matches: (n) => has(n, "hihat") || has(n, "hat") || has(n, "hh") },
  { midiNote: 49, matches: (n) => has(n, "crash") },
  { midiNote: 51, matches: (n) => has(n, "ride") },
  { midiNote: 40, matches: (n) => has(n, "perc") },
];

function has(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

function normalizedTokens(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function isMpcPadMidi(value: number): value is MpcPadMidi {
  return (MPC_PAD_MIDI as readonly number[]).includes(value);
}

export function validateSampleFile(file: Pick<File, "name" | "size" | "type">): void {
  if (file.name.trim().length === 0) throw new Error("Sample files need a name.");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!SUPPORTED_SAMPLE_EXTENSIONS.has(extension)) {
    throw new Error(`This file type is not supported by MPC sample kits: ${file.name}.`);
  }
  if (file.size <= 0) throw new Error(`The sample file is empty: ${file.name}.`);
}

export function safeSampleFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const safeStem =
    stem
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sample";
  return extension ? `${safeStem}.${extension}` : safeStem;
}

export function sampleBinaryKey(kitId: string, sampleId: string, fileName: string): string {
  return `${SAMPLE_KITS_SETTINGS_ID}/${kitId}/${sampleId}-${safeSampleFileName(fileName)}`;
}

function preferredPad(fileName: string): MpcPadMidi | undefined {
  const tokens = normalizedTokens(fileName);
  return PAD_TOKENS.find((entry) => entry.matches(tokens))?.midiNote;
}

export function autoMapSamples(
  samples: SampleAsset[],
  existingAssignments: SamplePadAssignment[] = [],
): SamplePadAssignment[] {
  const usedPads = new Set<number>();
  const assignedSamples = new Set<string>();
  const result: SamplePadAssignment[] = [];

  for (const assignment of existingAssignments) {
    if (
      isMpcPadMidi(assignment.midiNote) &&
      !usedPads.has(assignment.midiNote) &&
      !assignedSamples.has(assignment.sampleId)
    ) {
      result.push({ ...assignment });
      usedPads.add(assignment.midiNote);
      assignedSamples.add(assignment.sampleId);
    }
  }

  for (const sample of samples) {
    if (assignedSamples.has(sample.id) || usedPads.size >= MPC_PAD_MIDI.length) continue;
    const preferred = preferredPad(sample.fileName);
    const pad =
      preferred !== undefined && !usedPads.has(preferred)
        ? preferred
        : MPC_PAD_MIDI.find((candidate) => !usedPads.has(candidate));
    if (pad === undefined) continue;
    result.push({ midiNote: pad, sampleId: sample.id, label: sample.displayName });
    usedPads.add(pad);
    assignedSamples.add(sample.id);
  }

  return result.sort((left, right) => left.midiNote - right.midiNote);
}

export function assignSample(
  kit: SampleKit,
  sampleId: string,
  midiNote: MpcPadMidi,
  now = Date.now(),
): SampleKit {
  const sample = kit.samples.find((candidate) => candidate.id === sampleId);
  if (!sample) throw new Error(`Sample not found: ${sampleId}.`);

  const assignments = kit.assignments.filter(
    (assignment) => assignment.midiNote !== midiNote && assignment.sampleId !== sampleId,
  );
  assignments.push({ midiNote, sampleId, label: sample.displayName });
  assignments.sort((left, right) => left.midiNote - right.midiNote);

  return { ...cloneSampleKit(kit), assignments, updatedAt: now };
}

export function renameSample(
  kit: SampleKit,
  sampleId: string,
  displayName: string,
  now = Date.now(),
): SampleKit {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) throw new Error("Sample names cannot be empty.");
  if (!kit.samples.some((sample) => sample.id === sampleId)) {
    throw new Error(`Sample not found: ${sampleId}.`);
  }

  return {
    ...cloneSampleKit(kit),
    samples: kit.samples.map((sample) =>
      sample.id === sampleId ? { ...sample, displayName: trimmed } : { ...sample },
    ),
    assignments: kit.assignments.map((assignment) => {
      const renamedAssignment =
        assignment.sampleId === sampleId ? { ...assignment, label: trimmed } : { ...assignment };
      return {
        ...renamedAssignment,
        ...(assignment.velocityLayers === undefined
          ? {}
          : {
              velocityLayers: assignment.velocityLayers.map((layer) =>
                layer.sampleId === sampleId ? { ...layer, label: trimmed } : { ...layer },
              ),
            }),
      };
    }),
    updatedAt: now,
  };
}

export function setPadVelocityLayers(
  kit: SampleKit,
  midiNote: MpcPadMidi,
  layers: SampleVelocityLayerInput[],
  now = Date.now(),
): SampleKit {
  if (layers.length === 0) throw new Error("A pad needs at least one velocity layer.");
  if (layers.length > 4) throw new Error("MPC pads support up to four velocity layers.");

  const normalized = layers
    .map((layer, index): SampleVelocityLayer => {
      const sample = kit.samples.find((candidate) => candidate.id === layer.sampleId);
      if (!sample) throw new Error(`Sample not found: ${layer.sampleId}.`);
      const minVelocity = clamp01(layer.minVelocity);
      const maxVelocity = clamp01(layer.maxVelocity);
      if (minVelocity >= maxVelocity) {
        throw new Error(`Velocity layer ${index + 1} must start before it ends.`);
      }
      return {
        sampleId: sample.id,
        label: sample.displayName,
        minVelocity,
        maxVelocity,
      };
    })
    .sort((left, right) => left.minVelocity - right.minVelocity);

  const layerSampleIds = new Set(normalized.map((layer) => layer.sampleId));
  const assignments = kit.assignments.filter(
    (assignment) => assignment.midiNote !== midiNote && !layerSampleIds.has(assignment.sampleId),
  );
  const primary = normalized[0]!;
  assignments.push({
    midiNote,
    sampleId: primary.sampleId,
    label: primary.label,
    velocityLayers: normalized,
  });
  assignments.sort((left, right) => left.midiNote - right.midiNote);

  return { ...cloneSampleKit(kit), assignments, updatedAt: now };
}

export function setPadChokeGroup(
  kit: SampleKit,
  midiNote: MpcPadMidi,
  chokeGroup: number | undefined,
  now = Date.now(),
): SampleKit {
  if (
    chokeGroup !== undefined &&
    (!Number.isInteger(chokeGroup) || chokeGroup < 1 || chokeGroup > 16)
  ) {
    throw new Error("Choke group must be 1-16.");
  }

  const assignments = kit.assignments.map((assignment) =>
    assignment.midiNote === midiNote
      ? {
          ...assignment,
          ...(chokeGroup === undefined ? {} : { chokeGroup }),
        }
      : { ...assignment },
  );
  if (chokeGroup === undefined) {
    for (const assignment of assignments) {
      if (assignment.midiNote === midiNote) delete assignment.chokeGroup;
    }
  }

  return { ...cloneSampleKit(kit), assignments, updatedAt: now };
}

export function removeSampleFromKit(kit: SampleKit, sampleId: string, now = Date.now()): SampleKit {
  if (!kit.samples.some((sample) => sample.id === sampleId)) {
    throw new Error(`Sample not found: ${sampleId}.`);
  }

  const samples = kit.samples
    .filter((sample) => sample.id !== sampleId)
    .map((sample) => ({
      ...sample,
    }));
  const assignments: SamplePadAssignment[] = [];
  for (const assignment of kit.assignments) {
    if (assignment.sampleId === sampleId) continue;
    if (assignment.velocityLayers === undefined) {
      assignments.push({ ...assignment });
      continue;
    }

    const remainingLayers = assignment.velocityLayers
      .filter((layer) => layer.sampleId !== sampleId)
      .map((layer) => ({ ...layer }));
    if (remainingLayers.length === 0) continue;

    const primary = remainingLayers[0]!;
    const nextAssignment: SamplePadAssignment = {
      ...assignment,
      sampleId: primary.sampleId,
      label: primary.label,
    };
    delete nextAssignment.velocityLayers;
    assignments.push({
      ...nextAssignment,
      ...(remainingLayers.length === 1 ? {} : { velocityLayers: remainingLayers }),
    });
  }

  return { ...cloneSampleKit(kit), samples, assignments, updatedAt: now };
}

export function unassignPad(kit: SampleKit, midiNote: MpcPadMidi, now = Date.now()): SampleKit {
  const assignments = kit.assignments
    .filter((assignment) => assignment.midiNote !== midiNote)
    .sort((left, right) => left.midiNote - right.midiNote);
  return { ...cloneSampleKit(kit), assignments, updatedAt: now };
}

export function velocityLayersForAssignment(
  assignment: SamplePadAssignment,
): SampleVelocityLayer[] {
  return (
    assignment.velocityLayers?.map((layer) => ({ ...layer })) ?? [
      {
        sampleId: assignment.sampleId,
        label: assignment.label,
        minVelocity: 0,
        maxVelocity: 1,
      },
    ]
  );
}

export function sampleForPadVelocity(
  assignment: SamplePadAssignment,
  velocity: number,
): SampleVelocityLayer {
  const layers = velocityLayersForAssignment(assignment);
  const value = clamp01(velocity);
  return (
    layers.find((layer) => value >= layer.minVelocity && value <= layer.maxVelocity) ??
    layers.toSorted((left, right) => {
      const leftDistance = Math.min(
        Math.abs(value - left.minVelocity),
        Math.abs(value - left.maxVelocity),
      );
      const rightDistance = Math.min(
        Math.abs(value - right.minVelocity),
        Math.abs(value - right.maxVelocity),
      );
      return leftDistance - rightDistance;
    })[0]!
  );
}

export function cloneSampleKit(kit: SampleKit): SampleKit {
  return {
    ...kit,
    samples: kit.samples.map((sample) => ({ ...sample })),
    assignments: kit.assignments.map((assignment) => ({
      ...assignment,
      ...(assignment.velocityLayers === undefined
        ? {}
        : { velocityLayers: assignment.velocityLayers.map((layer) => ({ ...layer })) }),
    })),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export {
  SampleKitStore,
  type SampleKitRepository,
  type SampleBinaryStore,
  type ResolvedSample,
  type ResolvedSampleKit,
  type SampleKitStoreOptions,
} from "./store";

export { buildMpcKitExport, type MpcExportFile, type MpcKitExport } from "./mpc-export";

export {
  buildMpcKitZip,
  canExportToDirectory,
  writeMpcKitToDirectory,
  type DirectoryExportResult,
  type ZipExportResult,
} from "./browser-export";
