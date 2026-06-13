/** Reactive catalog of the system's speech-synthesis voices.
 *
 * Voices load asynchronously in Chromium (via `voiceschanged`), so consumers
 * read the reactive `voices` list rather than calling getVoices() directly.
 */

import { getSynth } from "../services/tts";

export class VoiceCatalog {
  voices = $state<SpeechSynthesisVoice[]>([]);

  constructor() {
    const synth = getSynth();
    if (!synth) return;
    const update = () => {
      this.voices = synth.getVoices();
    };
    update();
    synth.addEventListener?.("voiceschanged", update);
  }

  get available(): boolean {
    return this.voices.length > 0;
  }

  /** Default narrator: the system default if it speaks the UI language, else the first local match. */
  get defaultName(): string | undefined {
    return (this.preferred[0] ?? this.voices[0])?.name;
  }

  /** Local voices for the user's language first, then remaining locals, then the rest. */
  get preferred(): SpeechSynthesisVoice[] {
    const lang = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2);
    const score = (v: SpeechSynthesisVoice) =>
      (v.lang?.slice(0, 2) === lang ? 0 : 2) + (v.localService ? 0 : 1) - (v.default ? 0.5 : 0);
    return [...this.voices].sort((a, b) => score(a) - score(b));
  }

  /** A short list for chip pickers. */
  shortList(limit = 6): SpeechSynthesisVoice[] {
    return this.preferred.slice(0, limit);
  }
}

/** Shared catalog — voices are global to the page, one listener is enough. */
export const voiceCatalog = new VoiceCatalog();
