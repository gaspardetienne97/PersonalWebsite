/**
 * Everything in the Studio. Every kind of thing I make sits side by side with the
 * same weight: doodles, drawings, music, paintings, photos, projects and videos.
 * Projects come from projects.ts; everything else is listed below.
 *
 * To add something, put the file in src/lib/images/studio/ (or use a URL), import
 * it below and add an entry to its kind's list.
 * - Images (doodles, drawings, paintings, photos) want a small version for the
 *   grid (about 720px wide) and a large one for the viewer (about 1600px).
 * - A video gives a file `src` or a YouTube `youtubeId`, and ideally a `poster`.
 * - A piece of music gives an audio file `src` or an `embed` URL (SoundCloud,
 *   Bandcamp, Spotify or YouTube embed), and optionally a `cover` image.
 * Anything without a picture gets generated circuit art as its cover.
 */
import d01sm from "#lib/images/studio/drawing-01-sm.webp";
import d01lg from "#lib/images/studio/drawing-01-lg.webp";
import d02sm from "#lib/images/studio/drawing-02-sm.webp";
import d02lg from "#lib/images/studio/drawing-02-lg.webp";
import d03sm from "#lib/images/studio/drawing-03-sm.webp";
import d03lg from "#lib/images/studio/drawing-03-lg.webp";
import d04sm from "#lib/images/studio/drawing-04-sm.webp";
import d04lg from "#lib/images/studio/drawing-04-lg.webp";
import d05sm from "#lib/images/studio/drawing-05-sm.webp";
import d05lg from "#lib/images/studio/drawing-05-lg.webp";
import d06sm from "#lib/images/studio/drawing-06-sm.webp";
import d06lg from "#lib/images/studio/drawing-06-lg.webp";
import d07sm from "#lib/images/studio/drawing-07-sm.webp";
import d07lg from "#lib/images/studio/drawing-07-lg.webp";
import d08sm from "#lib/images/studio/drawing-08-sm.webp";
import d08lg from "#lib/images/studio/drawing-08-lg.webp";
import d09sm from "#lib/images/studio/drawing-09-sm.webp";
import d09lg from "#lib/images/studio/drawing-09-lg.webp";

import Camera from "@lucide/svelte/icons/camera";
import Clapperboard from "@lucide/svelte/icons/clapperboard";
import CodeXml from "@lucide/svelte/icons/code-xml";
import MusicIcon from "@lucide/svelte/icons/music";
import Palette from "@lucide/svelte/icons/palette";
import PenTool from "@lucide/svelte/icons/pen-tool";
import PencilLine from "@lucide/svelte/icons/pencil-line";
import { projects, type Project } from "./projects";
import { m } from "@repo/i18n/messages.js";

type Common = { id: string; title: string; year?: number; note?: string };

export type ImageEntry = Common & {
  alt: string;
  small: string;
  large: string;
  /** Pixel size of the small image. */
  width: number;
  height: number;
};
export type VideoEntry = Common & { poster?: string; src?: string; youtubeId?: string };
export type AudioEntry = Common & { cover?: string; src?: string; embed?: string };

