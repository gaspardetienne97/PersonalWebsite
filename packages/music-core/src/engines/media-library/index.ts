import {
  deleteBinary,
  getBinary,
  putBinary,
  storageEstimate,
  type AudioTakeRow,
  type ImportedBackingTrackRow,
  type PracticeStore,
} from "@repo/music-core/engines/store";

export const DEFAULT_MEDIA_LIMITS = {
  maxTakeDurationMs: 3_600_000,
  maxImportedTrackBytes: 250 * 1024 * 1024,
  maxApplicationBytes: 1024 * 1024 * 1024,
  quotaFraction: 0.8,
} as const;

export interface MediaLimits {
  maxTakeDurationMs: number;
  maxImportedTrackBytes: number;
  maxApplicationBytes: number;
  quotaFraction: number;
}

export interface MediaRepository<T extends { id: string }> {
  put(row: T): Promise<void>;
  get(id: string): Promise<T | undefined>;
  all(): Promise<T[]>;
  delete(id: string): Promise<void>;
}

export interface MediaLibraryOptions {
  backingRepository: MediaRepository<ImportedBackingTrackRow>;
  takeRepository: MediaRepository<AudioTakeRow>;
  putBinary(key: string, blob: Blob): Promise<void>;
  getBinary(key: string): Promise<Blob | undefined>;
  deleteBinary(key: string): Promise<void>;
  storageEstimate(): Promise<StorageEstimate>;
  limits?: Partial<MediaLimits>;
}

export interface MediaUsage {
  backingBytes: number;
  takeBytes: number;
  totalBytes: number;
  effectiveBudgetBytes: number;
  remainingBytes: number;
}

const BACKING_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]);

export class MediaLibrary {
  readonly #backingRepository: MediaRepository<ImportedBackingTrackRow>;
  readonly #takeRepository: MediaRepository<AudioTakeRow>;
  readonly #putBinary: MediaLibraryOptions["putBinary"];
  readonly #getBinary: MediaLibraryOptions["getBinary"];
  readonly #deleteBinary: MediaLibraryOptions["deleteBinary"];
  readonly #storageEstimate: MediaLibraryOptions["storageEstimate"];
  readonly #limits: MediaLimits;

  constructor(options: MediaLibraryOptions) {
    this.#backingRepository = options.backingRepository;
    this.#takeRepository = options.takeRepository;
    this.#putBinary = options.putBinary;
    this.#getBinary = options.getBinary;
    this.#deleteBinary = options.deleteBinary;
    this.#storageEstimate = options.storageEstimate;
    this.#limits = { ...DEFAULT_MEDIA_LIMITS, ...options.limits };
  }

  async usage(): Promise<MediaUsage> {
    const [backings, takes, estimate] = await Promise.all([
      this.#backingRepository.all(),
      this.#takeRepository.all(),
      this.#storageEstimate(),
    ]);
    const backingBytes = sumSizes(backings);
    const takeBytes = sumSizes(takes);
    const totalBytes = backingBytes + takeBytes;
    const effectiveBudgetBytes = this.#effectiveBudget(estimate);

    return {
      backingBytes,
      takeBytes,
      totalBytes,
      effectiveBudgetBytes,
      remainingBytes: Math.max(0, effectiveBudgetBytes - totalBytes),
    };
  }

  async saveBacking(row: ImportedBackingTrackRow, blob: Blob): Promise<void> {
    this.#validateBacking(row, blob);
    const key = backingKey(row.id);
    const [previousRow, previousBlob] = await Promise.all([
      this.#backingRepository.get(row.id),
      this.#getBinary(key),
    ]);

    await this.#assertBudget(row.size, previousBlob?.size ?? previousRow?.size ?? 0);
    await this.#saveRecord(this.#backingRepository, key, row, blob, previousRow, previousBlob);
  }

  async saveTake(row: AudioTakeRow, blob: Blob): Promise<void> {
    await this.#validateTake(row, blob);
    const key = takeKey(row.id);
    const [previousRow, previousBlob] = await Promise.all([
      this.#takeRepository.get(row.id),
      this.#getBinary(key),
    ]);

    await this.#assertBudget(row.size, previousBlob?.size ?? previousRow?.size ?? 0);
    await this.#saveRecord(this.#takeRepository, key, row, blob, previousRow, previousBlob);
  }

  listBackings(): Promise<ImportedBackingTrackRow[]> {
    return this.#backingRepository.all();
  }

  listTakes(): Promise<AudioTakeRow[]> {
    return this.#takeRepository.all();
  }

