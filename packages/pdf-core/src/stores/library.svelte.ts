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

  /** The document removed last and where it sat, kept until `forgetRemoved` so it can come back. */
  removed = $state<{ doc: NarratorDoc; index: number } | null>(null);

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

  /** Live progress fraction, from the saved playhead: nothing is in progress until it was played. */
  progressOf(doc: NarratorDoc): number {
    const model = this.modelFor(doc);
    const saved = savedPosition(doc.id);
    if (!model.total || saved === null) return 0;
    return Math.max(0, Math.min(1, saved / model.total));
  }

  /** The sentence the saved playhead is in, so the continue card can show where listening stopped. */
  resumeLine(doc: NarratorDoc): string {
    const saved = savedPosition(doc.id);
    if (saved === null) return "";
    const { sentences, tokens } = this.modelFor(doc);
    const sentence = sentences.find((s) => saved < s.end) ?? sentences.at(-1);
    if (!sentence) return "";
    return tokens
      .slice(sentence.wordStart, sentence.wordEnd + 1)
      .map((t) => t.word)
      .join(" ");
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

  /** Takes a document out. Its place and its playhead are kept until the undo is given up. */
  remove(id: string): void {
    const index = this.docs.findIndex((d) => d.id === id);
    if (index < 0) return;
    this.forgetRemoved();
    this.removed = { doc: this.docs[index], index };
    this.docs = this.docs.filter((d) => d.id !== id);
    this.#models.delete(id);
    this.#persist();
  }

  /** Puts the last removed document back where it was, with its progress. */
  undoRemove(): void {
    const removed = this.removed;
    if (!removed) return;
    this.removed = null;
    const docs = this.docs.filter((d) => d.id !== removed.doc.id);
    docs.splice(Math.min(removed.index, docs.length), 0, removed.doc);
    this.docs = docs;
    this.#persist();
  }

  /** Gives up the undo: the removed document's playhead goes too. */
  forgetRemoved(): void {
    if (this.removed) clearSavedPosition(this.removed.doc.id);
    this.removed = null;
  }

  /** Whether any sample document is gone from the library. */
  get samplesMissing(): boolean {
    return SAMPLE_DOCS.some((s) => !this.find(s.id));
  }

  /** Brings back the samples that were removed, unplayed, after the listener's own documents. */
  restoreSamples(): void {
    const missing = SAMPLE_DOCS.filter((s) => !this.find(s.id));
    if (missing.length === 0) return;
    if (missing.some((s) => s.id === this.removed?.doc.id)) this.removed = null;
    for (const s of missing) clearSavedPosition(s.id);
    this.docs = [...this.docs, ...missing];
    this.#persist();
  }

  #persist(): void {
    if (!hasStorage()) return;
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(this.docs));
    } catch {
      // Quota exceeded (very large books) — the library still works in memory.
    }
  }
}
