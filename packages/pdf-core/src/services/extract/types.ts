/** Output of a file extractor — everything needed to build a NarratorDoc. */

import type { NarratorChapter } from "../../domain/types";

export interface ExtractedContent {
  title: string;
  author: string;
  /** Source descriptor for the library card, e.g. "PDF · 12 pages". */
  meta: string;
  chapters: NarratorChapter[];
}

/** Pipeline stage keys, in order, as surfaced in the add-document UI. */
export type ExtractStage = "read" | "extract" | "clean" | "chapters" | "narration";

/** An extractor that counts its pages says where it is inside the stage. */
export type ExtractProgress = (stage: ExtractStage, at?: { page: number; pages: number }) => void;

/** Why a file gave no document, for the screen to pick the right way out. */
export type ExtractErrorCode = "pdf-no-text" | "pdf-locked";

/** A failure whose message is written for the listener: what happened and what to do next. */
export class ExtractError extends Error {
  constructor(
    message: string,
    readonly code?: ExtractErrorCode,
  ) {
    super(message);
  }
}