export const drawings: ImageEntry[] = [
  {
    id: "trace-maze",
    get title() {
      return m.drawing_trace_maze();
    },
    get alt() {
      return m.drawing_trace_maze_alt();
    },
    small: d01sm,
    large: d01lg,
    width: 720,
    height: 1084,
  },
  {
    id: "lattice",
    get title() {
      return m.drawing_lattice();
    },
    get alt() {
      return m.drawing_lattice_alt();
    },
    small: d02sm,
    large: d02lg,
    width: 720,
    height: 1110,
  },
  {
    id: "thicket",
    get title() {
      return m.drawing_thicket();
    },
    get alt() {
      return m.drawing_thicket_alt();
    },
    small: d03sm,
    large: d03lg,
    width: 720,
    height: 421,
  },
  {
    id: "shards",
    get title() {
      return m.drawing_shards();
    },
    get alt() {
      return m.drawing_shards_alt();
    },
    small: d04sm,
    large: d04lg,
    width: 720,
    height: 457,
  },
  {
    id: "vase",
    get title() {
      return m.drawing_vase();
    },
    get alt() {
      return m.drawing_vase_alt();
    },
    small: d05sm,
    large: d05lg,
    width: 621,
    height: 909,
  },
  {
    id: "red-fold",
    get title() {
      return m.drawing_red_fold();
    },
    get alt() {
      return m.drawing_red_fold_alt();
    },
    small: d06sm,
    large: d06lg,
    width: 720,
    height: 501,
  },
  {
    id: "curtain",
    get title() {
      return m.drawing_curtain();
    },
    get alt() {
      return m.drawing_curtain_alt();
    },
    small: d07sm,
    large: d07lg,
    width: 720,
    height: 456,
  },
  {
    id: "paisley",
    get title() {
      return m.drawing_paisley();
    },
    get alt() {
      return m.drawing_paisley_alt();
    },
    small: d08sm,
    large: d08lg,
    width: 720,
    height: 454,
  },
  {
    id: "net",
    get title() {
      return m.drawing_net();
    },
    get alt() {
      return m.drawing_net_alt();
    },
    small: d09sm,
    large: d09lg,
    width: 720,
    height: 465,
  },
];

export const doodles: ImageEntry[] = [];
export const paintings: ImageEntry[] = [];
export const photos: ImageEntry[] = [];
export const videos: VideoEntry[] = [];
export const music: AudioEntry[] = [];

export type StudioKind =
  | "doodles"
  | "drawings"
  | "music"
  | "paintings"
  | "photos"
  | "projects"
  | "videos";

export type StudioMedia =
  | ({ type: "image" } & ImageEntry)
  | ({ type: "video" } & VideoEntry)
  | ({ type: "audio" } & AudioEntry)
  | ({ type: "project" } & Common & { project: Project });

export type StudioItem = { kind: StudioKind; media: StudioMedia };

export type StudioKindInfo = {
  kind: StudioKind;
  label: string;
  singular: string;
  /** CSS colour for the kind's dot (a --gm token, so it follows the theme). */
  dot: string;
  /** Trace colours for generated covers. */
  colors: string[];
  icon: typeof Camera;
  /** What an empty kind says while there's nothing in it yet. */
  empty: string;
};

/** Alphabetical, so no kind leads. */
export const STUDIO_KINDS: StudioKindInfo[] = [
  {
    kind: "doodles",
    get label() {
      return m.kind_doodles();
    },
    get singular() {
      return m.kind_doodles_one();
    },
    dot: "var(--gm-pink)",
    colors: ["#ff6fa6", "#c531f2", "#2bc4ff"],
    icon: PencilLine,
    get empty() {
      return m.kind_doodles_empty();
    },
  },
  {
    kind: "drawings",
    get label() {
      return m.kind_drawings();
    },
    get singular() {
      return m.kind_drawings_one();
    },
    dot: "var(--gm-red)",
    colors: ["#e8452c", "#4f6ff5", "#2e8b4a", "#a35be0"],
    icon: PenTool,
    get empty() {
      return m.kind_drawings_empty();
    },
  },
  {
    kind: "music",
    get label() {
      return m.kind_music();
    },
    get singular() {
      return m.kind_music_one();
    },
    dot: "var(--gm-yellow)",
    colors: ["#f2b705", "#e8452c", "#ff6fa6"],
    icon: MusicIcon,
    get empty() {
      return m.kind_music_empty();
    },
  },
  {
    kind: "paintings",
    get label() {
      return m.kind_paintings();
    },
    get singular() {
      return m.kind_paintings_one();
    },
    dot: "var(--gm-violet)",
    colors: ["#a35be0", "#4f6ff5", "#f2b705"],
    icon: Palette,
    get empty() {
      return m.kind_paintings_empty();
    },
  },
  {
    kind: "photos",
    get label() {
      return m.kind_photos();
    },
    get singular() {
      return m.kind_photos_one();
    },
    dot: "var(--gm-green)",
    colors: ["#2e8b4a", "#2bc4ff", "#f2b705"],
    icon: Camera,
    get empty() {
      return m.kind_photos_empty();
    },
  },
  {
    kind: "projects",
    get label() {
      return m.kind_projects();
    },
    get singular() {
      return m.kind_projects_one();
    },
    dot: "var(--gm-cyan)",
    colors: ["#2bc4ff", "#c531f2", "#ff1f2a"],
    icon: CodeXml,
    get empty() {
      return m.kind_projects_empty();
    },
  },
  {
    kind: "videos",
    get label() {
      return m.kind_videos();
    },
    get singular() {
      return m.kind_videos_one();
    },
    dot: "var(--gm-blue)",
    colors: ["#4f6ff5", "#a35be0", "#2bc4ff"],
    icon: Clapperboard,
    get empty() {
      return m.kind_videos_empty();
    },
  },
];

