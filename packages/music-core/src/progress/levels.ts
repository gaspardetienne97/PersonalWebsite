// Levelled paths (curriculum round 2): levels of steps, a song shelf per level and a level test.
// The JSON in data/paths/*.json is written from context/research/curriculum-2026-10/paths/*.md.
import type { Instrument, RunRecord } from "../types";
import { CATALOG, exerciseIdFor, rhythmExerciseId } from "../content/catalog";
import type { LearningPath, PathId, PathLink, PathStep } from "./paths";
import { dayKey } from "./rewards";
import type { LadderCriterion } from "./ladder";
import { m } from "@repo/i18n/messages.js";

type Message = (inputs?: object, options?: { locale?: "en" }) => string;
/**
 * A levelled path's title or subtitle in the player's language. The JSON is the source: its
 * translation is used only while the message's English still matches it, so an edited file shows
 * its own English rather than a stale translation.
 */
function pathText(id: string, part: "title" | "subtitle", english: string): string {
  const msg = (m as unknown as Record<string, Message | undefined>)[
    `music_cards_path_${id}_${part}`
  ];
  return msg && msg({}, { locale: "en" }) === english ? msg() : english;
}

export interface ScoreLink {
  label: string;
  url: string;
  /** A MuseScore official score (Pro). */
  official?: boolean;
}

export interface ShelfSong {
  /** Unique in its path; the shelf key is `<path>/<id>`. */
  id: string;
  title: string;
  artist: string;
  strand?: string;
  teaches: string;
  /** Key, tempo, chords or technique, as one line. */
  detail?: string;
  /** The record's tempo: a performance counts at 90% of it or faster. */
  bpm?: number;
  /** 1 easiest within the level. */
  diff?: number;
  scores: ScoreLink[];
  fallback?: ScoreLink;
}

export interface PathLevel {
  id: string;
  title: string;
  goal: string;
  adds?: string;
  /** Songs from the shelf to pass the level. */
  pick: number;
  shelf: ShelfSong[];
  test: string;
  stepIds: string[];
}

export interface RawLevelStep {
  /** The level's number and the step's, e.g. "1.2". */
  id: string;
  title: string;
  strand?: string;
  /** The drill and its setup; missing when the step needs a drill the app lacks. */
  href?: string;
  /** What the drill and setup are, in words. */
  setup: string;
  /** Done means. */
  done: string;
  skillIds?: string[];
  /** Defaults to what the href's drill records (exercisesForHref). */
  exerciseIds?: string[];
  /** Run params a run must carry to count (the phrase, the pattern, the shape). */
  match?: Record<string, string>;
  /** One evidence row per value of a run param, each to pass. */
  each?: { param: string; values: string[] };
  minAttempts?: number;
  minSessions?: number;
  minDays?: number;
  threshold?: number;
  minBpm?: number;
  minDifficulty?: number;
  /** A new drill or setting this step waits for, in one line. */
  needs?: string;
  /** Judged on the tune ladder: these rungs done on this many tunes (from `among` when given). */
  ladder?: LadderCriterion;
  /** Step ids (in this path) this one builds on. */
  requires?: string[];
  /** Step ids a pass here tests out (a placement check): they show as review, nothing locks. */
  covers?: string[];
  links?: PathLink[];
  feeds?: string;
}

export interface RawLevel {
  id: string;
  title: string;
  goal: string;
  adds?: string;
  pick?: number;
  steps: RawLevelStep[];
  shelf: ShelfSong[];
  test: string;
}

export interface RawLevelPath {
  id: PathId;
  title: string;
  subtitle: string;
  /** The external benchmark at the end, e.g. "JustinGuitar Grade 6". */
  benchmark?: string;
  instruments?: Instrument[];
  levels: RawLevel[];
}

