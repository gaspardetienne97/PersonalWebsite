// Pure projections behind the Progress and Journal pages. Views pass in the
// practice store's state, so the same functions back the tests.
import type {
  Assistance,
  InputSource,
  Instrument,
  Label,
  PracticeSession,
  SessionSource,
  Skill,
  SkillMastery,
} from "@repo/music-core";
import {
  SKILL_GRAPH,
  aggregateMastery,
  componentChildren,
  isUnlocked,
  skillName,
} from "@repo/music-core/progress/graph";
import { decayMastery, isDueForReview } from "@repo/music-core/progress/mastery";
import { onInstrument, skillSummaries, type SkillStats } from "@repo/music-core/progress/analytics";
import { STEPS, stepForSkill } from "@repo/music-core/progress/routine";
import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
import { addDays, dayKey, weekStart } from "@repo/music-core/progress/rewards";
import { sessionMinutes } from "@repo/music-core/progress/journal";
import { CATALOG, type CatalogEntry } from "@repo/music-core/content/catalog";

/** Checked attempts a skill needs before its estimate gets a verdict (same bar as the coach). */
export const MIN_EVIDENCE = COACH_MIN_ATTEMPTS;
export const PICKS_CAP = 8;

export const ASSISTANCE_LABEL: Record<Assistance, string> = {
  independent: "Checked",
  guided: "Practice",
  hinted: "With a hint",
  "self-assessed": "Self-rated",
};

export const INPUT_LABEL: Record<InputSource | "mixed", string> = {
  midi: "MIDI",
  audio: "Microphone",
  onscreen: "On screen",
  click: "Answer buttons",
  mixed: "Mixed input",
};

export const SOURCE_LABEL: Record<SessionSource, string> = {
  "free-practice": "Free practice",
  "daily-routine": "Today's set",
  song: "Song",
  drill: "Drill",
  jam: "Jam",
};

