import { SpeechQueue } from '$lib/services/tts/speechQueue';
import { getWebSpeechService } from '$lib/services/tts/webSpeechApi';
import type { Voice, SpeechSettings } from '$lib/services/tts/types';
import type { PdfSentence } from '$lib/services/pdf/types';

class AudioStore {
	isPlaying = $state(false);
	isPaused = $state(false);
	isInitialized = $state(false);
	voices = $state<Voice[]>([]);
	selectedVoice = $state<Voice | null>(null);
	rate = $state(1);
	pitch = $state(1);
	volume = $state(1);
	currentSentenceId = $state<string | null>(null);
	currentPageNumber = $state(1);
	progress = $state({ current: 0, total: 0, percentage: 0 });
	error = $state<string | null>(null);

	private speechQueue: SpeechQueue | null = null;
	private speechService = typeof window !== 'undefined' ? getWebSpeechService() : null;

	private getSettings(): SpeechSettings {
		return {
			voice: this.selectedVoice,
			rate: this.rate,
			pitch: this.pitch,
			volume: this.volume
		};
	}

	async initialize() {
		if (!this.speechService) return;

		try {
			await this.speechService.initialize();
			const voiceList = this.speechService.getVoices();
			const defaultVoice = this.speechService.getDefaultVoice();

			this.isInitialized = true;
			this.voices = voiceList;
			this.selectedVoice = defaultVoice;

			// Create speech queue with initial settings
			this.speechQueue = new SpeechQueue(this.getSettings());

			// Set up event listeners
			this.speechQueue.on('sentenceStart', (item) => {
				this.currentSentenceId = item.id;
				this.currentPageNumber = item.pageNumber;
				this.progress = this.speechQueue!.getProgress();
			});

			this.speechQueue.on('pause', () => {
				this.isPlaying = false;
				this.isPaused = true;
			});

			this.speechQueue.on('resume', () => {
				this.isPlaying = true;
				this.isPaused = false;
			});

			this.speechQueue.on('complete', () => {
				this.isPlaying = false;
				this.isPaused = false;
				this.currentSentenceId = null;
			});

			this.speechQueue.on('stop', () => {
				this.isPlaying = false;
				this.isPaused = false;
				this.currentSentenceId = null;
				this.progress = { current: 0, total: 0, percentage: 0 };
			});

			this.speechQueue.on('error', (event) => {
				this.error = event.error;
			});
		} catch (err) {
			this.error = 'Failed to initialize speech synthesis';
		}
	}

	loadSentences(sentences: PdfSentence[]) {
		if (!this.speechQueue) return;
		this.speechQueue.loadSentences(sentences);
		this.progress = this.speechQueue.getProgress();
	}

	appendSentences(sentences: PdfSentence[]) {
		if (!this.speechQueue) return;
		this.speechQueue.appendSentences(sentences);
		this.progress = this.speechQueue.getProgress();
	}

	async play() {
		if (!this.speechQueue) return;

		this.isPlaying = true;
		this.isPaused = false;
		await this.speechQueue.play();
	}

	pause() {
		if (!this.speechQueue) return;
		this.speechQueue.pause();
	}

	stop() {
		if (!this.speechQueue) return;
		this.speechQueue.stop();
	}

	skipForward() {
		if (!this.speechQueue) return;
		this.speechQueue.skipForward();
	}

	skipBackward() {
		if (!this.speechQueue) return;
		this.speechQueue.skipBackward();
	}

	jumpToSentence(sentenceId: string) {
		if (!this.speechQueue) return;
		this.speechQueue.jumpToSentence(sentenceId);
	}

	jumpToPage(pageNumber: number) {
		if (!this.speechQueue) return;
		this.speechQueue.jumpToPage(pageNumber);
	}

	setVoice(voice: Voice) {
		this.selectedVoice = voice;
		this.speechQueue?.updateSettings({ voice });
	}

	setRate(newRate: number) {
		const clampedRate = Math.max(0.1, Math.min(10, newRate));
		this.rate = clampedRate;
		this.speechQueue?.updateSettings({ rate: clampedRate });
	}

	setPitch(newPitch: number) {
		const clampedPitch = Math.max(0, Math.min(2, newPitch));
		this.pitch = clampedPitch;
		this.speechQueue?.updateSettings({ pitch: clampedPitch });
	}

	setVolume(newVolume: number) {
		const clampedVolume = Math.max(0, Math.min(1, newVolume));
		this.volume = clampedVolume;
		this.speechQueue?.updateSettings({ volume: clampedVolume });
	}

	getVoicesByLanguage(langCode: string): Voice[] {
		return this.speechService?.getVoicesByLanguage(langCode) || [];
	}

	reset() {
		this.speechQueue?.stop();
		this.isPlaying = false;
		this.isPaused = false;
		this.currentSentenceId = null;
		this.currentPageNumber = 1;
		this.progress = { current: 0, total: 0, percentage: 0 };
		this.error = null;
	}
}

export const audioStore = new AudioStore();
