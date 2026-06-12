/** NarratorLibrary — the user's document list, persisted to localStorage.
 *
 * Live progress is derived from each document's saved playhead position so
 * cards and the "continue listening" hero reflect actual listening state.
 */

import { SAMPLE_DOCS } from "../domain/data";
import { buildModel } from "../domain/model";
import type { NarrationModel, NarratorDoc } from "../domain/types";
import { clearSavedPosition, savedPosition } from "./narration.svelte";

const LIBRARY_KEY = "narrator.library.v1";

const hasStorage = () => typeof localStorage !== "undefined";

function loadDocs(fallback: NarratorDoc[]): NarratorDoc[] {
  if (!hasStorage()) return fallback;
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as NarratorDoc[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export class NarratorLibrary {
  docs = $state<NarratorDoc[]>([]);

  #models = new Map<string, NarrationModel>();

  constructor(initial: NarratorDoc[] = SAMPLE_DOCS) {
    this.docs = loadDocs(initial);
  }

  modelFor(doc: NarratorDoc): NarrationModel {
    let model = this.#models.get(doc.id);
    if (!model) {
      model = buildModel(doc);
      this.#models.set(doc.id, model);
    }
    return model;
  }

  /** Live progress fraction: saved playhead first, authored progress as fallback. */
  progressOf(doc: NarratorDoc): number {
    const model = this.modelFor(doc);
    if (!model.total) return 0;
    const saved = savedPosition(doc.id);
    if (saved !== null) return Math.max(0, Math.min(1, saved / model.total));
    return doc.progress || 0;
  }

  get inProgress(): NarratorDoc | undefined {
    return [...this.docs]
      .filter((d) => this.progressOf(d) > 0)
      .sort((a, b) => this.progressOf(b) - this.progressOf(a))[0];
  }

  find(id: string): NarratorDoc | undefined {
    return this.docs.find((d) => d.id === id);
  }

  add(doc: NarratorDoc): void {
    this.docs = [doc, ...this.docs.filter((d) => d.id !== doc.id)];
    this.#persist();
  }

  remove(id: string): void {
    this.docs = this.docs.filter((d) => d.id !== id);
    this.#models.delete(id);
    clearSavedPosition(id);
    this.#persist();
  }

  #persist(): void {
    if (!hasStorage()) return;
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(this.docs));
  }
}