export const kindInfo = (kind: StudioKind) =>
  STUDIO_KINDS.find((k) => k.kind === kind) as StudioKindInfo;

export const isStudioKind = (value: string | null): value is StudioKind =>
  STUDIO_KINDS.some((k) => k.kind === value);

/**
 * The entry plus its media type. The entry is the prototype instead of being
 * spread in, so translated getters (title, alt) keep answering in the visitor's
 * language instead of being read once when this module loads.
 */
function typed<T extends object, K extends StudioMedia["type"]>(type: K, entry: T) {
  return Object.assign(Object.create(entry) as T, { type }) as T & { type: K };
}

const image =
  (kind: StudioKind) =>
  (entry: ImageEntry): StudioItem => ({ kind, media: typed("image", entry) });

/** Every kind's items, in the order they're listed. */
export const STUDIO: Record<StudioKind, StudioItem[]> = {
  doodles: doodles.map(image("doodles")),
  drawings: drawings.map(image("drawings")),
  music: music.map((entry) => ({ kind: "music", media: typed("audio", entry) })),
  paintings: paintings.map(image("paintings")),
  photos: photos.map(image("photos")),
  projects: projects.map((project) => ({
    kind: "projects",
    media: {
      type: "project",
      id: project.slug,
      get title() {
        return project.title;
      },
      get note() {
        return project.summary;
      },
      year: project.year,
      project,
    },
  })),
  videos: videos.map((entry) => ({ kind: "videos", media: typed("video", entry) })),
};

/**
 * The kinds for lists that lead with work: those that hold something first, the
 * ones still empty after, each group in its usual (alphabetical) order. Every
 * kind is still there and drawn the same size.
 */
export function kindsByWork(): StudioKindInfo[] {
  const has = (info: StudioKindInfo) => STUDIO[info.kind].length > 0;
  return [...STUDIO_KINDS.filter(has), ...STUDIO_KINDS.filter((info) => !has(info))];
}

/**
 * Everything together, dealt out one kind at a time (a drawing, then some music,
 * then a photo, and round again) so no kind crowds out the others.
 */
export function everything(): StudioItem[] {
  const lists = STUDIO_KINDS.map(({ kind }) => STUDIO[kind]);
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const out: StudioItem[] = [];
  for (let i = 0; i < longest; i++) for (const list of lists) if (list[i]) out.push(list[i]);
  return out;
}

/** The newest piece of any kind: the latest year, and the wall's order among equals. */
export function newest(): StudioItem | undefined {
  let best: StudioItem | undefined;
  for (const item of everything())
    if (!best || (item.media.year ?? 0) > (best.media.year ?? 0)) best = item;
  return best;
}
