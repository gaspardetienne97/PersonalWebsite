import { getWebSpeechService } from "./webSpeechApi";
import type { SpeechSettings, SpeechQueueItem } from "./types";
import type { PdfSentence } from "../pdf/types";

export class SpeechQueue {
  private queue: SpeechQueueItem[] = [];
  private currentIndex = -1;
  private isRunning = false;
  private speechService = getWebSpeechService();
  private settings: SpeechSettings;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(settings: SpeechSettings) {
    this.settings = settings;

    // Listen for speech events
    this.speechService.on("end", () => {
      if (this.isRunning) {
        this.playNext();
      }
    });

    this.speechService.on("error", (event) => {
      this.emit("error", event);
    });

    this.speechService.on("boundary", (event) => {
      this.emit("boundary", {
        ...event,
        sentenceId: this.getCurrentItem()?.id,
      });
    });
  }

  loadSentences(sentences: PdfSentence[]): void {
    this.queue = sentences.map((sentence, index) => ({
      id: sentence.id,
      text: sentence.text,
      pageNumber: sentence.pageNumber,
      sentenceIndex: index,
    }));
    this.currentIndex = -1;
  }

  appendSentences(sentences: PdfSentence[]): void {
    const newItems = sentences.map((sentence, index) => ({
      id: sentence.id,
      text: sentence.text,
      pageNumber: sentence.pageNumber,
      sentenceIndex: this.queue.length + index,
    }));
    this.queue.push(...newItems);
  }

  async play(): Promise<void> {
    if (this.speechService.isPaused) {
      this.speechService.resume();
      this.isRunning = true;
      this.emit("resume", null);
      return;
    }

    if (this.isRunning) return;

    this.isRunning = true;
    await this.speechService.initialize();

    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    }

    await this.playNext();
  }

  private async playNext(): Promise<void> {
    if (!this.isRunning) return;

    if (this.currentIndex >= this.queue.length) {
      this.isRunning = false;
      this.emit("complete", null);
      return;
    }

    const item = this.queue[this.currentIndex];
    this.emit("sentenceStart", item);

    try {
      await this.speechService.speak(item.text, this.settings, item.id);
      this.currentIndex++;
    } catch (error) {
      console.error("Speech error:", error);
    }
  }

  pause(): void {
    this.speechService.pause();
    this.isRunning = false;
    this.emit("pause", null);
  }

  stop(): void {
    this.speechService.cancel();
    this.isRunning = false;
    this.currentIndex = -1;
    this.emit("stop", null);
  }

  skipForward(): void {
    if (this.currentIndex < this.queue.length - 1) {
      this.speechService.cancel();
      this.currentIndex++;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }

  skipBackward(): void {
    if (this.currentIndex > 0) {
      this.speechService.cancel();
      this.currentIndex--;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }

  jumpToSentence(sentenceId: string): void {
    const index = this.queue.findIndex((item) => item.id === sentenceId);
    if (index >= 0) {
      this.speechService.cancel();
      this.currentIndex = index;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }

  jumpToPage(pageNumber: number): void {
    const index = this.queue.findIndex((item) => item.pageNumber === pageNumber);
    if (index >= 0) {
      this.speechService.cancel();
      this.currentIndex = index;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }

  updateSettings(settings: Partial<SpeechSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getCurrentItem(): SpeechQueueItem | null {
    return this.queue[this.currentIndex] || null;
  }

  getProgress(): { current: number; total: number; percentage: number } {
    const current = Math.max(0, this.currentIndex);
    const total = this.queue.length;
    const percentage = total > 0 ? (current / total) * 100 : 0;

    return { current, total, percentage };
  }

  get isPlaying(): boolean {
    return this.isRunning && !this.speechService.isPaused;
  }

  get isPaused(): boolean {
    return this.speechService.isPaused;
  }

  // Event system
  on(event: string, callback: (data: any) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    this.eventListeners.get(event)!.add(callback);

    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}
