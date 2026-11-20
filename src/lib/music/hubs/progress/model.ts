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
import { formatList, intlLocale } from "@repo/i18n/format";
import { m } from "@repo/i18n/messages.js";
import { getLocale } from "@repo/i18n/runtime.js";

/** Checked attempts a skill needs before its estimate gets a verdict (same bar as the coach). */
export const MIN_EVIDENCE = COACH_MIN_ATTEMPTS;
export const PICKS_CAP = 8;

export const ASSISTANCE_LABEL: Record<Assistance, string> = {
  get independent() {
    return m.music_hubs_assist_independent();
  },
  get guided() {
    return m.music_hubs_assist_guided();
  },
  get hinted() {
    return m.music_hubs_assist_hinted();
  },
  get "self-assessed"() {
    return m.music_hubs_assist_self();
  },
};

export const INPUT_LABEL: Record<InputSource | "mixed", string> = {
  midi: "MIDI",
  get audio() {
    return m.music_hubs_input_audio();
  },
  get onscreen() {
    return m.music_hubs_input_onscreen();
  },
  get click() {
    return m.music_hubs_input_click();
  },
  get mixed() {
    return m.music_hubs_input_mixed();
  },
};

export const SOURCE_LABEL: Record<SessionSource, string> = {
  get "free-practice"() {
    return m.music_hubs_source_free();
  },
  get "daily-routine"() {
    return m.music_hubs_source_daily();
  },
  get song() {
    return m.music_hubs_source_song();
  },
  get drill() {
    return m.music_hubs_source_drill();
  },
  get jam() {
    return m.music_hubs_source_jam();
  },
};

export const CAPABILITY_LABEL = {
  get pitch() {
    return m.music_hubs_cap_pitch();
  },
  get rhythm() {
    return m.music_hubs_cap_rhythm();
  },
  get harmony() {
    return m.music_hubs_cap_harmony();
  },
  get reading() {
    return m.music_hubs_cap_reading();
  },
  get technique() {
    return m.music_hubs_cap_technique();
  },
  get ear() {
    return m.music_hubs_cap_ear();
  },
};

