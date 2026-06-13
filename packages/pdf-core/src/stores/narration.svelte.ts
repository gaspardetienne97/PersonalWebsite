/** NarrationPlayer — real text-to-speech with a synced karaoke playhead.
 *
 * The document is laid out on a virtual 1x timeline (ms) used by the scrubber
 * and highlight. Playback speaks sentence-by-sentence through the Web Speech
 * API; word-boundary events snap the playhead to the word actually being
 * spoken, while a rAF loop keeps the highlight moving smoothly between events
 * (clamped to the sentence being spoken so it never runs ahead).
 *
 * If speech synthesis is unavailable or silently broken (no events), playback
 * degrades to the rAF-simulated timeline so the UI always works.
 */

import { buildModel, wordIndexAt } from "../domain/model";
import type { NarrationModel, NarratorDoc, SentenceSpan } from "../domain/types";
import { getSynth, resolveVoice, speechAvailable } from "../services/tts";

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
  voice = $state<string | undefined>(undefined);
  /** True while real audio is coming out of the speakers. */
  speaking = $state(false);

  wordIndex = $derived.by(() => wordIndexAt(this.model, this.pos));
  sentenceIndex = $derived.by(() => this.model.tokens[this.wordIndex]?.si ?? 0);
  chapterIndex = $derived.by(() => this.model.tokens[this.wordIndex]?.ci ?? 0);
  percent = $derived.by(() => (this.model.total ? this.pos / this.model.total : 0));
  done = $derived.by(() => this.pos >= this.model.total);

  #raf = 0;
  #last = 0;
  #lastPersist = 0;

  // --- speech state ---
  #utterance: SpeechSynthesisUtterance | null = null;
  #spokenSentence: SentenceSpan | null = null;
  #watchdog: ReturnType<typeof setTimeout> | null = null;
  #sawEvent = false;
  /** Set when the synth exists but never delivers events — fall back to rAF. */
  #speechBroken = false;

  constructor(doc: NarratorDoc) {
    this.doc = doc;
    this.model = buildModel(doc);
    const saved = savedPosition(doc.id);
    this.pos = saved ?? (doc.progress || 0) * this.model.total;
    this.voice = doc.voice || undefined;
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
    this.#startSpeech();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.#raf);
    this.#stopSpeech();
    this.#persist();
  }

  setSpeed(speed: number): void {
    if (speed === this.speed) return;
    this.speed = speed;
    if (this.playing) this.#startSpeech(); // restart the sentence at the new rate
  }

  setVoice(name: string): void {
    if (name === this.voice) return;
    this.voice = name;
    if (this.playing) this.#startSpeech();
  }

  seekTo(pos: number): void {
    this.pos = Math.max(0, Math.min(this.model.total, pos));
    this.#persist();
    if (this.playing) this.#startSpeech();
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

  dispose(): void {
    if (this.playing) cancelAnimationFrame(this.#raf);
    this.playing = false;
    this.#stopSpeech();
    this.#persist();
  }

  // ----- virtual playhead -----

  #tick = (now: number) => {
    const dt = now - this.#last;
    this.#last = now;
    let next = this.pos + dt * this.speed;

    // While a sentence is genuinely being spoken, never run past its end —
    // the utterance's end event advances us, keeping highlight and audio tied.
    const spoken = this.#spokenSentence;
    if (spoken && this.speaking && !this.#speechBroken) {
      next = Math.min(next, spoken.end - 1);
    } else if (next >= this.model.total) {
      this.pos = this.model.total;
      this.playing = false;
      this.#stopSpeech();
      this.#persist();
      return;
    }

    this.pos = next;
    if (now - this.#lastPersist > 1000) this.#persist(now);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  // ----- speech engine -----

  #startSpeech(): void {
    this.#stopSpeech();
    if (!speechAvailable() || this.#speechBroken) return;
    const sentence =
      this.model.sentences.find((s) => this.pos < s.end) ??
      this.model.sentences[this.model.sentences.length - 1];
    if (!sentence) return;
    const fromWord = Math.max(sentence.wordStart, wordIndexAt(this.model, this.pos));
    this.#speakSentence(sentence, fromWord);
  }

  #speakSentence(sentence: SentenceSpan, fromWord: number): void {
    const synth = getSynth();
    if (!synth) return;

    const words: string[] = [];
    const charStarts: number[] = []; // char offset of each word in the spoken text
    let chars = 0;
    for (let i = fromWord; i <= sentence.wordEnd; i++) {
      const w = this.model.tokens[i].word;
      charStarts.push(chars);
      words.push(w);
      chars += w.length + 1;
    }
    const text = words.join(" ");
    if (!text.trim()) {
      this.#advancePast(sentence);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.min(10, Math.max(0.1, this.speed));
    const voice = resolveVoice(this.voice);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    this.#utterance = utterance;
    this.#spokenSentence = sentence;
    this.#sawEvent = false;

    utterance.onstart = () => {
      if (this.#utterance !== utterance) return;
      this.#sawEvent = true;
      this.speaking = true;
    };

    utterance.onboundary = (e) => {
      if (this.#utterance !== utterance || !this.playing) return;
      this.#sawEvent = true;
      // Map the character index back to the word being spoken.
      let k = charStarts.length - 1;
      while (k > 0 && charStarts[k] > e.charIndex) k--;
      const token = this.model.tokens[fromWord + k];
      if (token) this.pos = token.start;
    };

    const finish = () => {
      if (this.#utterance !== utterance) return; // cancelled or superseded
      this.#clearWatchdog();
      this.#utterance = null;
      this.#spokenSentence = null;
      this.speaking = false;
      if (!this.playing) return;
      this.#advancePast(sentence);
    };
    utterance.onend = finish;
    utterance.onerror = (e) => {
      // "interrupted"/"canceled" arrive from our own cancel() calls.
      if (e.error === "interrupted" || e.error === "canceled") return;
      finish();
    };

    // Some environments expose the API but never speak (headless browsers,
    // missing voices). If no event arrives in generous time, fall back to the
    // simulated playhead so the reader keeps moving.
    const expectedMs = (sentence.end - this.model.tokens[fromWord].start) / this.speed;
    this.#setWatchdog(expectedMs * 3 + 3000, utterance);

    synth.speak(utterance);
  }

  /** Continue from the end of a spoken sentence. */
  #advancePast(sentence: SentenceSpan): void {
    const next = this.model.sentences.find((s) => s.start >= sentence.end - 1);
    if (next) {
      this.pos = next.start;
      this.#speakSentence(next, next.wordStart);
    } else {
      this.pos = this.model.total;
      this.playing = false;
      this.#persist();
    }
  }

  #setWatchdog(ms: number, utterance: SpeechSynthesisUtterance): void {
    this.#clearWatchdog();
    this.#watchdog = setTimeout(() => {
      if (this.#utterance !== utterance || this.#sawEvent) return;
      // Speech is silently broken — keep the simulated playhead going instead.
      this.#speechBroken = true;
      this.#utterance = null;
      this.#spokenSentence = null;
      this.speaking = false;
      getSynth()?.cancel();
    }, ms);
  }

  #clearWatchdog(): void {
    if (this.#watchdog !== null) {
      clearTimeout(this.#watchdog);
      this.#watchdog = null;
    }
  }

  #stopSpeech(): void {
    this.#clearWatchdog();
    if (this.#utterance) {
      this.#utterance = null;
      this.#spokenSentence = null;
      getSynth()?.cancel();
    }
    this.speaking = false;
  }

  #persist(now?: number): void {
    this.#lastPersist = now ?? (typeof performance !== "undefined" ? performance.now() : 0);
    if (!hasStorage()) return;
    try {
      localStorage.setItem(POS_KEY_PREFIX + this.doc.id, String(this.pos));
    } catch {
      // Storage full or unavailable — playback still works, position just won't persist.
    }
  }
}
