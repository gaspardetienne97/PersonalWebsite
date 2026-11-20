// The one daily routine builder (catalog 5.7). Nothing else defines routine steps.
import type { Instrument, PracticeSession, RunRecord, ScoringEvent, SkillMastery } from "../types";
import { DAY_MS, decayMastery, isDueForReview } from "./mastery";
import routineData from "../data/daily-routine.json";
import { CATALOG } from "../content/catalog";
import { ADVANCE } from "./advance";
import { m } from "@repo/i18n/messages.js";
import type { PathProgress } from "./paths";

export type StepId =
  | "ear"
  | "reading"
  | "rhythm"
  | "scales"
  | "spider"
  | "chord-perfect"
  | "two-hand"
  | "comping"
  | "mpc"
  | "aerophone"
  | "voicings"
  | "licks"
  | "chord-scales"
  | "phrases"
  | "jam";

/** "none" marks steps allowed in the plan built without an instrument. */
type Slot = Instrument | "none";

interface StepDef {
  label: string;
  description: string;
  route: string;
  for: Slot[];
}

type Message = (inputs?: object, options?: { locale?: "en" }) => string;
const msg = (key: string) =>
  (m as unknown as Record<string, Message | undefined>)[`music_cards_routine_${key}`];
/** A step's words in the player's language; the English source wins when the message is stale. */
const say = (key: string, english: string) => {
  const f = msg(key);
  return f && f({}, { locale: "en" }) === english ? f() : english;
};
const fromData = (id: string) => {
  const s =
    routineData.genericPlan.find((x) => x.id === id) ??
    Object.values(routineData.plansByInstrument)
      .flat()
      .find((x) => x.id === id)!;
  const key = id.replaceAll("-", "_");
  return {
    label: say(`${key}_label`, s.label),
    description: say(`${key}_text`, s.description),
  };
};

const PITCHED: Slot[] = ["piano", "guitar", "ukulele", "aerophone"];

export const STEPS: Record<StepId, StepDef> = {
  ear: { ...fromData("ear"), route: "/music/ear/mixed", for: ["none", ...PITCHED, "mpc", "voice"] },
  reading: { ...fromData("reading"), route: "/music/reading", for: ["none", ...PITCHED] },
  rhythm: {
    ...fromData("rhythm"),
    route: "/music/rhythm",
    for: ["none", ...PITCHED, "mpc", "voice"],
  },
  scales: { ...fromData("scales"), route: "/music/scales", for: ["none", "piano", "aerophone"] },
  spider: { ...fromData("spider"), route: "/music/fretboard", for: ["guitar", "ukulele"] },
  "chord-perfect": {
    ...fromData("chord-perfect"),
    route: "/music/chords",
    for: ["guitar", "ukulele"],
  },
  mpc: { ...fromData("mpc"), route: "/music/pads", for: ["mpc"] },
  aerophone: { ...fromData("aerophone"), route: "/music/aerophone", for: ["aerophone"] },
  "two-hand": {
    label: m.music_cards_routine_two_hand_label(),
    description: m.music_cards_routine_two_hand_text(),
    route: "/music/two-hand",
    for: ["piano"],
  },
  comping: {
    label: m.music_cards_routine_comping_label(),
    description: m.music_cards_routine_comping_text(),
    route: "/music/changes/comping",
    for: ["piano"],
  },
  voicings: {
    label: m.music_cards_routine_voicings_label(),
    description: m.music_cards_routine_voicings_text(),
    route: "/music/changes/voicings",
    for: ["piano"],
  },
  licks: {
    label: m.music_cards_routine_licks_label(),
    description: m.music_cards_routine_licks_text(),
    route: "/music/changes/licks",
    for: ["none", ...PITCHED],
  },
  "chord-scales": {
    label: m.music_cards_routine_chord_scales_label(),
    description: m.music_cards_routine_chord_scales_text(),
    route: "/music/changes/chord-scales",
    for: ["none", ...PITCHED],
  },
  phrases: {
    label: m.music_cards_routine_phrases_label(),
    description: m.music_cards_routine_phrases_text(),
    route: "/music/phrases",
    for: [...PITCHED, "mpc"],
  },
  jam: {
    label: m.music_cards_routine_jam_label(),
    description: m.music_cards_routine_jam_text(),
    route: "/music/changes/jam",
    for: ["none", ...PITCHED, "mpc", "voice"],
  },
};

