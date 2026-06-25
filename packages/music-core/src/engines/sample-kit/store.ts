/**
 * SampleKitStore — persistence for MPC sample kits. Metadata lives in one
 * settings record (`music.sample-kits`); each sample's audio blob lives under a
 * nested OPFS key. Imports are transactional: every blob is written before the
 * metadata is persisted, and any failure rolls the new blobs back so the store
 * never keeps orphaned audio. No Tone, Svelte, or audio-decode here.
 */

import type { SettingsRecord } from "@repo/music-core/engines/store";

import {
  SAMPLE_KITS_SETTINGS_ID,
  assignSample,
  autoMapSamples,
  cloneSampleKit,
  sampleBinaryKey,
  unassignPad,
  validateSampleFile,
  type MpcPadMidi,
  type SampleAsset,
  type SampleKit,
} from "./index";

export interface SampleKitRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export interface SampleBinaryStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  delete(key: string): Promise<void>;
}

export interface ResolvedSample {
  asset: SampleAsset;
  blob?: Blob;
  status: "available" | "missing";
}

export interface ResolvedSampleKit {
  kit: SampleKit;
  samples: ResolvedSample[];
}

export interface SampleKitStoreOptions {
  repository: SampleKitRepository;
  binaries: SampleBinaryStore;
  createId?: () => string;
  now?: () => number;
}

const STORAGE_UNAVAILABLE = "Local binary storage is unavailable.";
const STORAGE_UNAVAILABLE_FEATURE = "Sample storage is unavailable in this browser.";

export class SampleKitStore {
  readonly #repository: SampleKitRepository;
  readonly #binaries: SampleBinaryStore;
  readonly #createId: () => string;
  readonly #now: () => number;

  constructor(options: SampleKitStoreOptions) {
    this.#repository = options.repository;
    this.#binaries = options.binaries;
    this.#createId = options.createId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => Date.now());
  }

  async load(): Promise<SampleKit[]> {
    return this.#read();
  }

  async create(name: string): Promise<SampleKit> {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Kit names cannot be empty.");
    const kits = await this.#read();
    const kit: SampleKit = {
      id: this.#createId(),
      name: trimmed,
      createdAt: this.#now(),
      updatedAt: this.#now(),
      samples: [],
      assignments: [],
    };
    await this.#persist([...kits, kit]);
    return cloneSampleKit(kit);
  }

  async rename(kitId: string, name: string): Promise<SampleKit> {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Kit names cannot be empty.");
    const kits = await this.#read();
    const kit = this.#require(kits, kitId);
    kit.name = trimmed;
    kit.updatedAt = this.#now();
    await this.#persist(kits);
    return cloneSampleKit(kit);
  }

  async importFiles(kitId: string, files: File[]): Promise<SampleKit> {
    if (files.length === 0) throw new Error("Choose at least one audio sample.");
    for (const file of files) validateSampleFile(file);

    const kits = await this.#read();
    const kit = this.#require(kits, kitId);

    const newSamples: SampleAsset[] = files.map((file) => {
      const id = this.#createId();
      return {
        id,
        fileName: file.name,
        displayName: displayNameFor(file.name),
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        binaryKey: sampleBinaryKey(kit.id, id, file.name),
      };
    });

    const written: string[] = [];
    try {
      for (let index = 0; index < newSamples.length; index += 1) {
        await this.#binaries.put(newSamples[index]!.binaryKey, files[index]!);
        written.push(newSamples[index]!.binaryKey);
      }
      kit.samples = [...kit.samples, ...newSamples];
      kit.assignments = autoMapSamples(kit.samples, kit.assignments);
      kit.updatedAt = this.#now();
      await this.#persist(kits);
    } catch (error) {
      await this.#rollback(written);
      throw this.#translate(error);
    }
    return cloneSampleKit(kit);
  }

