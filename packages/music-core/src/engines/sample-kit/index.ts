/**
 * Sample kit model — framework-agnostic mapping of imported audio samples onto
 * an Akai MPC "Bank A" 16-pad layout (MIDI 36-51). No browser, Svelte, or Tone
 * APIs here: validation, filename normalization, deterministic auto-mapping, and
 * pure assignment helpers. Persistence, audio, and export live in sibling files.
 */

export const MPC_BANK_A_MIDI = [
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
] as const;

export type MpcPadMidi = (typeof MPC_BANK_A_MIDI)[number];

export interface SampleAsset {
  id: string;
  fileName: string;
  displayName: string;
  mimeType: string;
  size: number;
  binaryKey: string;
}

export interface SamplePadAssignment {
  midiNote: MpcPadMidi;
  sampleId: string;
  label: string;
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
  return (MPC_BANK_A_MIDI as readonly number[]).includes(value);
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
    if (assignedSamples.has(sample.id) || usedPads.size >= MPC_BANK_A_MIDI.length) continue;
    const preferred = preferredPad(sample.fileName);
    const pad =
      preferred !== undefined && !usedPads.has(preferred)
        ? preferred
        : MPC_BANK_A_MIDI.find((candidate) => !usedPads.has(candidate));
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

export function unassignPad(kit: SampleKit, midiNote: MpcPadMidi, now = Date.now()): SampleKit {
  const assignments = kit.assignments
    .filter((assignment) => assignment.midiNote !== midiNote)
    .sort((left, right) => left.midiNote - right.midiNote);
  return { ...cloneSampleKit(kit), assignments, updatedAt: now };
}

export function cloneSampleKit(kit: SampleKit): SampleKit {
  return {
    ...kit,
    samples: kit.samples.map((sample) => ({ ...sample })),
    assignments: kit.assignments.map((assignment) => ({ ...assignment })),
  };
}

export {
  SampleKitStore,
  type SampleKitRepository,
  type SampleBinaryStore,
  type ResolvedSample,
  type ResolvedSampleKit,
  type SampleKitStoreOptions,
} from "./store";
