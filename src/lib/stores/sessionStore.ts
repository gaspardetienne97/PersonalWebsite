import { writable, derived } from "svelte/store";
import type { Lesson, NoteResult, SessionScore } from "$lib/types/index.js";
import { calculateGrade } from "$lib/types/index.js";

export interface SessionState {
  // Lesson
  lesson: Lesson | null;
  isLoaded: boolean;

  // Playback
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number; // ms
  tempo: number; // BPM (can differ from lesson.bpm)
  tempoMultiplier: number; // 0.5 - 1.5

  // Loop
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;

  // Part filter
  partsEnabled: {
    kick: boolean;
    snare: boolean;
    hihat: boolean;
    toms: boolean;
    cymbals: boolean;
    percussion: boolean;
  };

  // Results
  results: NoteResult[];
  currentNoteIndex: number;
}

const initialState: SessionState = {
  lesson: null,
  isLoaded: false,
  isPlaying: false,
  isPaused: false,
  currentTime: 0,
  tempo: 120,
  tempoMultiplier: 1.0,
  loopEnabled: false,
  loopStart: null,
  loopEnd: null,
  partsEnabled: {
    kick: true,
    snare: true,
    hihat: true,
    toms: true,
    cymbals: true,
    percussion: true,
  },
  results: [],
  currentNoteIndex: 0,
};

export const session = writable<SessionState>(initialState);

export const score = derived(session, ($session): SessionScore => {
  const results = $session.results;
  const totalNotes = $session.lesson?.notes.length || 0;

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
      currentStreak: 0,
      maxStreak: 0,
      grade: "F",
      totalPoints: 0,
      maxPoints: totalNotes * 100,
    };
  }

  const counts = { perfect: 0, good: 0, early: 0, late: 0, miss: 0 };
  let totalTiming = 0;
  let timingCount = 0;
  let totalPoints = 0;
  let currentStreak = 0;
  let maxStreak = 0;

  for (const result of results) {
    counts[result.status]++;
    totalPoints += result.points;

    if (result.status !== "miss" && result.timingOffset !== Infinity) {
      totalTiming += result.timingOffset;
      timingCount++;
    }

    if (result.status === "perfect" || result.status === "good") {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
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
    currentStreak,
    maxStreak,
    grade: calculateGrade(accuracy),
    totalPoints,
    maxPoints,
  };
});

export const progress = derived(session, ($session) => {
  if (!$session.lesson) return 0;
  return Math.round(($session.currentNoteIndex / $session.lesson.notes.length) * 100);
});
