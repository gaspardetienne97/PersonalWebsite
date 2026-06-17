/** NarrationPlayer — read-aloud playback with a synced karaoke playhead.
 *
 * Two engines share one virtual timeline (ms, from buildModel):
 *
 *  - "system"  — the OS Web Speech API. Speaks sentence-by-sentence; word
 *                boundary events snap the playhead, an rAF loop glides between.
 *  - "natural" — Kokoro neural TTS in the browser (kokoro-js). Each sentence is
 *                synthesized to audio and played through an <audio> element; the
 *                rAF loop maps audio playback time onto the sentence's word span,
 *                so the highlight tracks the actual voice.
 *
 * Both degrade gracefully: if neither engine can speak, the rAF loop advances
 * the playhead on its own so the reader still scrolls. A natural-engine failure
 * (no WebGPU/WASM, model download blocked, synthesis error) falls back to the
 * system engine automatically.
 */

import { buildModel, wordIndexAt } from "../domain/model";
import type { NarrationModel, NarratorDoc, SentenceSpan } from "../domain/types";
import {
  DEFAULT_KOKORO_VOICE,
  DEFAULT_KOKORO_QUALITY,
  getSynth,
  kokoroSupported,
  resolveVoice,
  speechAvailable,
  synthesize,
  mapAudioToPos,
  type KokoroQuality,
  type SynthResult,
} from "../services/tts";

export type EngineMode = "system" | "natural";

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

interface Prefetch {
  si: number;
  fromWord: number;
  result: SynthResult;
}

export class NarrationPlayer {
  readonly doc: NarratorDoc;
  readonly model: NarrationModel;

  pos = $state(0);
  playing = $state(false);
  speed = $state(1);
  /** System (Web Speech) voice name, or undefined for the browser default. */
  voice = $state<string | undefined>(undefined);
  /** Kokoro voice id used by the natural engine. */
  naturalVoice = $state(DEFAULT_KOKORO_VOICE);
  /** Kokoro model quality preset. */
  modelQuality = $state<KokoroQuality>(DEFAULT_KOKORO_QUALITY);
  engineMode = $state<EngineMode>("system");
  /** True while real audio is coming out of the speakers. */
  speaking = $state(false);
  /** Natural-engine model download state, for UI. */
  modelLoading = $state(false);
  modelProgress = $state(0);
  /** Set when the natural engine failed and we reverted to the system voice. */
  usingFallback = $state(false);

  wordIndex = $derived.by(() => wordIndexAt(this.model, this.pos));
  sentenceIndex = $derived.by(() => this.model.tokens[this.wordIndex]?.si ?? 0);
  chapterIndex = $derived.by(() => this.model.tokens[this.wordIndex]?.ci ?? 0);
  percent = $derived.by(() => (this.model.total ? this.pos / this.model.total : 0));
  done = $derived.by(() => this.pos >= this.model.total);

  #raf = 0;
  #last = 0;
  #lastPersist = 0;

  // --- system (Web Speech) engine ---
  #utterance: SpeechSynthesisUtterance | null = null;
  #spokenSentence: SentenceSpan | null = null;
  #watchdog: ReturnType<typeof setTimeout> | null = null;
  #sawEvent = false;
  #speechBroken = false;

  // --- natural (Kokoro) engine ---
  #audio: HTMLAudioElement | null = null;
  #audioDriven = false;
  #spanStart = 0;
  #spanEnd = 0;
  #spanDuration = 0;
  #synthSeq = 0;
  #prefetch: Prefetch | null = null;
  #urls = new Set<string>();

