export interface Voice {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  voiceURI: string;
}

export interface SpeechSettings {
  voice: Voice | null;
  rate: number; // 0.1 to 10, default 1
  pitch: number; // 0 to 2, default 1
  volume: number; // 0 to 1, default 1
}

export interface SpeechState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentSentenceId: string | null;
  currentPageNumber: number;
  error: string | null;
}

export interface SpeechQueueItem {
  id: string;
  text: string;
  pageNumber: number;
  sentenceIndex: number;
}

export type SpeechEvent =
  | { type: "start"; sentenceId: string }
  | { type: "end"; sentenceId: string }
  | { type: "boundary"; charIndex: number; charLength: number }
  | { type: "error"; error: string }
  | { type: "pause" }
  | { type: "resume" };
