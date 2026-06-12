/** NarrationPlayer — drives the simulated narration playhead with rAF.
 *
 * The playhead lives on the model's virtual 1x timeline (ms); `speed` scales
 * how fast real time advances it, so word timings stay speed-independent.
 * Position persists per document so listening resumes where it stopped.
 */

import { buildModel, wordIndexAt } from "../domain/model";
import type { NarrationModel, NarratorDoc } from "../domain/types";

const POS_KEY_PREFIX = "narrate.pos.";

const hasStorage = () => typeof localStorage !== "undefined";

export function savedPosition(docId: string): number | null {
  if (!hasStorage()) return null;
  const raw = localStorage.getItem(POS_KEY_PREFIX + docId);
  if (raw === null) return null;
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? null : value;
}

export function clearSavedPosition(docId: string): void {
  if (!hasStorage()) return;
  localStorage.removeItem(POS_KEY_PREFIX + docId);
}

export class NarrationPlayer {
  readonly doc: NarratorDoc;
  readonly model: NarrationModel;

  pos = $state(0);
  playing = $state(false);
  speed = $state(1);

  wordIndex = $derived.by(() => wordIndexAt(this.model, this.pos));
  sentenceIndex = $derived.by(() => this.model.tokens[this.wordIndex]?.si ?? 0);
  chapterIndex = $derived.by(() => this.model.tokens[this.wordIndex]?.ci ?? 0);
  percent = $derived.by(() => (this.model.total ? this.pos / this.model.total : 0));
  done = $derived.by(() => this.pos >= this.model.total);

  #raf = 0;
  #last = 0;
  #lastPersist = 0;

  constructor(doc: NarratorDoc) {
    this.doc = doc;
    this.model = buildModel(doc);
    const saved = savedPosition(doc.id);
    this.pos = saved ?? (doc.progress || 0) * this.model.total;
  }

  toggle(): void {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    if (this.playing || typeof requestAnimationFrame === "undefined") return;
    if (this.done) this.pos = 0;
    this.playing = true;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.#raf);
    this.#persist();
  }

  #tick = (now: number) => {
    const dt = now - this.#last;
    this.#last = now;
    const next = this.pos + dt * this.speed;
    if (next >= this.model.total) {
      this.pos = this.model.total;
      this.playing = false;
      this.#persist();
      return;
    }
    this.pos = next;
    if (now - this.#lastPersist > 1000) this.#persist(now);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  seekTo(pos: number): void {
    this.pos = Math.max(0, Math.min(this.model.total, pos));
    this.#persist();
  }

  seekWord(index: number): void {
    const token = this.model.tokens[index];
    if (token) this.seekTo(token.start);
  }

  seekChapter(index: number): void {
    const chapter = this.model.chapters[index];
    if (chapter) this.seekTo(chapter.start + 1);
  }

  nextSentence(): void {
    const next = this.model.sentences.find((s) => s.start > this.pos + 1);
    this.seekTo(next ? next.start : this.model.total);
  }

  /** Restart the current sentence, or jump to the previous one near its start. */
  prevSentence(): void {
    const current = this.model.sentences.find((s) => s.si === this.sentenceIndex);
    if (current && this.pos - current.start > 700) {
      this.seekTo(current.start);
      return;
    }
    const before = current ? current.start : this.pos;
    const prev = [...this.model.sentences].reverse().find((s) => s.start < before - 1);
    this.seekTo(prev ? prev.start : 0);
  }

  #persist(now?: number): void {
    this.#lastPersist = now ?? (typeof performance !== "undefined" ? performance.now() : 0);
    if (!hasStorage()) return;
    localStorage.setItem(POS_KEY_PREFIX + this.doc.id, String(this.pos));
  }

  dispose(): void {
    if (this.playing) cancelAnimationFrame(this.#raf);
    this.playing = false;
    this.#persist();
  }
}
