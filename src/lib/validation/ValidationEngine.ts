import type {
	LessonNote,
	MidiNote,
	NoteResult,
	HitStatus,
	TimingWindows,
	VelocitySettings,
	SessionScore
} from '$lib/types/index.js';
import { DEFAULT_TIMING_WINDOWS, DEFAULT_VELOCITY_SETTINGS, calculateGrade } from '$lib/types/index.js';

export class ValidationEngine {
	private notes: LessonNote[] = [];
	private results: Map<number, NoteResult> = new Map(); // key = note index
	private currentIndex: number = 0;
	private startTime: number = 0;
	private timingWindows: TimingWindows;
	private velocitySettings: VelocitySettings;

	// Streak tracking
	private streak: number = 0;
	private maxStreak: number = 0;

	constructor(
		timingWindows: TimingWindows = DEFAULT_TIMING_WINDOWS,
		velocitySettings: VelocitySettings = DEFAULT_VELOCITY_SETTINGS
	) {
		this.timingWindows = timingWindows;
		this.velocitySettings = velocitySettings;
	}

	loadNotes(notes: LessonNote[]): void {
		this.notes = [...notes].sort((a, b) => a.time - b.time);
		this.reset();
	}

	reset(): void {
		this.results.clear();
		this.currentIndex = 0;
		this.streak = 0;
		this.maxStreak = 0;
		this.startTime = 0;
	}

	start(): void {
		this.startTime = performance.now();
	}

	setStartTime(time: number): void {
		this.startTime = time;
	}

	updateConfig(timingWindows?: TimingWindows, velocitySettings?: VelocitySettings): void {
		if (timingWindows) this.timingWindows = timingWindows;
		if (velocitySettings) this.velocitySettings = velocitySettings;
	}

	/**
	 * Process a user's note hit
	 */
	processNote(userNote: MidiNote, currentTime?: number): NoteResult | null {
		const relativeTime = (currentTime ?? userNote.timestamp) - this.startTime;

		// Find best matching expected note
		let bestMatch: { note: LessonNote; index: number; offset: number } | null = null;

		for (let i = this.currentIndex; i < this.notes.length; i++) {
			const expected = this.notes[i];
			const timeDiff = relativeTime - expected.time;

			// Stop if we're looking too far ahead
			if (timeDiff < -this.timingWindows.miss) break;

			// Skip notes that are too old
			if (timeDiff > this.timingWindows.miss) {
				continue;
			}

			// Skip if already matched
			if (this.results.has(i)) continue;

			// Check note match
			if (expected.note === userNote.note) {
				const absOffset = Math.abs(timeDiff);

				if (!bestMatch || absOffset < Math.abs(bestMatch.offset)) {
					bestMatch = { note: expected, index: i, offset: timeDiff };
				}
			}
		}

		if (!bestMatch) {
			// Wrong note or wrong time
			return null;
		}

		// Calculate status
		const absOffset = Math.abs(bestMatch.offset);
		let status: HitStatus;
		let points: number;

		if (absOffset <= this.timingWindows.perfect) {
			status = 'perfect';
			points = 100;
		} else if (absOffset <= this.timingWindows.good) {
			status = 'good';
			points = 80;
		} else if (bestMatch.offset < 0) {
			status = 'early';
			points = 50;
		} else {
			status = 'late';
			points = 50;
		}

		// Apply velocity scoring if enabled
		let velocityDiff = 0;
		if (this.velocitySettings.enabled) {
			velocityDiff = Math.abs(userNote.velocity - bestMatch.note.velocity);
			const velocityScore = Math.max(
				0,
				100 - (velocityDiff / this.velocitySettings.tolerance) * 100
			);

			points =
				points * (1 - this.velocitySettings.weight) +
				velocityScore * this.velocitySettings.weight;
			points = Math.round(points);
		}

		// Create result
		const result: NoteResult = {
			expectedTime: bestMatch.note.time,
			expectedNote: bestMatch.note.note,
			expectedVelocity: bestMatch.note.velocity,
			actualTime: relativeTime,
			actualNote: userNote.note,
			actualVelocity: userNote.velocity,
			timingOffset: bestMatch.offset,
			velocityDiff,
			status,
			points
		};

		// Store result
		this.results.set(bestMatch.index, result);

		// Update streak
		if (status === 'perfect' || status === 'good') {
			this.streak++;
			this.maxStreak = Math.max(this.maxStreak, this.streak);
		} else {
			this.streak = 0;
		}

		// Advance current index
		while (this.currentIndex < this.notes.length && this.results.has(this.currentIndex)) {
			this.currentIndex++;
		}

		return result;
	}

