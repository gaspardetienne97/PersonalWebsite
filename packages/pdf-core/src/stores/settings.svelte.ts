/** Reader settings — persisted so the reader opens the way the user left it.
 *
 * Reading layout and highlight are fixed app defaults (no in-reader control);
 * the in-reader panel exposes the reading face, type metrics and accent, and
 * voice engine/voice/quality live on the narrator settings page.
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
  /** The Flow or Document switch was explained once on a phone. */
  viewHintSeen: boolean;
}

/** Each keeps white readable on it (3:1 or more) and stands apart from the others without red against green. */
export const ACCENT_OPTIONS = ["#1291FA", "#A855F7", "#F0443A", "#12A383"];

/** The accents offered before the retune, by what took their place. */
const OLD_ACCENTS: Record<string, string> = {
  "#A21FB8": "#A855F7",
  "#FF0C0D": "#F0443A",
  "#22C55E": "#12A383",
};

export const FONT_SIZE = { min: 16, max: 30, step: 1 };
export const LINE_HEIGHT = { min: 1.4, max: 2.2, step: 0.1 };

/** One step up or down a range, kept inside it and free of float dust. */
export function stepWithin(
  value: number,
  dir: 1 | -1,
  range: { min: number; max: number; step: number },
): number {
  const next = Math.round((value + dir * range.step) * 100) / 100;
  return Math.min(range.max, Math.max(range.min, next));
}

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
  viewHintSeen: false,
};

const SETTINGS_KEY = "narrator.settings.v2";

const hasStorage = () => typeof localStorage !== "undefined";

function load(): ReaderSettingsState {
  if (!hasStorage()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ReaderSettingsState>) };
    saved.accent = OLD_ACCENTS[saved.accent.toUpperCase()] ?? saved.accent;
    return saved;
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
  viewHintSeen = $state(DEFAULTS.viewHintSeen);

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
      viewHintSeen: this.viewHintSeen,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  }
}