  async assign(kitId: string, sampleId: string, midiNote: MpcPadMidi): Promise<SampleKit> {
    const kits = await this.#read();
    const kit = this.#require(kits, kitId);
    const updated = assignSample(kit, sampleId, midiNote, this.#now());
    this.#replace(kits, updated);
    await this.#persist(kits);
    return cloneSampleKit(updated);
  }

  async unassign(kitId: string, midiNote: MpcPadMidi): Promise<SampleKit> {
    const kits = await this.#read();
    const kit = this.#require(kits, kitId);
    const updated = unassignPad(kit, midiNote, this.#now());
    this.#replace(kits, updated);
    await this.#persist(kits);
    return cloneSampleKit(updated);
  }

  async deleteSample(kitId: string, sampleId: string): Promise<SampleKit> {
    const kits = await this.#read();
    const kit = this.#require(kits, kitId);
    const sample = kit.samples.find((candidate) => candidate.id === sampleId);
    if (!sample) throw new Error(`Sample not found: ${sampleId}.`);

    kit.samples = kit.samples.filter((candidate) => candidate.id !== sampleId);
    kit.assignments = kit.assignments.filter((assignment) => assignment.sampleId !== sampleId);
    kit.updatedAt = this.#now();

    // Persist metadata first; if blob cleanup then fails, metadata stays updated.
    await this.#persist(kits);
    await this.#deleteBlobs([sample.binaryKey]);
    return cloneSampleKit(kit);
  }

  async deleteKit(kitId: string): Promise<void> {
    const kits = await this.#read();
    const kit = kits.find((candidate) => candidate.id === kitId);
    if (!kit) throw new Error(`Sample kit not found: ${kitId}.`);
    await this.#persist(kits.filter((candidate) => candidate.id !== kitId));
    await this.#deleteBlobs(kit.samples.map((sample) => sample.binaryKey));
  }

  async resolvePlayback(kitId: string): Promise<ResolvedSampleKit> {
    const kits = await this.#read();
    const kit = this.#require(kits, kitId);
    const samples = await Promise.all(
      kit.samples.map(async (asset): Promise<ResolvedSample> => {
        const blob = await this.#binaries.get(asset.binaryKey);
        return blob
          ? { asset: { ...asset }, blob, status: "available" }
          : { asset: { ...asset }, status: "missing" };
      }),
    );
    return { kit: cloneSampleKit(kit), samples };
  }

  async #read(): Promise<SampleKit[]> {
    const record = await this.#repository.get(SAMPLE_KITS_SETTINGS_ID);
    const value = record?.value;
    if (!Array.isArray(value)) return [];

    const seenKitIds = new Set<string>();
    const kits: SampleKit[] = [];
    for (const raw of value) {
      const kit = raw as SampleKit | undefined;
      if (!kit || typeof kit.id !== "string" || seenKitIds.has(kit.id)) continue;
      seenKitIds.add(kit.id);

      const seenSampleIds = new Set<string>();
      const seenKeys = new Set<string>();
      const samples = (kit.samples ?? []).filter((sample) => {
        if (seenSampleIds.has(sample.id) || seenKeys.has(sample.binaryKey)) return false;
        seenSampleIds.add(sample.id);
        seenKeys.add(sample.binaryKey);
        return true;
      });
      kits.push(cloneSampleKit({ ...kit, samples, assignments: kit.assignments ?? [] }));
    }
    return kits;
  }

  async #persist(kits: SampleKit[]): Promise<void> {
    await this.#repository.put({
      id: SAMPLE_KITS_SETTINGS_ID,
      value: kits.map(cloneSampleKit),
    });
  }

  #require(kits: SampleKit[], kitId: string): SampleKit {
    const kit = kits.find((candidate) => candidate.id === kitId);
    if (!kit) throw new Error(`Sample kit not found: ${kitId}.`);
    return kit;
  }

  #replace(kits: SampleKit[], updated: SampleKit): void {
    const index = kits.findIndex((candidate) => candidate.id === updated.id);
    if (index >= 0) kits[index] = updated;
  }

  async #rollback(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.#binaries.delete(key);
      } catch {
        // Best-effort rollback; surface the original failure instead.
      }
    }
  }

  async #deleteBlobs(keys: string[]): Promise<void> {
    let failure: unknown;
    for (const key of keys) {
      try {
        await this.#binaries.delete(key);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw this.#translate(failure);
  }

  #translate(error: unknown): Error {
    if (error instanceof Error && error.message === STORAGE_UNAVAILABLE) {
      return new Error(STORAGE_UNAVAILABLE_FEATURE);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

function displayNameFor(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}