export const CAPABILITY_LABEL = {
  pitch: "Pitch",
  rhythm: "Rhythm",
  harmony: "Harmony",
  reading: "Reading",
  technique: "Technique",
  ear: "Ear",
} as const;

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n === 1 ? word : many}`;
/** Signed change with a real minus sign; "no change" at zero. */
export const signed = (n: number, unit = "") =>
  n === 0 ? "no change" : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
/** "today", "yesterday", "3 days ago", "2 weeks ago" by local calendar day. */
export function relativeDay(ms: number, now: number): string {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const days = Math.round(day(now) - day(ms));
  if (days < 14) return rtf.format(-days, "day");
  if (days < 60) return rtf.format(-Math.floor(days / 7), "week");
  return rtf.format(-Math.floor(days / 30), "month");
}

export const formatLabel = (l: Label | undefined) =>
  l === undefined ? "" : Array.isArray(l) ? l.join(", ") : String(l);

/**
 * The catalog drill that records `id`, and its mode's label when the drill's modes record
 * different exercises. Ukulele runs record the guitar ids' twins; read-and-tap runs record
 * one id per pattern.
 */
export function exerciseDrill(id: string): { entry: CatalogEntry; mode?: string } | undefined {
  const key = id.replace(/^technique\.ukulele\./, "technique.guitar.");
  const same = (x: string) =>
    x === key || (x.startsWith("rhythm.pattern.") && key.startsWith("rhythm.pattern."));
  for (const entry of CATALOG) {
    const m = entry.modes.find((m) => same(m.exerciseId));
    if (m) {
      const distinct = new Set(entry.modes.map((x) => x.exerciseId)).size > 1;
      return { entry, mode: distinct ? m.label : undefined };
    }
    if (same(entry.exerciseId)) return { entry };
  }
}

/** A run's drill as the Drills tab names it ("Fretboard: Note finder"); a tidied id otherwise. */
export const exerciseTitle = (id: string) => {
  const d = exerciseDrill(id);
  if (d) return d.mode ? `${d.entry.title}: ${d.mode}` : d.entry.title;
  const s = id.replace(/[._-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** A session named for what was practised: its drills in order, two named, then a count. */
export function sessionTitle(session: PracticeSession): string {
  const titles = [...new Set(session.runs.map((r) => exerciseTitle(r.exerciseId)))];
  if (!titles.length) return SOURCE_LABEL[session.source];
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;
}

/** The last `n` scores of one exercise, up to and including the run ending at `until`. */
export function scoreHistory(
  sessions: PracticeSession[],
  exerciseId: string,
  until: number,
  n = 8,
) {
  return sessions
    .flatMap((s) => s.runs)
    .filter((r) => r.exerciseId === exerciseId && r.score !== undefined && r.endedAt <= until)
    .sort((a, b) => a.endedAt - b.endedAt)
    .slice(-n)
    .map((r) => r.score!);
}

/**
 * Stats slices for one instrument. Attempts recorded with no instrument (answer buttons,
 * mixed runs) count everywhere, so an ear drill still shows under piano.
 */
export function scopedStats(
  stats: Record<string, SkillStats>,
  instrument?: Instrument,
): Record<string, SkillStats> {
  if (!instrument) return stats;
  return Object.fromEntries(Object.entries(stats).filter(([, s]) => onInstrument(s, instrument)));
}

export interface SkillRow {
  skill: Skill;
  /** Decayed estimate today (0..1); undefined with no mastery evidence. */
  estimate?: number;
  lastMeasured?: number;
  confidence: number;
  due: boolean;
  /** All attempts in scope, and the checked (independent) ones. */
  attempts: number;
  checked: number;
  accuracy?: number;
  lastPracticed?: number;
  unlocked: boolean;
  touched: boolean;
  /** Attempts landed on this skill directly (umbrella skills are only aggregated). */
  direct: boolean;
  /** Has component skills; its estimate is the mean of its parts. */
  umbrella: boolean;
  href: string;
}

export function practiceHref(skillId: string, instrument?: Instrument) {
  const step = stepForSkill(skillId);
  if (!step) return "/music?tab=drills";
  return instrument ? `${STEPS[step].route}?instrument=${instrument}` : STEPS[step].route;
}

export function skillRows(input: {
  stats: Record<string, SkillStats>;
  mastery: Record<string, SkillMastery>;
  instrument?: Instrument;
  now: number;
}): SkillRow[] {
  const { mastery, instrument, now } = input;
  const scoped = scopedStats(input.stats, instrument);
  const all = skillSummaries(scoped);
  const checked = skillSummaries(scoped, { independentOnly: true });
  return SKILL_GRAPH.skills
    .filter((s) => !s.deprecated)
    .map((skill) => {
      const id = skill.id;
      const umbrella = componentChildren(id, SKILL_GRAPH).length > 0;
      // An umbrella with no touched parts but its own evidence falls back to that evidence.
      const parts = aggregateMastery(id, mastery, SKILL_GRAPH, now);
      const own = umbrella && !parts && mastery[id] ? mastery[id] : undefined;
      const agg = parts ?? (own ? decayMastery(own, now) : undefined);
      const leaf = umbrella ? own : mastery[id];
      const sum = all[id];
      const attempts = sum?.attempts ?? 0;
      const touchedChildren =
        umbrella &&
        !!agg &&
        (!instrument || componentChildren(id, SKILL_GRAPH).some((c) => all[c]));
      return {
        skill,
        estimate: agg?.mastery,
        lastMeasured: leaf?.lastMeasured,
        confidence: agg?.confidence ?? 0,
        due: leaf ? isDueForReview(leaf, now) : false,
        attempts,
        // Umbrellas count the checked evidence of their parts (mastery observations).
        checked: umbrella && !attempts ? (agg?.observations ?? 0) : (checked[id]?.attempts ?? 0),
        accuracy: sum ? sum.accuracy : undefined,
        lastPracticed: sum?.lastPracticed || agg?.lastPracticed,
        unlocked: isUnlocked(id, mastery, SKILL_GRAPH, now),
        touched: attempts > 0 || touchedChildren || (!instrument && !!leaf),
        direct: attempts > 0,
        umbrella,
        href: practiceHref(id, instrument),
      };
    });
}

/**
 * What next: measured skills (5+ checked attempts) ranked by the decayed estimate, capped at 8,
 * split into falling (due for review) and holding; everything else touched is not measured yet.
 */
/** "X and 2 other skills dropped ten points..."; "It" when X is the focus skill named just before. */
export function fallingSentence(falling: SkillRow[], focusId?: string) {
  const lead = falling[0].skill.id === focusId ? "It" : falling[0].skill.name;
  const others = falling.length > 1 ? ` and ${plural(falling.length - 1, "other skill")}` : "";
  return `${lead}${others} dropped ten points or more since you last measured, so a short review comes first.`;
}

export function nextBuckets(rows: SkillRow[]) {
  const measured = rows
    .filter((r) => r.direct && r.checked >= MIN_EVIDENCE && r.estimate !== undefined)
    .sort((a, b) => a.estimate! - b.estimate!)
    .slice(0, PICKS_CAP);
  const unmeasured = rows
    .filter((r) => r.direct && r.checked < MIN_EVIDENCE)
    .sort((a, b) => (b.lastPracticed ?? 0) - (a.lastPracticed ?? 0));
  return {
    falling: measured.filter((r) => r.due),
    holding: measured.filter((r) => !r.due),
    unmeasured,
  };
}

/** Minutes per day for the ISO week (Monday first) containing `today`. */
export function weekMinutes(sessions: PracticeSession[], today: string) {
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const minutes = Math.round(
      sessions
        .filter((s) => dayKey(s.startTime) === day)
        .reduce((n, s) => n + sessionMinutes(s), 0),
    );
    return { day, minutes, future: day > today, today: day === today };
  });
}

/**
 * How a scored run compares with the earlier runs of the same exercise and setup: a new best, up
 * or down from the run before (in the score's own unit), or level. Nothing for a first run.
 */
export function runDelta(
  run: { id: string; exerciseId: string; setupKey: string; endedAt: number; score?: number },
  sessions: PracticeSession[],
): { kind: "best" | "up" | "down" | "same"; text: string } | undefined {
  if (run.score === undefined) return;
  const before = sessions
    .flatMap((s) => s.runs)
    .filter(
      (r) =>
        r.id !== run.id &&
        r.exerciseId === run.exerciseId &&
        r.setupKey === run.setupKey &&
        r.score !== undefined &&
        r.endedAt < run.endedAt,
    )
    .sort((a, b) => a.endedAt - b.endedAt);
  const prev = before.at(-1);
  if (!prev) return;
  const now = Math.round(run.score * 100);
  const then = Math.round(prev.score! * 100);
  if (now > Math.round(Math.max(...before.map((r) => r.score!)) * 100))
    return { kind: "best", text: `Best yet, up from ${then}%` };
  if (now > then) return { kind: "up", text: `Up from ${then}%` };
  if (now < then) return { kind: "down", text: `Down from ${then}%` };
  return { kind: "same", text: "Same as last time" };
}

/** A session's length as recorded: its end, else its last run's end. */
export const sessionMs = (s: PracticeSession) =>
  (s.endTime ?? Math.max(s.startTime, ...s.runs.map((r) => r.endedAt))) - s.startTime;

/**
 * Newest first, with each tap-length session (under 5 s, one answer or none, no note or tags)
 * folded into the session of the same drill just before it. Display only: storage keeps both.
 */
export function foldShort(
  sessions: PracticeSession[],
): { session: PracticeSession; folded: number }[] {
  const lead = (s: PracticeSession) => s.runs[0]?.exerciseId;
  const out: { session: PracticeSession; folded: number }[] = [];
  const asc = [...sessions].sort((a, b) => a.startTime - b.startTime);
  for (const s of asc) {
    const prev = out.at(-1);
    const tiny = sessionMs(s) < 5000 && s.eventIds.length <= 1 && !s.note && !s.tags.length;
    if (tiny && prev && lead(prev.session) && lead(prev.session) === lead(s)) prev.folded++;
    else out.push({ session: s, folded: 0 });
  }
  return out.reverse();
}

/** The instruments a session's runs used, named: "Piano", "Piano and Voice", or "Answer buttons". */
export function sessionInstruments(s: PracticeSession, label: Record<string, string>): string {
  const names = [
    ...new Set(
      [s.instrument, ...s.runs.map((r) => r.instrument)].filter((i): i is Instrument => !!i),
    ),
  ].map((i) => label[i]);
  if (!names.length) return "Answer buttons";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export interface SetupTrend {
  key: string;
  title: string;
  detail: string;
  scores: number[];
  first: number;
  last: number;
  best: number;
  lastAt: number;
}

/** Setups (exercise + setup key) with two or more scored runs, most recent first. */
export function setupTrends(sessions: PracticeSession[]): SetupTrend[] {
  const groups = new Map<string, PracticeSession["runs"]>();
  for (const r of sessions.flatMap((s) => s.runs)) {
    if (r.score === undefined) continue;
    const key = `${r.exerciseId}|${r.setupKey}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups]
    .filter(([, runs]) => runs.length >= 2)
    .map(([key, runs]) => {
      const sorted = [...runs].sort((a, b) => a.endedAt - b.endedAt);
      const scores = sorted.map((r) => r.score!);
      const r0 = sorted[0];
      const bpm = r0.params.bpm;
      const parts = [
        r0.skillIds[0] ? skillName(r0.skillIds[0]) : "",
        bpm ? `${bpm} BPM` : "",
        ASSISTANCE_LABEL[r0.assistance],
      ].filter(Boolean);
      return {
        key,
        title: exerciseTitle(r0.exerciseId),
        detail: parts.join(", "),
        scores,
        first: scores[0],
        last: scores.at(-1)!,
        best: Math.max(...scores),
        lastAt: sorted.at(-1)!.endedAt,
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

export const parseTags = (raw: string) => [
  ...new Set(
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  ),
];

/**
 * Practice time as a person reads it: seconds under a minute ("40 sec"), minutes under an hour,
 * then hours and minutes. Today, the journal and Sessions all use this, so a short set never
 * reads "0 min" next to blocks that clearly took time.
 */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  // Under five seconds is a tap or two, not a figure to read ("0 sec" beside 89% looks broken).
  if (s < 5) return "under 5 sec";
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** A week's or a day's minutes as a figure that never undersells it: 1 min over three sessions reads "under 2 min". */
export const minutesText = (minutes: number, sessions: number) =>
  sessions && minutes < 2 ? "under 2 min" : `${minutes} min`;

/**
 * A skill row's one line, both measures named so they never read as one contradicting the other:
 * "80% right on 10 answers, today. Mastery 14%: grows with Check runs." Accuracy counts every
 * answer; mastery moves only on answers in Check mode, so it says so when it lags.
 */
export function skillCaption(r: SkillRow, now: number): string {
  const tries =
    r.accuracy !== undefined
      ? `${pct(r.accuracy)} right on ${plural(r.attempts, "answer")}`
      : `${plural(r.checked, "answer")} in Check mode`;
  const when = r.lastPracticed ? `, ${relativeDay(r.lastPracticed, now)}` : "";
  const mastery =
    r.estimate === undefined
      ? "No mastery yet: it grows with Check runs"
      : `Mastery ${pct(r.estimate)}${
          r.umbrella && !r.direct
            ? ", the average of its parts"
            : r.estimate < (r.accuracy ?? 0)
              ? ": grows with Check runs"
              : ""
        }`;
  return `${tries}${when}. ${mastery}.`;
}

/**
 * The drill to draw for a coach pick: a weak interval or degree is drawn as that drill (the
 * coach's own link may be the mixed ear drill, which has no picture of its own).
 */
export function previewHref(skillId: string | undefined, fallback: string): string {
  const m = /^pitch\.(intervals?|scale-degrees?)(?:\.(.+))?$/.exec(skillId ?? "");
  if (!m) return fallback;
  if (m[1].startsWith("scale")) return "/music/ear/scale-degrees";
  return m[2] ? `/music/ear/intervals?intervals=${m[2]}` : "/music/ear/intervals";
}

/**
 * Path copy without the curriculum's working codes: "Circle T-2", "Studio S-3" and the "H1 "
 * numbering on harmony steps. Sentences about app features still to build ("waits for N1",
 * "is still to come") are dropped: a learner reads only what the step does today. The data
 * keeps the codes; the page says what they mean.
 */
export function plainPathText(text: string): string {
  return text
    .replace(/\s*\([^()]*\bN\d+\b[^()]*is still to come\)/g, "")
    .replace(/(^|(?<=[.!?]\s))[^.!?]*(\bwaits? for N\d+|\bis still to come)[^.!?]*[.!?]\s*/g, "")
    .replace(/ until N\d+\b/g, "")
    .replace(/ \(N\d+\)/g, "")
    .replace(/\bCircle T-(\d+)/g, "Circle of fifths step $1")
    .replace(/\bStudio S-(\d+)/g, "Studio ears step $1")
    .replace(/\b[TS]-(\d+)\b/g, "step $1")
    .replace(/^H\d+ /, "")
    .trim();
}
