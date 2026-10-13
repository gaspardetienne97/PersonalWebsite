// Deterministic local coach (catalog 5.5, 5.7; lessons 1: it must not claim more than it measured).
// Everything is scoped to one instrument and to independent attempts.
import type { Instrument, PracticeSession, SkillMastery } from "../types";
import { skillSummaries, rankWeakest, type SkillStats } from "./analytics";
import { isDueForReview } from "./mastery";
import { SKILL_GRAPH, skillName, type SkillGraph } from "./graph";
import { STEPS, stepForSkill, stepAllowed } from "./routine";

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

const pct = (v: number) => `${Math.round(v * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function coach(input: {
  instrument: Instrument;
  stats: Record<string, SkillStats>;
  mastery: Record<string, SkillMastery>;
  sessions: PracticeSession[];
  streak?: number;
  now: number;
  graph?: SkillGraph;
}): CoachAdvice {
  const { instrument, now } = input;
  const graph = input.graph ?? SKILL_GRAPH;
  const summaries = skillSummaries(input.stats, { instrument, independentOnly: true });
  const all = Object.values(summaries);
  const attempts = all.reduce((n, s) => n + s.attempts, 0);
  const correct = all.reduce((n, s) => n + s.correct, 0);
  const sessions = input.sessions.filter((s) => s.instrument === instrument);
  const hrefFor = (skillId: string) => {
    const step = stepForSkill(skillId);
    const route = step && stepAllowed(step, instrument) ? STEPS[step].route : "/music";
    return `${route}?instrument=${instrument}`;
  };

  const insights: string[] = [];
  if (attempts)
    insights.push(
      `${pct(correct / attempts)} correct across ${plural(attempts, "checked attempt")} on ${instrument}.`,
    );
  if (input.streak) insights.push(`${plural(input.streak, "day")} in your current streak.`);
  insights.push(`${plural(sessions.length, "saved session")} on ${instrument}.`);
  const due = all
    .filter((s) => input.mastery[s.skillId] && isDueForReview(input.mastery[s.skillId], now))
    .map((s) => skillName(s.skillId, graph));
  if (due.length)
    insights.push(
      `Due for review: ${due.slice(0, 3).join(", ")}${due.length > 3 ? ` and ${due.length - 3} more` : ""}.`,
    );

  if (attempts < COACH_MIN_ATTEMPTS) {
    return {
      headline: "Not measured yet",
      summary: `The coach needs ${COACH_MIN_ATTEMPTS} checked attempts on ${instrument} before it names a weak spot. You have ${attempts}.`,
      measured: false,
      insights,
      action: {
        label: "Pick a drill to check",
        href: `/music?tab=drills&instrument=${instrument}`,
      },
    };
  }

  const weakest = rankWeakest(all, COACH_MIN_SKILL_ATTEMPTS)[0];
  if (!weakest) {
    return {
      headline: "Spread thin so far",
      summary: `No skill on ${instrument} has ${COACH_MIN_SKILL_ATTEMPTS} checked attempts yet, so nothing is singled out.`,
      measured: false,
      insights,
      action: {
        label: "Pick a drill to check",
        href: `/music?tab=drills&instrument=${instrument}`,
      },
    };
  }

  const name = skillName(weakest.skillId, graph);
  const solid = weakest.accuracy >= 0.85;
  return {
    headline: solid ? `Everything measured is solid` : `Coach focus: ${name}`,
    summary: solid
      ? `Your lowest checked skill on ${instrument} is ${name} at ${pct(weakest.accuracy)} across ${weakest.attempts} attempts.`
      : `${name} is at ${pct(weakest.accuracy)} across ${weakest.attempts} checked attempts on ${instrument}, the lowest you have measured.`,
    measured: true,
    focus: {
      skillId: weakest.skillId,
      name,
      accuracy: weakest.accuracy,
      attempts: weakest.attempts,
    },
    insights,
    action: { label: `Practise ${name}`, href: hrefFor(weakest.skillId) },
  };
}
