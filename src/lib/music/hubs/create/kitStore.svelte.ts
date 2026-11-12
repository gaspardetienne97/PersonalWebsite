// The sample kits the beat grid plays and exports. Kits live in the setting
// `music.sample-kits`; sample bytes in OPFS. Every change is written through
// and the decoded kit is reloaded into the audio runtime.
import { buildKitFiles, sampleFileError, type KitFile } from "@repo/music-core/io/mpc-kit";
import {
  audio,
  deleteBinary,
  getBinary,
  getSetting,
  putBinary,
  putSetting,
} from "$lib/music/runtime";
import {
  KITS_KEY,
  newKit,
  padLabel,
  placeSamples,
  removeSample,
  samplePath,
  setPad,
  toExportKit,
  toRuntimeKit,
  type StoredKit,
  type StoredPad,
} from "./kits";

const CURRENT_KEY = "music.sample-kits.current";

class KitStore {
  kits = $state<StoredKit[]>([]);
  currentId = $state<string | undefined>();
  /** Pads whose samples could not be decoded (a missing or unreadable file). */
  broken = $state<number[]>([]);
  ready: Promise<void>;

  constructor() {
    this.ready = typeof window === "undefined" ? Promise.resolve() : this.load();
  }

  get kit(): StoredKit | undefined {
    return this.kits.find((k) => k.id === this.currentId) ?? this.kits[0];
  }
  /** Notes with a sample on the current kit. */
  get notes(): ReadonlySet<number> {
    return new Set((this.kit?.pads ?? []).filter((p) => p.soft || p.hard).map((p) => p.note));
  }

  async load() {
    const list = await getSetting<StoredKit[]>(KITS_KEY, []);
    this.kits = Array.isArray(list) ? list : [];
    this.currentId = await getSetting<string | undefined>(CURRENT_KEY, undefined);
    if (!this.kits.length) await this.create("My kit");
    else await this.sync();
  }

  async sync() {
    const kit = this.kit;
    if (!kit) return;
    const { failed } = await audio.loadKit(toRuntimeKit(kit));
    this.broken = failed;
  }

  async #write(next: StoredKit) {
    const stamped = { ...next, updatedAt: Date.now() };
    this.kits = this.kits.some((k) => k.id === next.id)
      ? this.kits.map((k) => (k.id === next.id ? stamped : k))
      : [...this.kits, stamped];
    await putSetting(KITS_KEY, this.kits);
    if (stamped.id === this.kit?.id) await this.sync();
  }

  async create(name: string) {
    const kit = newKit(name.trim() || "Kit", crypto.randomUUID(), Date.now());
    await this.#write(kit);
    await this.select(kit.id);
    return kit;
  }

  async select(id: string) {
    this.currentId = id;
    await putSetting(CURRENT_KEY, id);
    await this.sync();
  }

  async rename(name: string) {
    if (this.kit && name.trim()) await this.#write({ ...this.kit, name: name.trim() });
  }

  async setPad(note: number, patch: Partial<StoredPad>) {
    if (this.kit) await this.#write(setPad(this.kit, note, patch));
  }

  async renameSample(id: string, name: string) {
    const kit = this.kit;
    if (!kit || !name.trim()) return;
    await this.#write({
      ...kit,
      samples: kit.samples.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)),
    });
  }

  async deleteSample(id: string) {
    const kit = this.kit;
    const sample = kit?.samples.find((s) => s.id === id);
    if (!kit || !sample) return;
    await this.#write(removeSample(kit, id));
    await deleteBinary(sample.path).catch(() => {});
  }

  /**
   * Store files in OPFS and put each on a pad (filename match, else the next
   * free pad from `fromNote`). Returns one plain sentence per file.
   */
  async import(
    files: File[],
    fromNote: number,
  ): Promise<{ placed: string[]; refused: string[]; pads: number[] }> {
    let kit = this.kit;
    const placed: string[] = [];
    const refused: string[] = [];
    const filled: number[] = [];
    if (!kit) return { placed, refused, pads: filled };
    const usable = files.filter((f) => {
      const err = sampleFileError(f.name);
      if (err) refused.push(err);
      return !err;
    });
    const pads = placeSamples(
      kit,
      usable.map((f) => f.name),
      fromNote,
    );
    for (const [i, file] of usable.entries()) {
      const id = crypto.randomUUID();
      const path = samplePath(kit.id, id, file.name);
      try {
        await putBinary(path, file);
      } catch (e) {
        refused.push(`"${file.name}" didn't save: ${(e as Error).message}`);
        continue;
      }
      const name = file.name.replace(/\.[^.]+$/, "");
      kit = {
        ...kit,
        samples: [...kit.samples, { id, fileName: file.name, name, path, size: file.size }],
      };
      const note = pads[i];
      if (note !== null) {
        kit = setPad(kit, note, { soft: id });
        filled.push(note);
        placed.push(`${name} on pad ${padLabel(note)}`);
      } else placed.push(`${name} (every pad is taken, so it is in the sample list only)`);
    }
    await this.#write(kit);
    return { placed, refused, pads: filled };
  }

  /** The XPM program and Samples/ files for the MPC, read back from OPFS. */
  async exportFiles(): Promise<KitFile[]> {
    const kit = this.kit;
    if (!kit) throw new Error("Make a kit first.");
    const exp = toExportKit(kit);
    if (!exp.pads.length) throw new Error("Put at least one sample on a pad before exporting.");
    const used = new Set(exp.pads.flatMap((p) => p.layers.map((l) => l.sampleId)));
    const samples = await Promise.all(
      kit.samples
        .filter((s) => used.has(s.id))
        .map(async (s) => {
          const blob = await getBinary(s.path);
          if (!blob)
            throw new Error(`The file for "${s.name}" is missing from this browser's storage.`);
          return { id: s.id, fileName: s.fileName, data: new Uint8Array(await blob.arrayBuffer()) };
        }),
    );
    return buildKitFiles(exp, samples);
  }
}

export const kits = new KitStore();
