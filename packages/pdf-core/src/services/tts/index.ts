/** Thin wrappers around the Web Speech synthesis API. */

export {
  KOKORO_VOICES,
  DEFAULT_KOKORO_VOICE,
  kokoroSupported,
  loadKokoro,
  synthesize,
  mapAudioToPos,
  type KokoroVoice,
  type KokoroLoadProgress,
  type SynthResult,
} from "./kokoro";

export function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export function speechAvailable(): boolean {
  return getSynth() !== null && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Find a system voice by name; undefined lets the browser pick its default. */
export function resolveVoice(name: string | undefined): SpeechSynthesisVoice | undefined {
  const synth = getSynth();
  if (!synth || !name) return undefined;
  return synth.getVoices().find((v) => v.name === name);
}