const DEFAULTS: Record<Slot, StepId[]> = {
  none: routineData.genericPlan.map((s) => s.id as StepId),
  ...(Object.fromEntries(
    Object.entries(routineData.plansByInstrument).map(([k, v]) => [
      k,
      v.map((s) => s.id as StepId),
    ]),
  ) as Record<Instrument, StepId[]>),
};

/** Which routine step practises a skill. Every ear skill binds to the single ear step. */
export function stepForSkill(skillId: string): StepId | undefined {
  const rules: [RegExp, StepId][] = [
    [/^(pitch\.|ear\.|harmony\.(triad|seventh))/, "ear"],
    [/^reading\./, "reading"],
    [/^rhythm\./, "rhythm"],
    [/^technique\.scale/, "scales"],
    [/chord-perfect|chord-changes|open-chord-id/, "chord-perfect"],
    [/^technique\.(strings|guitar|ukulele)/, "spider"],
    [/^technique\.piano\.comping/, "comping"],
    [/^technique\.piano/, "two-hand"],
    [/^technique\.mpc/, "mpc"],
    [/^(technique\.aerophone|intonation\.)/, "aerophone"],
    [/^harmony\.ii-v-i\.licks/, "licks"],
    [/^harmony\.ii-v-i\.chord-scales/, "chord-scales"],
    [/^harmony\.ii-v-i/, "voicings"],
  ];
  return rules.find(([re]) => re.test(skillId))?.[1];
}

/**
 * The drill that practises one skill: the ear skills with a drill of their own go
 * straight to it, so "Practise Intervals" opens intervals, not the mixed review.
 * Everything else uses its routine step's route.
 */
export function routeForSkill(skillId: string, instrument?: Instrument): string {
  const ear: [RegExp, string][] = [
    [/^pitch\.interval/, "/music/ear/intervals"],
    [/^(pitch\.scale-degree|ear\.scale-degree)/, "/music/ear/scale-degrees"],
    [/^harmony\.(triad|seventh)/, "/music/ear/chord-qualities"],
    [/^ear\.cadences/, "/music/ear/cadences"],
    [/^ear\.melody-dictation/, "/music/ear/melody-dictation"],
    [/^ear\.repertoire-transfer/, "/music/ear/repertoire-transfer"],
  ];
  const step = stepForSkill(skillId);
  if (!step || !stepAllowed(step, instrument)) return "/music";
  return (step === "ear" && ear.find(([re]) => re.test(skillId))?.[1]) || STEPS[step].route;
}

export const stepAllowed = (step: StepId, instrument?: Instrument) =>
  STEPS[step].for.includes(instrument ?? "none");

export type Role = "review" | "focus" | "ear" | "variety" | "song" | "create";

export interface RoutineStep {
  /** 1-based position, also the `step` query parameter. */
  n: number;
  /** "path" for a focus block from the learning path, "song" for a shelf song. */
  id: StepId | "path" | "song";
  role: Role;
  label: string;
  description: string;
  minutes: number;
  href: string;
  reason: "due" | "warm-up" | "path" | "weak-spot" | "default";
  skillId?: string;
  /** A path block's skills, so an unlinked run on them still completes it. */
  skillIds?: string[];
  /** A song block's shelf key, so a Song Studio run on that song completes it. */
  shelf?: string;
}

export interface Routine {
  id: string;
  instrument?: Instrument;
  budgetMinutes: number;
  steps: RoutineStep[];
}

/** The path's next step, as the focus block takes it. */
export interface PathFocus {
  pathTitle: string;
  title: string;
  summary: string;
  href: string;
  skillIds: string[];
}

/** The path's shelf song, as the song block takes it. */
export interface SongFocus {
  title: string;
  description: string;
  href: string;
  shelf: string;
}

/**
 * The song block's song: from the current level's shelf, one you can open (`available`: in your
 * songs or downloaded). Not yet played first, then the one with the most days, then the easiest.
 */
export function pickShelfSong(
  progress: PathProgress,
  available: ReadonlySet<string>,
): SongFocus | undefined {
  const level = progress.levels?.find((l) => l.level.id === progress.currentLevel);
  const pick = level?.songs
    .filter((s) => available.has(s.key))
    .sort(
      (a, b) => +a.played - +b.played || b.days - a.days || (a.song.diff ?? 9) - (b.song.diff ?? 9),
    )[0];
  return (
    pick && {
      title: pick.song.title,
      description: m.music_cards_routine_song_text({
        artist: pick.song.artist,
        level: level!.level.id,
        path: progress.path.title,
      }),
      href: `/music/songs/shelf/${pick.key}`,
      shelf: pick.key,
    }
  );
}