	/**
	 * Check for missed notes based on current time
	 */
	checkMissedNotes(currentTime: number): NoteResult[] {
		const relativeTime = currentTime - this.startTime;
		const missedResults: NoteResult[] = [];

		while (this.currentIndex < this.notes.length) {
			const expected = this.notes[this.currentIndex];

			// If note is past the miss window and not yet matched
			if (expected.time + this.timingWindows.miss < relativeTime && !this.results.has(this.currentIndex)) {
				const result: NoteResult = {
					expectedTime: expected.time,
					expectedNote: expected.note,
					expectedVelocity: expected.velocity,
					actualTime: null,
					actualNote: null,
					actualVelocity: null,
					timingOffset: Infinity,
					velocityDiff: 0,
					status: 'miss',
					points: 0
				};

				this.results.set(this.currentIndex, result);
				missedResults.push(result);
				this.streak = 0;
				this.currentIndex++;
			} else {
				break;
			}
		}

		return missedResults;
	}

	/**
	 * Get all results
	 */
	getResults(): NoteResult[] {
		return Array.from(this.results.values());
	}

	/**
	 * Get result for specific note index
	 */
	getResult(index: number): NoteResult | undefined {
		return this.results.get(index);
	}

	/**
	 * Get current score
	 */
	getScore(): SessionScore {
		const results = this.getResults();
		const totalNotes = this.notes.length;

		if (results.length === 0) {
			return {
				totalNotes,
				notesPlayed: 0,
				perfectHits: 0,
				goodHits: 0,
				earlyHits: 0,
				lateHits: 0,
				misses: 0,
				accuracy: 0,
				averageTiming: 0,
				currentStreak: this.streak,
				maxStreak: this.maxStreak,
				grade: 'F',
				totalPoints: 0,
				maxPoints: totalNotes * 100
			};
		}

		const counts = { perfect: 0, good: 0, early: 0, late: 0, miss: 0 };
		let totalTiming = 0;
		let timingCount = 0;
		let totalPoints = 0;

		for (const result of results) {
			counts[result.status]++;
			totalPoints += result.points;

			if (result.status !== 'miss') {
				totalTiming += result.timingOffset;
				timingCount++;
			}
		}

		const maxPoints = results.length * 100;
		const accuracy = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

		return {
			totalNotes,
			notesPlayed: results.length,
			perfectHits: counts.perfect,
			goodHits: counts.good,
			earlyHits: counts.early,
			lateHits: counts.late,
			misses: counts.miss,
			accuracy,
			averageTiming: timingCount > 0 ? Math.round(totalTiming / timingCount) : 0,
			currentStreak: this.streak,
			maxStreak: this.maxStreak,
			grade: calculateGrade(accuracy),
			totalPoints,
			maxPoints
		};
	}

	/**
	 * Get progress (0-100)
	 */
	getProgress(): number {
		if (this.notes.length === 0) return 0;
		return Math.round((this.currentIndex / this.notes.length) * 100);
	}

	/**
	 * Check if all notes have been processed
	 */
	isComplete(): boolean {
		return this.currentIndex >= this.notes.length;
	}
}