  backingBlob(id: string): Promise<Blob | undefined> {
    return this.#getBinary(backingKey(id));
  }

  takeBlob(id: string): Promise<Blob | undefined> {
    return this.#getBinary(takeKey(id));
  }

  async references(backingId: string): Promise<string[]> {
    const takes = await this.#takeRepository.all();
    return takes
      .filter((take) => take.backingKind === "imported" && take.backingTrackId === backingId)
      .map((take) => take.id);
  }

  async deleteTake(id: string): Promise<void> {
    await this.#deleteRecord(this.#takeRepository, takeKey(id), id);
  }

  async deleteBacking(id: string, options: { orphanTakes?: boolean } = {}): Promise<void> {
    const referencedTakes = (await this.#takeRepository.all()).filter(
      (take) => take.backingKind === "imported" && take.backingTrackId === id,
    );
    if (referencedTakes.length > 0 && !options.orphanTakes) {
      throw new Error(`Backing track ${id} is referenced by saved takes.`);
    }

    try {
      for (const take of referencedTakes) {
        await this.#takeRepository.put(orphanTake(take));
      }
    } catch (error) {
      throw withRollbackErrors(error, await restoreRows(this.#takeRepository, referencedTakes));
    }

    try {
      await this.#deleteRecord(this.#backingRepository, backingKey(id), id);
    } catch (error) {
      throw withRollbackErrors(error, await restoreRows(this.#takeRepository, referencedTakes));
    }
  }

  async #saveRecord<T extends { id: string }>(
    repository: MediaRepository<T>,
    key: string,
    row: T,
    blob: Blob,
    previousRow: T | undefined,
    previousBlob: Blob | undefined,
  ): Promise<void> {
    try {
      await this.#putBinary(key, blob);
    } catch (error) {
      throw withRollbackErrors(error, await this.#restoreBinary(key, previousBlob));
    }
    try {
      await repository.put(row);
    } catch (error) {
      throw withRollbackErrors(
        error,
        await this.#restoreRecord(repository, key, row.id, previousRow, previousBlob),
      );
    }
  }

  async #deleteRecord<T extends { id: string }>(
    repository: MediaRepository<T>,
    key: string,
    id: string,
  ): Promise<void> {
    const [previousRow, previousBlob] = await Promise.all([
      repository.get(id),
      this.#getBinary(key),
    ]);

    try {
      await this.#deleteBinary(key);
    } catch (error) {
      const rollbackErrors =
        previousBlob === undefined
          ? []
          : await settleOperations([() => this.#putBinary(key, previousBlob)]);
      throw withRollbackErrors(error, rollbackErrors);
    }

    try {
      await repository.delete(id);
    } catch (error) {
      throw withRollbackErrors(
        error,
        await this.#restoreRecord(repository, key, id, previousRow, previousBlob),
      );
    }
  }

  async #restoreRecord<T extends { id: string }>(
    repository: MediaRepository<T>,
    key: string,
    id: string,
    previousRow: T | undefined,
    previousBlob: Blob | undefined,
  ): Promise<unknown[]> {
    const operations: Array<() => Promise<void>> = [
      previousBlob === undefined
        ? () => this.#deleteBinary(key)
        : () => this.#putBinary(key, previousBlob),
      previousRow === undefined ? () => repository.delete(id) : () => repository.put(previousRow),
    ];
    return settleOperations(operations);
  }

  #restoreBinary(key: string, previousBlob: Blob | undefined): Promise<unknown[]> {
    return settleOperations([
      previousBlob === undefined
        ? () => this.#deleteBinary(key)
        : () => this.#putBinary(key, previousBlob),
    ]);
  }

  async #assertBudget(newSize: number, replacedSize: number): Promise<void> {
    const current = await this.usage();
    const postWriteBytes = current.totalBytes - replacedSize + newSize;
    if (postWriteBytes > current.effectiveBudgetBytes) {
      throw new Error(
        `Media write exceeds the effective application budget of ${current.effectiveBudgetBytes} bytes.`,
      );
    }
  }

  #effectiveBudget(estimate: StorageEstimate): number {
    const quotaBudget =
      typeof estimate.quota === "number" && Number.isFinite(estimate.quota) && estimate.quota >= 0
        ? Math.floor(estimate.quota * this.#limits.quotaFraction)
        : this.#limits.maxApplicationBytes;
    return Math.min(this.#limits.maxApplicationBytes, quotaBudget);
  }

  #validateBacking(row: ImportedBackingTrackRow, blob: Blob): void {
    const mimeType = normalizeMimeType(row.mimeType);
    if (!BACKING_MIME_TYPES.has(mimeType)) {
      throw new Error(`Unsupported backing MIME type: ${row.mimeType}`);
    }
    if (blob.type && normalizeMimeType(blob.type) !== mimeType) {
      throw new Error("Backing MIME type must equal the blob MIME type.");
    }
    if (row.size !== blob.size) {
      throw new Error("Backing metadata size must equal the blob size.");
    }
    if (!isValidDuration(row.durationMs)) {
      throw new Error("Backing duration must be finite and nonnegative.");
    }
    if (row.size > this.#limits.maxImportedTrackBytes) {
      throw new Error("Backing exceeds the imported track size limit.");
    }
  }

  async #validateTake(row: AudioTakeRow, blob: Blob): Promise<void> {
    const mimeType = normalizeMimeType(row.mimeType);
    if (!mimeType) {
      throw new Error("Take MIME type must be nonempty.");
    }
    extensionForMimeType(mimeType);
    if (blob.type && normalizeMimeType(blob.type) !== mimeType) {
      throw new Error("Take MIME type must equal the blob MIME type.");
    }
    if (row.size !== blob.size) {
      throw new Error("Take metadata size must equal the blob size.");
    }
    if (!isValidDuration(row.durationMs) || row.durationMs > this.#limits.maxTakeDurationMs) {
      throw new Error(
        `Take duration must be finite, nonnegative, and at most ${this.#limits.maxTakeDurationMs}ms.`,
      );
    }

    if (row.backingKind === "imported") {
      if (!row.backingTrackId || row.generatedBacking) {
        throw new Error(
          "Imported backing takes require a backing track id and no generated backing.",
        );
      }
      if (!(await this.#backingRepository.get(row.backingTrackId))) {
        throw new Error(`Imported backing track does not exist: ${row.backingTrackId}`);
      }
      return;
    }

    if (row.backingKind === "generated") {
      if (!row.generatedBacking || row.backingTrackId) {
        throw new Error(
          "Generated backing takes require generated backing data and no backing track id.",
        );
      }
      return;
    }

    if (row.backingKind || row.backingTrackId || row.generatedBacking) {
      throw new Error("No-backing takes cannot include backing fields.");
    }
  }
}

export function createMediaLibrary(store: PracticeStore): MediaLibrary {
  return new MediaLibrary({
    backingRepository: store.backingTracks,
    takeRepository: store.audioTakes,
    putBinary,
    getBinary,
    deleteBinary,
    storageEstimate,
  });
}

export function extensionForMimeType(mimeType: string): "webm" | "ogg" | "mp4" | "wav" | "mp3" {
  switch (normalizeMimeType(mimeType)) {
    case "audio/webm":
    case "video/webm":
      return "webm";
    case "audio/ogg":
    case "application/ogg":
      return "ogg";
    case "audio/mp4":
    case "video/mp4":
      return "mp4";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    default:
      throw new Error(`Unsupported media MIME type: ${mimeType}`);
  }
}

export function downloadName(name: string, mimeType: string): string {
  const extension = extensionForMimeType(mimeType);
  return name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`;
}

function backingKey(id: string): string {
  return `music-backing-${id}`;
}

function takeKey(id: string): string {
  return `music-take-${id}`;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isValidDuration(durationMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs >= 0;
}

function sumSizes(rows: Array<{ size: number }>): number {
  return rows.reduce((total, row) => total + row.size, 0);
}

function orphanTake(take: AudioTakeRow): AudioTakeRow {
  const {
    backingKind: _backingKind,
    backingTrackId: _backingTrackId,
    generatedBacking: _generatedBacking,
    ...orphan
  } = take;
  return orphan;
}

async function restoreRows<T extends { id: string }>(
  repository: MediaRepository<T>,
  rows: T[],
): Promise<unknown[]> {
  return settleOperations(rows.map((row) => () => repository.put(row)));
}

async function settleOperations(operations: Array<() => Promise<void>>): Promise<unknown[]> {
  const results = await Promise.allSettled(operations.map((operation) => operation()));
  return results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
}

function withRollbackErrors(error: unknown, rollbackErrors: unknown[]): unknown {
  if (rollbackErrors.length === 0) return error;
  return new AggregateError(
    [error, ...rollbackErrors],
    error instanceof Error ? error.message : "Media operation and rollback failed.",
  );
}