  constructor(doc: NarratorDoc) {
    this.doc = doc;
    this.model = buildModel(doc);
    const saved = savedPosition(doc.id);
    this.pos = saved ?? (doc.progress || 0) * this.model.total;
    this.voice = doc.voice || undefined;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  play(): void {
    if (this.playing || typeof requestAnimationFrame === "undefined") return;
    if (this.done) this.pos = 0;
    this.playing = true;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
    this.#startEngine();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.#raf);
    this.#stopPlayback();
    this.#persist();
  }

  setSpeed(speed: number): void {
    if (speed === this.speed) return;
    this.speed = speed;
    if (this.#audio) this.#audio.playbackRate = speed; // instant, pitch-preserved
    if (this.playing && this.engineMode === "system") this.#startSpeech();
  }

  /** Set the system (Web Speech) voice. */
  setVoice(name: string): void {
    if (name === this.voice) return;
    this.voice = name;
    if (this.playing && this.engineMode === "system") this.#startSpeech();
  }

  setNaturalVoice(id: string): void {
    if (id === this.naturalVoice) return;
    this.naturalVoice = id;
    this.#dropPrefetch();
    if (this.playing && this.engineMode === "natural") this.#startNatural();
  }

  setModelQuality(quality: KokoroQuality): void {
    if (quality === this.modelQuality) return;
    this.modelQuality = quality;
    this.#dropPrefetch();
    if (this.playing && this.engineMode === "natural") this.#startNatural();
  }

  setEngine(mode: EngineMode): void {
    if (mode === this.engineMode) return;
    this.engineMode = mode;
    this.usingFallback = false;
    this.#dropPrefetch();
    if (this.playing) {
      this.#stopPlayback();
      this.#startEngine();
    }
  }

  seekTo(pos: number): void {
    this.pos = Math.max(0, Math.min(this.model.total, pos));
    this.#persist();
    this.#dropPrefetch();
    if (this.playing) this.#startEngine();
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
    this.#stopPlayback();
    this.#dropPrefetch();
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
    this.#persist();
  }

  // ----- shared playhead loop -----

  #tick = (now: number) => {
    if (!this.playing) return;
    const dt = now - this.#last;
    this.#last = now;

    if (this.engineMode === "natural") {
      // Audio (when playing) is authoritative; otherwise hold while synthesizing.
      if (this.#audioDriven && this.#audio) {
        const duration = Number.isFinite(this.#audio.duration)
          ? this.#audio.duration
          : this.#spanDuration;
        this.pos = mapAudioToPos(this.#spanStart, this.#spanEnd, this.#audio.currentTime, duration);
      }
    } else {
      let next = this.pos + dt * this.speed;
      const spoken = this.#spokenSentence;
      if (spoken && this.speaking && !this.#speechBroken) {
        next = Math.min(next, spoken.end - 1); // the end event advances us
      } else if (next >= this.model.total) {
        this.pos = this.model.total;
        this.playing = false;
        this.#stopPlayback();
        this.#persist();
        return;
      }
      this.pos = next;
    }

    if (now - this.#lastPersist > 1000) this.#persist(now);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #startEngine(): void {
    if (this.engineMode === "natural" && kokoroSupported()) {
      this.#startNatural();
    } else {
      if (this.engineMode === "natural") this.#failToSystem(); // unsupported environment
      this.#startSpeech();
    }
  }

  #stopPlayback(): void {
    this.#stopSpeech();
    this.#stopAudio();
  }

  #sentenceAt(pos: number): { sentence: SentenceSpan; fromWord: number } | null {
    const sentence =
      this.model.sentences.find((s) => pos < s.end) ??
      this.model.sentences[this.model.sentences.length - 1];
    if (!sentence) return null;
    const fromWord = Math.max(sentence.wordStart, wordIndexAt(this.model, pos));
    return { sentence, fromWord };
  }

  #spokenText(sentence: SentenceSpan, fromWord: number): string {
    const words: string[] = [];
    for (let i = fromWord; i <= sentence.wordEnd; i++) words.push(this.model.tokens[i].word);
    return words.join(" ");
  }

  // ----- natural (Kokoro) engine -----

  #startNatural(): void {
    this.#stopAudio();
    const at = this.#sentenceAt(this.pos);
    if (!at) return;
    void this.#playNatural(at.sentence, at.fromWord);
  }

  async #playNatural(sentence: SentenceSpan, fromWord: number): Promise<void> {
    const text = this.#spokenText(sentence, fromWord);
    if (!text.trim()) {
      this.#advanceNatural(sentence);
      return;
    }
    const first = this.model.tokens[fromWord];
    const last = this.model.tokens[sentence.wordEnd];
    this.#spanStart = first.start;
    this.#spanEnd = last.start + last.dur;

