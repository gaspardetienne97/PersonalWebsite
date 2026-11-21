/** Narrator domain types — framework-agnostic (no Svelte imports here). */

export type DocKind = "pdf" | "epub" | "txt" | "paste";

export interface NarratorChapter {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface NarratorDoc {
  id: string;
  title: string;
  author: string;
  kind: DocKind;
  /** Per-document accent color (hex). */
  accent: string;
  /** Short source descriptor, e.g. "Novel · 1895". */
  meta: string;
  /** Narrator voice label, e.g. "Aria — calm British". */
  voice: string;
  chapters: NarratorChapter[];
}

/** One word on the virtual 1x narration timeline. */
export interface WordToken {
  word: string;
  /** chapter / paragraph / sentence indices */
  ci: number;
  pi: number;
  si: number;
  /** start time and duration in ms on the 1x timeline */
  start: number;
  dur: number;
  sentenceEnd: boolean;
}

export interface SentenceSpan {
  ci: number;
  pi: number;
  si: number;
  wordStart: number;
  wordEnd: number;
  start: number;
  end: number;
}

export interface ChapterSpan {
  ci: number;
  title: string;
  wordStart: number;
  wordEnd: number;
  start: number;
  end: number;
}

export interface NarrationModel {
  tokens: WordToken[];
  sentences: SentenceSpan[];
  chapters: ChapterSpan[];
  /** Total duration of the document in ms at 1x. */
  total: number;
}
