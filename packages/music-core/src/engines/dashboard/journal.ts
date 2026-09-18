import type { InstrumentId, PracticeSession, UnixMs } from "@repo/music-core/domain";
import { unixMs } from "@repo/music-core/domain";
import {
  hasComparableInput,
  isRunComparisonTag,
  lastRunReference,
  meanPartialCredit,
} from "@repo/music-core/engines/sessions";

/** Assistance as the journal says it, never as a grade of the player. */
const ASSISTANCE_LABELS = {
  independent: "unaided",
  hinted: "hinted",
  guided: "guided",
  "self-assessed": "self-rated",
} as const;

export type AssistanceLabel = (typeof ASSISTANCE_LABELS)[keyof typeof ASSISTANCE_LABELS];

export interface JournalRun {
  /** The session id, so the entry keys and links back to the journal page. */
  id: string;
  title: string;
  at: UnixMs;
  minutes: number;
  instrument?: InstrumentId;
  attempts: number;
  accuracyPercent: number;
  assistance: AssistanceLabel[];
  /** Points against the last run with the same recorded setup, when there is one. */
  deltaPercent?: number;
  note?: string;
}

export interface JournalDay {
  /** Local ISO day (YYYY-MM-DD). */
  day: string;
  at: UnixMs;
  minutes: number;
  runs: JournalRun[];
}

export interface PracticeJournalView {
  /** Newest day first; only days with a session. */
  days: JournalDay[];
  /** Seven local days ending today, oldest first. */
  week: { day: string; at: UnixMs; minutes: number }[];
  nextTime?: { text: string; at: UnixMs };
  totalMinutes: number;
  sessionCount: number;
}

export interface BuildPracticeJournalArgs {
  sessions: PracticeSession[];
  instrument?: InstrumentId;
  now?: UnixMs;
  /** How far back the journal reaches, in local days. */
  days?: number;
}

/**
 * The Sessions view's record: what was practised, on which day, with how much
 * assistance, and whether the same setup improved. Comparisons reuse the drill
 * summaries' rule — only runs carrying the same recorded setup are paired.
 */
export function buildPracticeJournal(args: BuildPracticeJournalArgs): PracticeJournalView {
  const now = args.now ?? unixMs(Date.now());
  const horizon = startOfLocalDay(now) - ((args.days ?? 14) - 1) * DAY_MS;
  const scoped = args.sessions
    // An unlabelled session still belongs in the record; it is never hidden by
    // the instrument filter, only named as unknown.
    .filter(
      (session) =>
        !args.instrument ||
        session.instrument === undefined ||
        session.instrument === args.instrument,
    )
    .filter((session) => session.startTime >= horizon && session.startTime <= now)
    .sort((a, b) => b.startTime - a.startTime);

  const byDay = new Map<string, JournalDay>();
  for (const session of scoped) {
    const day = localIsoDay(session.startTime);
    const entry = byDay.get(day) ?? {
      day,
      at: unixMs(startOfLocalDay(session.startTime)),
      minutes: 0,
      runs: [],
    };
    entry.minutes += sessionMinutes(session);
    entry.runs.push(journalRun(session, args.sessions));
    byDay.set(day, entry);
  }

  const days = [...byDay.values()];
  const reflection = scoped.find((session) => session.nextTime?.trim());

  return {
    days,
    week: weekMinutes(scoped, now),
    ...(reflection === undefined
      ? {}
      : { nextTime: { text: reflection.nextTime!.trim(), at: reflection.startTime } }),
    totalMinutes: days.reduce((total, day) => total + day.minutes, 0),
    sessionCount: scoped.length,
  };
}

function journalRun(session: PracticeSession, all: PracticeSession[]): JournalRun {
  const setup = session.tags.filter(isRunComparisonTag);
  // The drill summaries' guard, not a looser one: a run is only comparable when
  // it names a variant, a real tempo, and the source, instrument and assistance
  // behind every attempt. Unlabelled runs serialise to the same input tag and
  // would otherwise match each other.
  const baseline = comparable(session, setup)
    ? lastRunReference(all, setup, session.startTime)
    : undefined;
  const accuracy = meanPartialCredit(session.scoringEvents);

  return {
    id: session.id,
    title: runTitle(session),
    at: session.startTime,
    minutes: sessionMinutes(session),
    ...(session.instrument === undefined ? {} : { instrument: session.instrument }),
    attempts: session.scoringEvents.length,
    accuracyPercent: Math.round(accuracy * 100),
    assistance: assistanceLabels(session),
    ...(baseline === undefined
      ? {}
      : { deltaPercent: Math.round((accuracy - baseline.accuracy) * 100) }),
    ...(session.notes?.trim() ? { note: session.notes.trim() } : {}),
  };
}

function comparable(session: PracticeSession, setup: string[]): boolean {
  const bpm = Number(
    setup.find((tag) => tag.startsWith(BPM_TAG_PREFIX))?.slice(BPM_TAG_PREFIX.length),
  );
  return (
    setup.some((tag) => tag.startsWith("v1:")) &&
    Number.isFinite(bpm) &&
    bpm > 0 &&
    hasComparableInput(session.scoringEvents)
  );
}

function assistanceLabels(session: PracticeSession): AssistanceLabel[] {
  const labels = new Set<AssistanceLabel>();
  for (const event of session.scoringEvents) {
    const label = event.assistance && ASSISTANCE_LABELS[event.assistance];
    if (label) labels.add(label);
  }
  return [...labels];
}

function runTitle(session: PracticeSession): string {
  const exercises = [...new Set(session.runs.map((run) => run.exerciseId))];
  if (exercises.length === 0) return SOURCE_LABELS[session.source];
  return exercises.map(humanize).join(" · ");
}

const SOURCE_LABELS: Record<PracticeSession["source"], string> = {
  "free-practice": "Free practice",
  "daily-routine": "Daily routine",
  song: "Song",
  drill: "Drill",
  jam: "Jam",
};

/** `technique.guitar.chord-changes` reads as "Chord changes" in a list of runs. */
function humanize(exerciseId: string): string {
  const leaf = exerciseId.split(".").at(-1) ?? exerciseId;
  const words = leaf.replace(/[-_]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function weekMinutes(
  sessions: PracticeSession[],
  now: UnixMs,
): { day: string; at: UnixMs; minutes: number }[] {
  const today = startOfLocalDay(now);
  return Array.from({ length: 7 }, (_item, index) => {
    const at = unixMs(startOfLocalDay(unixMs(today - (6 - index) * DAY_MS)));
    const day = localIsoDay(at);
    return {
      day,
      at,
      minutes: sessions
        .filter((session) => localIsoDay(session.startTime) === day)
        .reduce((total, session) => total + sessionMinutes(session), 0),
    };
  });
}

function sessionMinutes(session: PracticeSession): number {
  return Math.max(
    0,
    Math.round(((session.endTime ?? session.startTime) - session.startTime) / 60_000),
  );
}

function startOfLocalDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function localIsoDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const BPM_TAG_PREFIX = "comparison:bpm:";
const DAY_MS = 86_400_000;