export const pct = (v: number) => m.music_hubs_pct({ n: Math.round(v * 100) });
/** Signed change with a real minus sign; "no change" at zero. */
export const signed = (n: number, unit = "") =>
  n === 0 ? m.music_hubs_no_change() : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`;

/** Intl's relative time, or the app's own words in Haitian Creole, which Intl has no data for. */
function relative(n: number, unit: "day" | "week" | "month"): string {
  if (getLocale() === "ht" && n <= 0) {
    if (unit === "day" && n === 0) return m.music_hubs_rel_today();
    if (unit === "day" && n === -1) return m.music_hubs_rel_yesterday();
    const count = -n;
    if (unit === "day") return m.music_hubs_rel_days({ count });
    return unit === "week" ? m.music_hubs_rel_weeks({ count }) : m.music_hubs_rel_months({ count });
  }
  return new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" }).format(n, unit);
}
/** "today", "yesterday", "3 days ago", "2 weeks ago" by local calendar day. */
export function relativeDay(ms: number, now: number): string {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const days = Math.round(day(now) - day(ms));
  if (days < 14) return relative(-days, "day");
  if (days < 60) return relative(-Math.floor(days / 7), "week");
  return relative(-Math.floor(days / 30), "month");
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
  if (d) return d.mode ? m.music_hubs_pair({ a: d.entry.title, b: d.mode }) : d.entry.title;
  const s = id.replace(/[._-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** A session named for what was practised: its drills in order, two named, then a count. */
export function sessionTitle(session: PracticeSession): string {
  const titles = [...new Set(session.runs.map((r) => exerciseTitle(r.exerciseId)))];
  if (!titles.length) return SOURCE_LABEL[session.source];
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return m.music_hubs_session_two({ a: titles[0], b: titles[1] });
  return m.music_hubs_session_more({ a: titles[0], b: titles[1], count: titles.length - 2 });
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
  const lead = falling[0].skill.id === focusId ? m.music_hubs_falling_it() : falling[0].skill.name;
  return falling.length > 1
    ? m.music_hubs_falling_many({ lead, count: falling.length - 1 })
    : m.music_hubs_falling_one({ lead });
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
    return { kind: "best", text: m.music_hubs_delta_best({ prev: then }) };
  if (now > then) return { kind: "up", text: m.music_hubs_delta_up({ prev: then }) };
  if (now < then) return { kind: "down", text: m.music_hubs_delta_down({ prev: then }) };
  return { kind: "same", text: m.music_hubs_delta_same() };
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
  if (!names.length) return m.music_hubs_input_click();
  return formatList(names);
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
  if (s < 5) return m.music_hubs_dur_under5();
  if (s < 60) return m.music_hubs_dur_sec({ s });
  const min = Math.round(s / 60);
  if (min < 60) return m.music_hubs_minutes_short({ minutes: min });
  const h = Math.floor(min / 60);
  return min % 60
    ? m.music_hubs_dur_hours_min({ h, min: min % 60 })
    : m.music_hubs_dur_hours({ h });
}

/** A week's or a day's minutes as a figure that never undersells it: 1 min over three sessions reads "under 2 min". */
export const minutesText = (minutes: number, sessions: number) =>
  sessions && minutes < 2 ? m.music_hubs_under_2_min() : m.music_hubs_minutes_short({ minutes });

/**
 * A skill row's one line, both measures named so they never read as one contradicting the other:
 * "80% right on 10 answers, today. Mastery 14%: grows with Check runs." Accuracy counts every
 * answer; mastery moves only on answers in Check mode, so it says so when it lags.
 */
export function skillCaption(r: SkillRow, now: number): string {
  // Mastery is the row's headline number; this line is the other measure, labelled as what it is.
  const when = r.lastPracticed ? `, ${relativeDay(r.lastPracticed, now)}` : "";
  const tries =
    r.accuracy !== undefined
      ? m.music_hubs_caption_all({ pct: pct(r.accuracy), count: r.attempts, when })
      : m.music_hubs_caption_checked({ count: r.checked, when });
  const mastery =
    r.estimate === undefined
      ? m.music_hubs_caption_no_score()
      : r.umbrella && !r.direct
        ? m.music_hubs_caption_average()
        : r.checked < MIN_EVIDENCE
          ? m.music_hubs_caption_early({ count: MIN_EVIDENCE })
          : "";
  return mastery ? `${tries} ${mastery}` : tries;
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
 *
 * Path text arrives translated (`pathString`), so the English wording rules apply only in
 * English. In another language a parenthetical or a sentence that names an N code goes whole,
 * whatever words surround it, and the T and S codes read as numbered steps in that language.
 */
export function plainPathText(text: string): string {
  const english = getLocale() === "en";
  const t = english
    ? text
        .replace(/\s*\([^()]*\bN\d+\b[^()]*is still to come\)/g, "")
        .replace(
          /(^|(?<=[.!?]\s))[^.!?]*(\bwaits? for N\d+|\bis still to come)[^.!?]*[.!?]\s*/g,
          "",
        )
        .replace(/ until N\d+\b/g, "")
        .replace(
          /(\d+%) over (\d+) items, on two days/g,
          "Score $1 on $2 questions, on two different days",
        )
    : text
        .replace(/\s*\([^()]*\bN\d+\b[^()]*\)/g, "")
        .replace(/(^|(?<=[.!?]\s))[^.!?]*\bN\d+\b[^.!?]*[.!?]\s*/g, "");
  return t
    .replace(/ \(N\d+\)/g, "")
    .replace(/\bCircle T-(\d+)/g, (_, n: string) => m.music_hubs_paths_code_circle({ n }))
    .replace(/\bStudio S-(\d+)/g, (_, n: string) => m.music_hubs_paths_code_studio({ n }))
    .replace(/\b[TS]-(\d+)\b/g, (_, n: string) => m.music_hubs_paths_code_step({ n }))
    .replace(/^H\d+ /, "")
    .trim();
}
