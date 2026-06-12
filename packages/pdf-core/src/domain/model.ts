/** Simulated narration timeline.
 *
 * Tokenizes a document into words/sentences/chapters and lays them out on a
 * speed-independent virtual 1x timeline (ms). Playback advances a playhead
 * over this timeline; per-word duration scales with word length so the
 * karaoke highlight reads naturally.
 */

import type { NarrationModel, NarratorDoc, SentenceSpan, WordToken } from "./types";

/** Words-per-minute baseline for the simulated narrator. */
export const BASE_WPM = 165;

export const MS_PER_WORD = 60_000 / BASE_WPM;
export const SENTENCE_PAUSE = 380;
export const PARA_PAUSE = 260;

const SENTENCE_END = /[.!?]["'”’]?$/;

export function buildModel(doc: NarratorDoc): NarrationModel {
  const tokens: WordToken[] = [];
  const sentences: SentenceSpan[] = [];
  const chapters: NarrationModel["chapters"] = [];
  let si = -1;
  let clock = 0;

  doc.chapters.forEach((ch, ci) => {
    const cStartWord = tokens.length;
    const cStart = clock;
    ch.paragraphs.forEach((para, pi) => {
      const words = para.split(/\s+/).filter(Boolean);
      let sStartWord = tokens.length;
      let sStart = clock;
      let openSentence = false;
      for (const word of words) {
        if (!openSentence) {
          si++;
          sStartWord = tokens.length;
          sStart = clock;
          openSentence = true;
        }
        const letters = word.replace(/[^A-Za-z0-9]/g, "").length;
        const lenFactor = Math.min(1.9, Math.max(0.7, letters / 5));
        const dur = MS_PER_WORD * lenFactor;
        const end = SENTENCE_END.test(word);
        tokens.push({ word, ci, pi, si, start: clock, dur, sentenceEnd: end });
        clock += dur;
        if (end) {
          clock += SENTENCE_PAUSE;
          sentences.push({
            ci,
            pi,
            si,
            wordStart: sStartWord,
            wordEnd: tokens.length - 1,
            start: sStart,
            end: clock,
          });
          openSentence = false;
        }
      }
      if (openSentence) {
        // paragraph ended without terminal punctuation
        sentences.push({
          ci,
          pi,
          si,
          wordStart: sStartWord,
          wordEnd: tokens.length - 1,
          start: sStart,
          end: clock,
        });
      }
      clock += PARA_PAUSE;
    });
    chapters.push({
      ci,
      title: ch.title,
      wordStart: cStartWord,
      wordEnd: tokens.length - 1,
      start: cStart,
      end: clock,
    });
  });

  return { tokens, sentences, chapters, total: clock };
}

/** Format a millisecond duration as m:ss or h:mm:ss. */
export function fmt(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
}

/** Index of the token whose start is at or before `pos` (binary search). */
export function wordIndexAt(model: NarrationModel, pos: number): number {
  const t = model.tokens;
  if (!t.length) return -1;
  let lo = 0;
  let hi = t.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid].start <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
