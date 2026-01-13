export type HitStatus = 'perfect' | 'good' | 'early' | 'late' | 'miss';

export interface NoteResult {
	expectedTime: number;
	expectedNote: number;
	expectedVelocity: number;
	actualTime: number | null;
	actualNote: number | null;
	actualVelocity: number | null;
	timingOffset: number;
	velocityDiff: number;
	status: HitStatus;
	points: number;
}

export interface TimingWindows {
	perfect: number; // ms
	good: number; // ms
	miss: number; // ms
}

export interface VelocitySettings {
	enabled: boolean;
	tolerance: number; // 0-127
	weight: number; // 0-1 (percentage of score)
}

export interface SessionScore {
	totalNotes: number;
	notesPlayed: number;
	perfectHits: number;
	goodHits: number;
	earlyHits: number;
	lateHits: number;
	misses: number;
	accuracy: number;
	averageTiming: number;
	currentStreak: number;
	maxStreak: number;
	grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
	totalPoints: number;
	maxPoints: number;
}

export const DEFAULT_TIMING_WINDOWS: TimingWindows = {
	perfect: 25,
	good: 50,
	miss: 100
};

export const DEFAULT_VELOCITY_SETTINGS: VelocitySettings = {
	enabled: false,
	tolerance: 20,
	weight: 0.3
};

export function calculateGrade(accuracy: number): SessionScore['grade'] {
	if (accuracy >= 95) return 'S';
	if (accuracy >= 85) return 'A';
	if (accuracy >= 75) return 'B';
	if (accuracy >= 65) return 'C';
	if (accuracy >= 50) return 'D';
	return 'F';
}
