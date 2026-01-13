export interface LessonNote {
	time: number; // ms from start
	note: number; // MIDI note number
	velocity: number; // 0-127
	duration: number; // ms
	hand?: 'L' | 'R'; // optional hand indicator
}

export interface LessonSection {
	name: string;
	startTime: number;
	endTime: number;
}

export interface Lesson {
	id: string;
	version: number;
	title: string;
	description: string;
	author: string;
	difficulty: 'beginner' | 'intermediate' | 'advanced';
	genre: string;
	tags: string[];
	bpm: number;
	timeSignature: [number, number];
	duration: number;
	backingTrackUrl?: string;
	padMappingOverride?: Record<number, number>;
	tips: string[];
	notes: LessonNote[];
	sections?: LessonSection[];
}

export interface LessonMeta {
	id: string;
	title: string;
	difficulty: Lesson['difficulty'];
	genre: string;
	duration: number;
	bpm: number;
}
