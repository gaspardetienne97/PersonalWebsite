/** Reader settings — persisted so the reader opens the way the user left it.
 *
 * Reading layout/highlight/font are fixed app defaults (no in-reader control);
 * the in-reader panel only exposes type metrics and accent, and voice
 * engine/voice/quality live on the narrator settings page.
 */

import { DEFAULT_KOKORO_QUALITY, type KokoroQuality } from "../services/tts";

export type ReaderLayout = "immersive" | "audiobook" | "document";
export type HighlightStyle = "underline" | "fill" | "glow";
export type ReadingFont = "sans" | "serif";
/** "system" = OS Web Speech voice; "natural" = in-browser Kokoro neural TTS. */
export type VoiceEngine = "system" | "natural";

export interface ReaderSettingsState {
  layout: ReaderLayout;
  highlight: HighlightStyle;
  font: ReadingFont;
  fontSize: number;
  lineHeight: number;
  accent: string;
  /** When true, the accent follows each document's own color. */
  accentAuto: boolean;
  engine: VoiceEngine;
  /** Preferred system (Web Speech) voice name; "" = browser default. */
  systemVoice: string;
  /** Kokoro voice id used when engine is "natural". */
  naturalVoice: string;
  /** Kokoro model quality preset. */
  modelQuality: KokoroQuality;
}

export const ACCENT_OPTIONS = ["#1291FA", "#A21FB8", "#FF0C0D", "#22C55E"];

const DEFAULTS: ReaderSettingsState = {
  layout: "immersive",
  highlight: "glow",
  font: "sans", // the site's default family
  fontSize: 21,
  lineHeight: 1.8,
  accent: "#1291FA",
  // Off for a new reader: one accent across the app. Anyone who saved settings keeps theirs.
  accentAuto: false,
  engine: "system",
  systemVoice: "",
  naturalVoice: "af_heart",
  modelQuality: DEFAULT_KOKORO_QUALITY,
};

const SETTINGS_KEY = "narrator.settings.v2";

const hasStorage = () => typeof localStorage !== "undefined";

function load(): ReaderSettingsState {
  if (!hasStorage()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ReaderSettingsState>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export class ReaderSettings {
  layout = $state<ReaderLayout>(DEFAULTS.layout);
  highlight = $state<HighlightStyle>(DEFAULTS.highlight);
  font = $state<ReadingFont>(DEFAULTS.font);
  fontSize = $state(DEFAULTS.fontSize);
  lineHeight = $state(DEFAULTS.lineHeight);
  accent = $state(DEFAULTS.accent);
  accentAuto = $state(DEFAULTS.accentAuto);
  engine = $state<VoiceEngine>(DEFAULTS.engine);
  systemVoice = $state(DEFAULTS.systemVoice);
  naturalVoice = $state(DEFAULTS.naturalVoice);
  modelQuality = $state<KokoroQuality>(DEFAULTS.modelQuality);

  constructor() {
    Object.assign(this, load());
  }

  update<K extends keyof ReaderSettingsState>(key: K, value: ReaderSettingsState[K]): void {
    (this as ReaderSettingsState)[key] = value;
    this.#persist();
  }

  /** Accent to use for a given document accent (honors "match each document"). */
  accentFor(docAccent: string | undefined): string {
    return this.accentAuto && docAccent ? docAccent : this.accent;
  }

  #persist(): void {
    if (!hasStorage()) return;
    const state: ReaderSettingsState = {
      layout: this.layout,
      highlight: this.highlight,
      font: this.font,
      fontSize: this.fontSize,
      lineHeight: this.lineHeight,
      accent: this.accent,
      accentAuto: this.accentAuto,
      engine: this.engine,
      systemVoice: this.systemVoice,
      naturalVoice: this.naturalVoice,
      modelQuality: this.modelQuality,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  }
}