/** The instrument a weekly split (Monday first) gives a weekday (0 is Monday), else the strip's. */
export const dayInstrument = (
  split: readonly (Instrument | null | undefined)[] | undefined,
  weekday: number,
  strip: Instrument,
): Instrument => split?.[weekday] ?? strip;

/** A routine's id for a pass of the set: the first pass keeps the plain id. */
export const passId = (id: string, pass: number) => (pass > 1 ? `${id}-pass${pass}` : id);

/** The latest pass of the set with a session of its own, 1 when none has started. */
export function currentPass(id: string, sessions: PracticeSession[]): number {
  let pass = 1;
  for (const s of sessions) {
    const m = s.routineId?.match(/-pass(\d+)$/);
    if (m && s.routineId === passId(id, Number(m[1]))) pass = Math.max(pass, Number(m[1]));
  }
  return pass;
}

export const BUDGET_OPTIONS = [10, 20, 30, 45, 60, 90] as const;
export type Budget = (typeof BUDGET_OPTIONS)[number];

/** Minutes per role, in set order. Each row sums to its budget. */
export const BLOCKS: Record<Budget, [Role, number][]> = {
  10: [
    ["review", 4],
    ["focus", 6],
  ],
  20: [
    ["review", 5],
    ["focus", 10],
    ["ear", 5],
  ],
  30: [
    ["review", 5],
    ["focus", 12],
    ["ear", 5],
    ["song", 8],
  ],
  45: [
    ["review", 8],
    ["focus", 15],
    ["ear", 7],
    ["song", 10],
    ["variety", 5],
  ],
  60: [
    ["review", 10],
    ["focus", 20],
    ["ear", 8],
    ["song", 12],
    ["variety", 10],
  ],
  90: [
    ["review", 10],
    ["focus", 30],
    ["ear", 10],
    ["song", 20],
    ["variety", 10],
    ["create", 10],
  ],
};

/** Any stored budget (an old 5, a 120) to the nearest option. */
export function snapBudget(minutes: number | undefined): Budget {
  const m = Number.isFinite(minutes) ? minutes! : routineData.defaultBudgetMinutes;
  return BUDGET_OPTIONS.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
}

/** Short tag for a block's role. */
export function roleLabel(step: Pick<RoutineStep, "role" | "reason" | "id">): string {
  if (step.role === "review")
    return step.reason === "warm-up" ? m.music_cards_role_warm_up() : m.music_cards_role_review();
  if (step.role === "focus")
    return step.reason === "path" ? m.music_cards_role_path() : m.music_cards_role_focus();
  if (step.role === "ear")
    return step.id === "reading" ? m.music_cards_role_reading() : m.music_cards_role_ear();
  return {
    song: m.music_cards_role_song,
    variety: m.music_cards_role_variety,
    create: m.music_cards_role_create,
  }[step.role]();
}

