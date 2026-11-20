// Deterministic local coach (catalog 5.5, 5.7; lessons 1: it must not claim more than it measured).
// Everything is scoped to one instrument and to independent attempts.
import type { Instrument, PracticeSession, SkillMastery } from "../types";
import { skillSummaries, rankWeakest, type SkillStats } from "./analytics";
import { isDueForReview } from "./mastery";
import { SKILL_GRAPH, skillName, type SkillGraph } from "./graph";
import { routeForSkill } from "./routine";
import { CATALOG } from "../content/catalog";
import { m } from "@repo/i18n/messages.js";

/** Independent attempts on the instrument before the coach will name any weak spot. */
export const COACH_MIN_ATTEMPTS = 5;
/** Independent attempts a single skill needs before it can be the focus. */
export const COACH_MIN_SKILL_ATTEMPTS = 3;

export interface CoachAdvice {
  headline: string;
  summary: string;
  measured: boolean;
  focus?: { skillId: string; name: string; accuracy: number; attempts: number };
  insights: string[];
  action: { label: string; href: string };
}

/**
 * A skill as a player names it. One drill mode records an umbrella skill and each
 * instrument's twin (technique.strings.note-finder, technique.guitar.note-finder), so those
 * take the mode's name ("Note finder") and a page never names one drill three ways.
 */
export function practiceName(skillId: string, graph: SkillGraph = SKILL_GRAPH): string {
  const tail = skillId.split(".").at(-1)!;
  for (const e of CATALOG)
    for (const m of e.modes)
      if (
        m.id === tail &&
        m.skillIds.includes(skillId) &&
        m.skillIds.filter((s) => s.endsWith(`.${tail}`)).length > 1
      )
        return m.label;
  return skillName(skillId, graph);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function coach(input: {
  instrument: Instrument;
  stats: Record<string, SkillStats>;
  mastery: Record<string, SkillMastery>;
  sessions: PracticeSession[];
  streak?: number;
  now: number;
  graph?: SkillGraph;
  /** How the instrument reads in copy ("MPC pads"); the id when absent. */
  instrumentName?: string;
  /**
   * Checked answers on the instrument, counted once each. Summing skills counts an answer
   * once per skill it touches, so callers with the events pass the real count.
   */
  checkedAnswers?: number;
}): CoachAdvice {
  const { instrument, now } = input;
  const on = input.instrumentName ?? instrument;
  const graph = input.graph ?? SKILL_GRAPH;
  const summaries = skillSummaries(input.stats, { instrument, independentOnly: true });
  const all = Object.values(summaries);
  const attempts = input.checkedAnswers ?? all.reduce((n, s) => n + s.attempts, 0);
  const sessions = input.sessions.filter((s) => s.instrument === instrument);
  const hrefFor = (skillId: string) =>
    `${routeForSkill(skillId, instrument)}?instrument=${instrument}`;

  // No instrument-wide percentage here: next to the focus skill's own figure it read as a
  // second, contradicting score for the same skill.
  const insights: string[] = [];
  if (input.streak) insights.push(m.music_cards_coach_streak({ count: input.streak }));
  insights.push(m.music_cards_coach_sessions({ count: sessions.length, on }));
  const due = [
    ...new Set(
      all
        .filter((s) => input.mastery[s.skillId] && isDueForReview(input.mastery[s.skillId], now))
        .map((s) => practiceName(s.skillId, graph)),
    ),
  ];
  if (due.length)
    insights.push(
      due.length > 3
        ? m.music_cards_coach_due_more({ skills: due.slice(0, 3).join(", "), count: due.length - 3 })
        : m.music_cards_coach_due({ skills: due.join(", ") }),
    );

  if (attempts < COACH_MIN_ATTEMPTS) {
    return {
      headline: m.music_cards_coach_unmeasured_title(),
      summary: m.music_cards_coach_unmeasured_text({ min: COACH_MIN_ATTEMPTS, on, count: attempts }),
      measured: false,
      insights,
      action: {
        label: m.music_cards_coach_pick_drill(),
        href: `/music?tab=drills&instrument=${instrument}`,
      },
    };
  }

  const weakest = rankWeakest(all, COACH_MIN_SKILL_ATTEMPTS)[0];
  if (!weakest) {
    return {
      headline: m.music_cards_coach_thin_title(),
      summary: m.music_cards_coach_thin_text({ on, min: COACH_MIN_SKILL_ATTEMPTS }),
      measured: false,
      insights,
      action: {
        label: m.music_cards_coach_pick_drill(),
        href: `/music?tab=drills&instrument=${instrument}`,
      },
    };
  }

  const name = practiceName(weakest.skillId, graph);
  const solid = weakest.accuracy >= 0.85;
  return {
    headline: solid ? m.music_cards_coach_solid_title() : m.music_cards_coach_focus_title({ name }),
    summary: (solid ? m.music_cards_coach_solid_text : m.music_cards_coach_weak_text)({
      on,
      name,
      pct: pct(weakest.accuracy),
      count: weakest.attempts,
    }),
    measured: true,
    focus: {
      skillId: weakest.skillId,
      name,
      accuracy: weakest.accuracy,
      attempts: weakest.attempts,
    },
    insights,
    action: { label: m.music_cards_coach_practise({ name }), href: hrefFor(weakest.skillId) },
  };
}
