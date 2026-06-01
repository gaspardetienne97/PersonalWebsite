import type { Voice, SpeechSettings, SpeechEvent } from "./types";

export class WebSpeechService {
  private synth: SpeechSynthesis;
  private voices: Voice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private eventListeners: Map<string, Set<(event: SpeechEvent) => void>> = new Map();
  private isInitialized = false;

  constructor() {
    if (typeof window === "undefined") {
      throw new Error("WebSpeechService requires browser environment");
    }

    this.synth = window.speechSynthesis;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve) => {
      const loadVoices = () => {
        const synthVoices = this.synth.getVoices();

        this.voices = synthVoices.map((voice) => ({
          id: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          default: voice.default,
          voiceURI: voice.voiceURI,
        }));

        if (this.voices.length > 0) {
          this.isInitialized = true;
          resolve();
        }
      };

      // Try immediately
      loadVoices();

      // Also listen for voiceschanged event (Chrome loads voices async)
      if (!this.isInitialized) {
        this.synth.addEventListener("voiceschanged", loadVoices, { once: true });

        // Fallback timeout
        setTimeout(() => {
          loadVoices();
          resolve();
        }, 1000);
      }
    });
  }

  getVoices(): Voice[] {
    return this.voices;
  }

  getVoicesByLanguage(langCode: string): Voice[] {
    return this.voices.filter((v) => v.lang.startsWith(langCode));
  }

  getDefaultVoice(): Voice | null {
    return this.voices.find((v) => v.default) || this.voices[0] || null;
  }

  speak(text: string, settings: SpeechSettings, sentenceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // Apply settings
      if (settings.voice) {
        const synthVoice = this.synth
          .getVoices()
          .find((v) => v.voiceURI === settings.voice!.voiceURI);
        if (synthVoice) {
          utterance.voice = synthVoice;
        }
      }

      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;

      // Event handlers
      utterance.onstart = () => {
        this.emit({ type: "start", sentenceId });
      };

      utterance.onend = () => {
        this.currentUtterance = null;
        this.emit({ type: "end", sentenceId });
        resolve();
      };

      utterance.onerror = (event) => {
        this.currentUtterance = null;
        const error = event.error || "Speech synthesis error";
        this.emit({ type: "error", error });
        reject(new Error(error));
      };

      utterance.onboundary = (event) => {
        if (event.name === "word") {
          this.emit({
            type: "boundary",
            charIndex: event.charIndex,
            charLength: event.charLength || 0,
          });
        }
      };

      utterance.onpause = () => {
        this.emit({ type: "pause" });
      };

      utterance.onresume = () => {
        this.emit({ type: "resume" });
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }

  pause(): void {
    if (this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
    }
  }

  resume(): void {
    if (this.synth.paused) {
      this.synth.resume();
    }
  }

  cancel(): void {
    this.synth.cancel();
    this.currentUtterance = null;
  }

  get isSpeaking(): boolean {
    return this.synth.speaking;
  }

  get isPaused(): boolean {
    return this.synth.paused;
  }

  // Event system
  on(event: string, callback: (event: SpeechEvent) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    this.eventListeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  private emit(event: SpeechEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => callback(event));
    }

    // Also emit to 'all' listeners
    const allListeners = this.eventListeners.get("all");
    if (allListeners) {
      allListeners.forEach((callback) => callback(event));
    }
  }

  // Check browser support
  static isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }
}

// Singleton instance
let instance: WebSpeechService | null = null;

export function getWebSpeechService(): WebSpeechService {
  if (!instance) {
    instance = new WebSpeechService();
  }
  return instance;
}