// The song library is the Studio hub now (/music/library redirects there); the catalog keeps the old route.
// The seven jazz drills are modes of Play over changes (/music/changes/<mode>); a saved link to an
// old route still names the same drill.
const ROUTE = (href: string) =>
  href
    .split(/[?#]/)[0]
    .replace(/^\/music\/studio$/, "/music/library")
    .replace(
      /^\/music\/(voicings|comping|accompany|licks|chord-scales|jam|call-response)$/,
      "/music/changes/$1",
    );

/** The exercise ids a drill link records, so a step needs no hand-listed skills. */
export function exercisesForHref(href: string, instruments: Instrument[] = []): string[] {
  const route = ROUTE(href);
  if (SHELF_ROUTE.test(route)) return ["song.studio"];
  const q = new URLSearchParams(href.split("?")[1] ?? "");
  const entry = CATALOG.find((e) => ROUTE(e.route) === route);
  if (!entry) return [];
  let ids: string[];
  if (route === "/music/rhythm" && q.get("pattern")) ids = [rhythmExerciseId(q.get("pattern")!)];
  else if (route === "/music/phrases")
    ids = (["piano", "guitar", "ukulele", "aerophone"] as const).map(
      (i) => `repertoire.phrases.${i}`,
    );
  else {
    const mode = entry.modes.find((m) => m.id === q.get("mode"));
    ids = [mode?.exerciseId ?? entry.exerciseId];
  }
  const fretted = instruments.filter((i) => i === "guitar" || i === "ukulele");
  return [...new Set(ids.flatMap((id) => [id, ...fretted.map((i) => exerciseIdFor(id, i))]))];
}

/** A shelf song in Song Studio: /music/songs/shelf/<path>/<song>, ?bars=3-4 for a riff. */
const SHELF_ROUTE = /^\/music\/songs\/shelf\/([a-z0-9-]+)\/([a-z0-9-]+)$/;

/** A drill route the catalog knows, a shelf song, or one of the app's non-drill pages. */
export const knownRoute = (href: string) =>
  SHELF_ROUTE.test(ROUTE(href)) ||
  CATALOG.some((e) => ROUTE(e.route) === ROUTE(href)) ||
  [
    "/music/tuner",
    "/music/songs",
    "/music/library",
    "/music/create",
    "/music/record",
    "/music/tunes",
  ].includes(ROUTE(href));

const shelfMatch = (href?: string) => {
  const m = href && ROUTE(href).match(SHELF_ROUTE);
  return m ? { shelf: `${m[1]}/${m[2]}` } : undefined;
};

export function levelPath(raw: RawLevelPath): LearningPath {
  const instruments = raw.instruments ?? [];
  let order = 0;
  const steps: PathStep[] = raw.levels.flatMap((level) =>
    level.steps.map((s): PathStep => {
      const graded = !!s.href && !s.needs;
      const exercises = graded ? (s.exerciseIds ?? exercisesForHref(s.href!, instruments)) : [];
      return {
        id: `${raw.id}.${s.id}`,
        order: ++order,
        title: s.title,
        summary: s.setup,
        detail: s.done,
        kind: s.needs ? "new" : graded && (exercises.length || s.ladder) ? "drill" : "reference",
        href: s.href ?? "",
        links: s.links ?? [],
        skillIds: graded ? (s.skillIds ?? []) : [],
        exerciseIds: graded ? exercises : [],
        // A shelf song link counts that song's Song Studio runs.
        match: shelfMatch(s.href) ? { ...shelfMatch(s.href), ...s.match } : s.match,
        each: s.each,
        minAttempts: s.minAttempts ?? 3,
        minSessions: s.minSessions ?? 1,
        minDays: s.minDays ?? 2,
        threshold: s.threshold,
        minBpm: s.minBpm,
        minDifficulty: s.minDifficulty,
        requires: (s.requires ?? []).map((r) => `${raw.id}.${r}`),
        covers: s.covers?.map((r) => `${raw.id}.${r}`),
        instruments: instruments.length ? instruments : undefined,
        level: level.id,
        strand: s.strand,
        needs: s.needs,
        ...(s.ladder && !s.needs ? { ladder: s.ladder } : {}),
      };
    }),
  );
  return {
    id: raw.id,
    title: pathText(raw.id, "title", raw.title),
    subtitle: pathText(raw.id, "subtitle", raw.subtitle),
    benchmark: raw.benchmark,
    steps,
    levels: raw.levels.map((l) => ({
      id: l.id,
      title: l.title,
      goal: l.goal,
      adds: l.adds,
      pick: l.pick ?? 2,
      shelf: l.shelf,
      test: l.test,
      stepIds: l.steps.map((s) => `${raw.id}.${s.id}`),
    })),
  };
}

export const SONG_PASS = 0.8;

/** Shelf key of a song: what Song Studio writes as the run's `shelf` param. */
export const shelfKey = (path: PathId, song: ShelfSong) => `${path}/${song.id}`;

/**
 * Days with a passing performance per shelf song: Song Studio in Performance, No-stop or Sight-read mode, a score of
 * SONG_PASS or better, at 90% of the record's tempo or faster when the shelf gives one.
 */
export function songDays(path: LearningPath, runs: RunRecord[]): Map<string, number> {
  const songs = new Map(
    (path.levels ?? []).flatMap((l) => l.shelf.map((s) => [shelfKey(path.id, s), s] as const)),
  );
  const days = new Map<string, Set<string>>();
  for (const r of runs) {
    const key = String(r.params.shelf ?? "");
    const song = songs.get(key);
    // A no-stop or sight-read run keeps time too, so it counts like a performance; tapping the rhythm does not.
    if (
      !song ||
      r.exerciseId !== "song.studio" ||
      !["performance", "no-stop", "sight-read"].includes(String(r.params.mode)) ||
      r.params.tap
    )
      continue;
    if ((r.score ?? 0) < SONG_PASS - 1e-9) continue;
    if (song.bpm && Number(r.params.bpm) < song.bpm * 0.9 - 1e-9) continue;
    if (!days.has(key)) days.set(key, new Set());
    days.get(key)!.add(dayKey(r.endedAt || r.startedAt));
  }
  return new Map([...days].map(([k, d]) => [k, d.size]));
}
