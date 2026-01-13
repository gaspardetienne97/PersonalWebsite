import type { TimingWindows, VelocitySettings } from './score.js';
import type { ThemeId } from './theme.js';

export interface PracticeModeSettings {
	noFail: boolean;
	waitMode: boolean;
	waitModeTimeout: number | null; // ms, null = infinite
}

export interface MetronomeSettings {
	enabled: boolean;
	volume: number; // 0-100
	accentBeat1: boolean;
	subdivision: 1 | 2 | 4; // quarter, 8th, 16th
	sound: 'click' | 'woodblock' | 'beep';
}

export interface CountInSettings {
	enabled: boolean;
	bars: 0 | 1 | 2 | 4;
	audible: boolean;
	visual: boolean;
}

export interface AppSettings {
	// Display
	theme: ThemeId;
	reduceAnimations: boolean;

	// MIDI
	midiDeviceId: string | null;
	padMappingId: string;
	customPadMapping: Record<number, number> | null;

	// Scoring
	timingWindows: TimingWindows;
	velocitySettings: VelocitySettings;

	// Practice
	practiceMode: PracticeModeSettings;
	metronome: MetronomeSettings;
	countIn: CountInSettings;

	// Audio
	masterVolume: number; // 0-100
	drumVolume: number; // 0-100
	backingVolume: number; // 0-100
}

export const DEFAULT_SETTINGS: AppSettings = {
	theme: 'dark',
	reduceAnimations: false,
	midiDeviceId: null,
	padMappingId: 'gm',
	customPadMapping: null,
	timingWindows: { perfect: 25, good: 50, miss: 100 },
	velocitySettings: { enabled: false, tolerance: 20, weight: 0.3 },
	practiceMode: { noFail: true, waitMode: false, waitModeTimeout: null },
	metronome: { enabled: false, volume: 50, accentBeat1: true, subdivision: 1, sound: 'click' },
	countIn: { enabled: true, bars: 1, audible: true, visual: true },
	masterVolume: 80,
	drumVolume: 100,
	backingVolume: 70
};