/** Sets the given params, keeping any query the href already has; `keep` ones only when absent. */
function withParams(href: string, set: Record<string, string>, keep: Record<string, string> = {}) {
  const u = new URL(href, "http://x");
  for (const [k, v] of Object.entries(keep)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  for (const [k, v] of Object.entries(set)) u.searchParams.set(k, v);
  return `${u.pathname}${u.search}${u.hash}`;
}

function linkHref(href: string, n: number, routineId: string, instrument?: Instrument) {
  const keep: Record<string, string> = {};
  if (instrument) keep.instrument = instrument;
  if (href.startsWith(STEPS.ear.route) && instrument === "voice") keep.answer = "voice";
  return withParams(href, { routine: routineId, step: String(n) }, keep);
}

export const stepHref = (step: StepId, n: number, routineId: string, instrument?: Instrument) =>
  linkHref(STEPS[step].route, n, routineId, instrument);

/** A drill as the set sees it: its route and mode, so Spider and Note finder are different drills. */
const routeOf = (href: string) => {
  const u = new URL(href, "http://x");
  const mode = u.searchParams.get("mode");
  return mode ? `${u.pathname}?mode=${mode}` : u.pathname;
};

/** Skills due for review (a ten-point drop since last measured), most overdue first. */
export function dueSkills(mastery: Record<string, SkillMastery>, now: number): string[] {
  const drop = (m: SkillMastery) => (m.lastMeasured ?? 0) - decayMastery(m, now).mastery;
  return Object.values(mastery)
    .filter((m) => isDueForReview(m, now))
    .sort((a, b) => drop(b) - drop(a))
    .map((m) => m.skillId);
}

/** The drill mode on `route` that practises `skillId`, when it is not the route's first mode. */
export function modeFor(route: string, skillId: string) {
  const modes = CATALOG.find((e) => e.route === route)?.modes ?? [];
  const i = modes.findIndex((m) => m.skillIds.includes(skillId));
  return i > 0 ? modes[i] : undefined;
}

const DRILL_STEPS = (Object.keys(STEPS) as StepId[]).filter((s) => s !== "phrases" && s !== "jam");

/**
 * A shaped session: each role from `BLOCKS` gets its block. Review takes the most overdue
 * skill (else a warm-up from the defaults), focus the path's next step (else the weak spot,
 * else a default), ear alternates ear and reading by day. Focus is filled first. Only review
 * may repeat a route; any other role with no fresh route gives its minutes to focus.
 */
export function buildRoutine(input: {
  id: string;
  instrument?: Instrument;
  budgetMinutes?: number;
  weakSkillIds?: string[];
  dueSkillIds?: string[];
  pathFocus?: PathFocus;
  /** The path's shelf song for the song block; Phrases when missing. */
  song?: SongFocus;
  /** dayKey (YYYY-MM-DD); odd days put reading in the ear slot. */
  day?: string;
}): Routine {
  const { id, instrument } = input;
  const budget = snapBudget(input.budgetMinutes);
  const defaults = DEFAULTS[instrument ?? "none"];
  // Ear and reading have their own slot, so focus and the warm-up reach for the rest first.
  const playing = [...defaults.filter((s) => s !== "ear" && s !== "reading"), ...defaults];
  const used = new Set<string>();
  type Pick = Omit<RoutineStep, "n" | "role" | "minutes">;
  const fromStep = (step: StepId, reason: RoutineStep["reason"], skillId?: string): Pick => {
    const mode = skillId ? modeFor(STEPS[step].route, skillId) : undefined;
    return {
      id: step,
      label: mode?.label ?? STEPS[step].label,
      description: STEPS[step].description,
      href: mode ? `${STEPS[step].route}?mode=${mode.id}` : STEPS[step].route,
      reason,
      skillId,
    };
  };
  /** First allowed candidate on an unused route; with `repeat`, else the first allowed one. */
  const choose = (
    cands: { step?: StepId; skillId?: string }[],
    reason: RoutineStep["reason"],
    repeat = false,
  ) => {
    const ok = cands.filter((c) => c.step && stepAllowed(c.step, instrument));
    const c =
      ok.find((c) => !used.has(routeOf(fromStep(c.step!, reason, c.skillId).href))) ??
      (repeat ? ok[0] : undefined);
    return c && fromStep(c.step!, reason, c.skillId);
  };
  const steps = (xs: StepId[]) => xs.map((step) => ({ step }));
  const odd = input.day ? Math.floor(Date.parse(input.day) / DAY_MS) % 2 === 1 : false;

  const fill: Record<Role, () => Pick | undefined> = {
    focus: () =>
      input.pathFocus
        ? {
            id: "path",
            label: input.pathFocus.title,
            description: m.music_cards_routine_next_on({
              path: input.pathFocus.pathTitle,
              summary: input.pathFocus.summary,
            }),
            href: input.pathFocus.href,
            reason: "path",
            skillIds: input.pathFocus.skillIds,
          }
        : (choose(
            (input.weakSkillIds ?? []).map((skillId) => ({ step: stepForSkill(skillId), skillId })),
            "weak-spot",
          ) ?? choose(steps(playing), "default", true)),
    review: () =>
      choose(
        (input.dueSkillIds ?? []).map((skillId) => ({ step: stepForSkill(skillId), skillId })),
        "due",
      ) ?? choose(steps(playing), "warm-up", true),
    ear: () => choose(steps(odd ? ["reading", "ear"] : ["ear", "reading"]), "default"),
    song: () =>
      input.song
        ? {
            id: "song",
            label: input.song.title,
            description: input.song.description,
            href: input.song.href,
            reason: "path",
            shelf: input.song.shelf,
          }
        : choose(steps(["phrases"]), "default"),
    variety: () => choose(steps([...defaults, ...DRILL_STEPS]), "default"),
    create: () => choose(steps(["jam"]), "default"),
  };

  const rows = BLOCKS[budget];
  const picks = new Map<Role, Pick>();
  let spare = 0;
  for (const role of ["focus", ...rows.map(([r]) => r).filter((r) => r !== "focus")] as Role[]) {
    const p = fill[role]();
    if (!p) {
      spare += rows.find(([r]) => r === role)?.[1] ?? 0;
      continue;
    }
    used.add(routeOf(p.href));
    picks.set(role, p);
  }
  return {
    id,
    instrument,
    budgetMinutes: budget,
    steps: rows
      .filter(([role]) => picks.has(role))
      .map(([role, minutes], i) => {
        const p = picks.get(role)!;
        return {
          ...p,
          n: i + 1,
          role,
          minutes: role === "focus" ? minutes + spare : minutes,
          href: linkHref(p.href, i + 1, id, instrument),
        };
      }),
  };
}

/** The step a finished run belongs to: its routine params, else the ear prefix, else its skills. */
function runMatchesStep(run: RunRecord, routine: Routine, step: RoutineStep): boolean {
  if (run.params.routine === routine.id) return Number(run.params.step) === step.n;
  if (step.shelf) return run.params.shelf === step.shelf;
  if (step.skillIds?.length)
    return run.skillIds.some((s) => step.skillIds!.some((k) => s === k || s.startsWith(`${k}.`)));
  if (step.id === "ear") return run.exerciseId.startsWith("ear.");
  if (run.exerciseId.startsWith("ear.")) return false;
  return [run.exerciseId, ...run.skillIds].some((s) => stepForSkill(s) === step.id);
}

const routineSessions = (routine: Routine, sessions: PracticeSession[]) =>
  sessions.filter((s) => s.routineId === routine.id);

/** Completed step numbers from the finished runs of this routine's sessions. */
export function completedSteps(routine: Routine, sessions: PracticeSession[]): number[] {
  const runs = routineSessions(routine, sessions).flatMap((s) => s.runs);
  return routine.steps
    .filter((step) => runs.some((r) => r.endedAt > 0 && runMatchesStep(r, routine, step)))
    .map((s) => s.n);
}

/**
 * Stars on the advance rule's lines: one at 70% (no step back), two at 85%, three for a run the
 * rule counts as clean (its `correct` at 85% or better), as on the results card. `null` when the
 * run was not scored (nothing heard).
 */
export function starsFor(score: number | undefined, clean = false): number | null {
  if (score === undefined) return null;
  if (clean && score >= ADVANCE.pass) return 3;
  return score >= ADVANCE.pass ? 2 : score >= ADVANCE.fail ? 1 : 0;
}

/** Each step's best stars from this routine's finished runs; a step with no scored run is left out. */
export function blockStars(routine: Routine, sessions: PracticeSession[]): Record<number, number> {
  const runs = routineSessions(routine, sessions).flatMap((s) => s.runs);
  const out: Record<number, number> = {};
  for (const step of routine.steps)
    for (const r of runs) {
      if (!(r.endedAt > 0 && runMatchesStep(r, routine, step))) continue;
      const s = starsFor(r.score, r.correct);
      if (s !== null) out[step.n] = Math.max(out[step.n] ?? 0, s);
    }
  return out;
}

export interface RoutineSummary {
  completedSteps: number;
  totalSteps: number;
  xp: number;
  /** Correct fraction of the routine's scoring events; undefined with no events. */
  accuracy?: number;
  durationMs: number;
  runs: RunRecord[];
  eventIds: string[];
  tags: string[];
}

export function routineSummary(
  routine: Routine,
  sessions: PracticeSession[],
  events: ScoringEvent[],
): RoutineSummary {
  const own = routineSessions(routine, sessions);
  const eventIds = own.flatMap((s) => s.eventIds);
  const ids = new Set(eventIds);
  const mine = events.filter((e) => ids.has(e.id));
  const end = (s: PracticeSession) =>
    s.endTime ?? Math.max(s.startTime, ...s.runs.map((r) => r.endedAt));
  return {
    completedSteps: completedSteps(routine, sessions).length,
    totalSteps: routine.steps.length,
    xp: own.reduce((sum, s) => sum + s.xp, 0),
    accuracy: mine.length ? mine.filter((e) => e.correct).length / mine.length : undefined,
    durationMs: own.reduce((sum, s) => sum + (end(s) - s.startTime), 0),
    runs: own.flatMap((s) => s.runs),
    eventIds,
    tags: [...new Set(own.flatMap((s) => s.tags))],
  };
}
