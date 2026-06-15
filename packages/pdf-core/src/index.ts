export * from "./domain";
export {
  extractFile,
  extractPaste,
  kindForFile,
  ACCEPT_BY_KIND,
  type ExtractProgress,
  type ExtractStage,
} from "./services/extract";
export {
  speechAvailable,
  resolveVoice,
  kokoroSupported,
  webgpuAvailable,
  kokoroLoaded,
  clearKokoro,
  loadKokoro,
  synthesize,
  KOKORO_VOICES,
  DEFAULT_KOKORO_VOICE,
  KOKORO_QUALITIES,
  DEFAULT_KOKORO_QUALITY,
  type KokoroVoice,
  type KokoroQuality,
  type KokoroQualityOption,
} from "./services/tts";
export {
  NarrationPlayer,
  savedPosition,
  clearSavedPosition,
  type EngineMode,
} from "./stores/narration.svelte";
export { NarratorLibrary } from "./stores/library.svelte";
export { VoiceCatalog } from "./stores/voices.svelte";
export {
  ReaderSettings,
  ACCENT_OPTIONS,
  type ReaderLayout,
  type HighlightStyle,
  type ReadingFont,
  type VoiceEngine,
  type ReaderSettingsState,
} from "./stores/settings.svelte";