    const seq = ++this.#synthSeq;
    let result: SynthResult;
    try {
      const cached =
        this.#prefetch && this.#prefetch.si === sentence.si && this.#prefetch.fromWord === fromWord
          ? this.#prefetch.result
          : null;
      if (cached) {
        this.#prefetch = null;
        result = cached;
      } else {
        this.#dropPrefetch();
        this.modelLoading = true;
        result = await synthesize(
          text,
          this.naturalVoice,
          this.modelQuality,
          (p) => (this.modelProgress = p.fraction),
        );
      }
    } catch {
      if (seq === this.#synthSeq) this.#failToSystem();
      return;
    } finally {
      if (seq === this.#synthSeq) this.modelLoading = false;
    }
    if (seq !== this.#synthSeq || !this.playing) {
      URL.revokeObjectURL(result.url);
      return;
    }

    this.#urls.add(result.url);
    this.#spanDuration = result.durationSec;
    const audio = new Audio(result.url);
    audio.playbackRate = this.speed;
    audio.preservesPitch = true;
    audio.onplaying = () => {
      if (this.#audio === audio) {
        this.#audioDriven = true;
        this.speaking = true;
      }
    };
    audio.onended = () => {
      if (this.#audio === audio) this.#advanceNatural(sentence);
    };
    audio.onerror = () => {
      if (this.#audio === audio) this.#failToSystem();
    };
    this.#audio = audio;
    void audio.play().catch(() => {
      if (this.#audio === audio) this.#failToSystem();
    });

    this.#prefetchNext(sentence);
  }

  #advanceNatural(sentence: SentenceSpan): void {
    this.#audioDriven = false;
    this.speaking = false;
    const next = this.model.sentences.find((s) => s.start >= sentence.end - 1);
    if (next && this.playing) {
      this.pos = next.start;
      void this.#playNatural(next, next.wordStart);
    } else {
      this.pos = this.model.total;
      this.playing = false;
      cancelAnimationFrame(this.#raf);
      this.#persist();
    }
  }

  /** Synthesize the next sentence in the background for gapless-ish playback. */
  #prefetchNext(sentence: SentenceSpan): void {
    const next = this.model.sentences.find((s) => s.start >= sentence.end - 1);
    if (!next) return;
    if (this.#prefetch && this.#prefetch.si === next.si) return;
    const text = this.#spokenText(next, next.wordStart);
    if (!text.trim()) return;
    const voice = this.naturalVoice;
    synthesize(text, voice, this.modelQuality)
      .then((result) => {
        if (this.naturalVoice === voice && this.engineMode === "natural") {
          this.#prefetch = { si: next.si, fromWord: next.wordStart, result };
          this.#urls.add(result.url);
        } else {
          URL.revokeObjectURL(result.url);
        }
      })
      .catch(() => {});
  }

  #dropPrefetch(): void {
    if (this.#prefetch) {
      URL.revokeObjectURL(this.#prefetch.result.url);
      this.#urls.delete(this.#prefetch.result.url);
      this.#prefetch = null;
    }
  }

  #stopAudio(): void {
    this.#synthSeq++; // invalidate any in-flight synthesis
    this.#audioDriven = false;
    if (this.#audio) {
      const audio = this.#audio;
      this.#audio = null;
      audio.onended = audio.onerror = audio.onplaying = null;
      audio.pause();
      if (audio.src) {
        URL.revokeObjectURL(audio.src);
        this.#urls.delete(audio.src);
      }
    }
    this.speaking = false;
    this.modelLoading = false;
  }

  /** Natural engine unavailable/failed — revert to the OS voice and keep going. */
  #failToSystem(): void {
    this.#stopAudio();
    this.engineMode = "system";
    this.usingFallback = true;
    this.modelLoading = false;
    if (this.playing) this.#startSpeech();
  }

  // ----- system (Web Speech) engine -----

  #startSpeech(): void {
    this.#stopSpeech();
    if (!speechAvailable() || this.#speechBroken) return;
    const at = this.#sentenceAt(this.pos);
    if (at) this.#speakSentence(at.sentence, at.fromWord);
  }

  #speakSentence(sentence: SentenceSpan, fromWord: number): void {
    const synth = getSynth();
    if (!synth) return;

    const charStarts: number[] = [];
    let chars = 0;
    for (let i = fromWord; i <= sentence.wordEnd; i++) {
      charStarts.push(chars);
      chars += this.model.tokens[i].word.length + 1;
    }
    const text = this.#spokenText(sentence, fromWord);
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
      let k = charStarts.length - 1;
      while (k > 0 && charStarts[k] > e.charIndex) k--;
      const token = this.model.tokens[fromWord + k];
      if (token) this.pos = token.start;
    };
    const finish = () => {
      if (this.#utterance !== utterance) return;
      this.#clearWatchdog();
      this.#utterance = null;
      this.#spokenSentence = null;
      this.speaking = false;
      if (this.playing) this.#advancePast(sentence);
    };
    utterance.onend = finish;
    utterance.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      finish();
    };

    const expectedMs = (sentence.end - this.model.tokens[fromWord].start) / this.speed;
    this.#setWatchdog(expectedMs * 3 + 3000, utterance);
    synth.speak(utterance);
  }

  #advancePast(sentence: SentenceSpan): void {
    const next = this.model.sentences.find((s) => s.start >= sentence.end - 1);
    if (next) {
      this.pos = next.start;
      this.#speakSentence(next, next.wordStart);
    } else {
      this.pos = this.model.total;
      this.playing = false;
      cancelAnimationFrame(this.#raf);
      this.#persist();
    }
  }

  #setWatchdog(ms: number, utterance: SpeechSynthesisUtterance): void {
    this.#clearWatchdog();
    this.#watchdog = setTimeout(() => {
      if (this.#utterance !== utterance || this.#sawEvent) return;
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
