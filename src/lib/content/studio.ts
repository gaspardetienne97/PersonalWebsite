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
import d01sm from "$lib/images/studio/drawing-01-sm.webp";
import d01lg from "$lib/images/studio/drawing-01-lg.webp";
import d02sm from "$lib/images/studio/drawing-02-sm.webp";
import d02lg from "$lib/images/studio/drawing-02-lg.webp";
import d03sm from "$lib/images/studio/drawing-03-sm.webp";
import d03lg from "$lib/images/studio/drawing-03-lg.webp";
import d04sm from "$lib/images/studio/drawing-04-sm.webp";
import d04lg from "$lib/images/studio/drawing-04-lg.webp";
import d05sm from "$lib/images/studio/drawing-05-sm.webp";
import d05lg from "$lib/images/studio/drawing-05-lg.webp";
import d06sm from "$lib/images/studio/drawing-06-sm.webp";
import d06lg from "$lib/images/studio/drawing-06-lg.webp";
import d07sm from "$lib/images/studio/drawing-07-sm.webp";
import d07lg from "$lib/images/studio/drawing-07-lg.webp";
import d08sm from "$lib/images/studio/drawing-08-sm.webp";
import d08lg from "$lib/images/studio/drawing-08-lg.webp";
import d09sm from "$lib/images/studio/drawing-09-sm.webp";
import d09lg from "$lib/images/studio/drawing-09-lg.webp";

import Camera from "lucide-svelte/icons/camera";
import Clapperboard from "lucide-svelte/icons/clapperboard";
import CodeXml from "lucide-svelte/icons/code-xml";
import MusicIcon from "lucide-svelte/icons/music";
import Palette from "lucide-svelte/icons/palette";
import PenTool from "lucide-svelte/icons/pen-tool";
import PencilLine from "lucide-svelte/icons/pencil-line";
import { projects, type Project } from "./projects";

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
    title: "Trace maze",
    alt: "Dense parallel lines in red, blue, green, violet and yellow winding through a tall rectangle like circuit traces.",
    small: d01sm,
    large: d01lg,
    width: 720,
    height: 1084,
  },
  {
    id: "lattice",
    title: "Lattice",
    alt: "Thick black lines joining points into triangles over a ruled background.",
    small: d02sm,
    large: d02lg,
    width: 720,
    height: 1110,
  },
  {
    id: "thicket",
    title: "Thicket",
    alt: "Black ink strokes sweeping across a vertical grid, with a dense starburst on the right.",
    small: d03sm,
    large: d03lg,
    width: 720,
    height: 421,
  },
  {
    id: "shards",
    title: "Shards",
    alt: "Overlapping triangles and zigzags in blue, violet, red and green around two eye-like circles.",
    small: d04sm,
    large: d04lg,
    width: 720,
    height: 457,
  },
  {
    id: "vase",
    title: "Flowers in a striped vase",
    alt: "A green branching stem with blue flowers in a vase striped red, violet and blue.",
    small: d05sm,
    large: d05lg,
    width: 621,
    height: 909,
  },
  {
    id: "red-fold",
    title: "Red fold",
    alt: "Red lines forming a curling shape beside a box crossed by an hourglass of strokes.",
    small: d06sm,
    large: d06lg,
    width: 720,
    height: 501,
  },
  {
    id: "curtain",
    title: "Curtain",
    alt: "Vertical coloured lines above a curved, layered shape drawn in red, green, violet and blue.",
    small: d07sm,
    large: d07lg,
    width: 720,
    height: 456,
  },
  {
    id: "paisley",
    title: "Paisley",
    alt: "A paisley-like curl outlined in parallel red, green, violet and blue lines with small spirals inside.",
    small: d08sm,
    large: d08lg,
    width: 720,
    height: 454,
  },
  {
    id: "net",
    title: "Net",
    alt: "Black lines and knots stretched across a grid like a net, with a solid black shape in the corner.",
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
    label: "Doodles",
    singular: "Doodle",
    dot: "var(--gm-pink)",
    colors: ["#ff6fa6", "#c531f2", "#2bc4ff"],
    icon: PencilLine,
    empty: "Margin sketches and phone-call scribbles are on the way.",
  },
  {
    kind: "drawings",
    label: "Drawings",
    singular: "Drawing",
    dot: "var(--gm-red)",
    colors: ["#e8452c", "#4f6ff5", "#2e8b4a", "#a35be0"],
    icon: PenTool,
    empty: "Ink and marker line work is on the way.",
  },
  {
    kind: "music",
    label: "Music",
    singular: "Music",
    dot: "var(--gm-yellow)",
    colors: ["#f2b705", "#e8452c", "#ff6fa6"],
    icon: MusicIcon,
    empty: "Recordings, loops and sketches from the practice room are on the way.",
  },
  {
    kind: "paintings",
    label: "Paintings",
    singular: "Painting",
    dot: "var(--gm-violet)",
    colors: ["#a35be0", "#4f6ff5", "#f2b705"],
    icon: Palette,
    empty: "Paintings are on the way.",
  },
  {
    kind: "photos",
    label: "Photos",
    singular: "Photo",
    dot: "var(--gm-green)",
    colors: ["#2e8b4a", "#2bc4ff", "#f2b705"],
    icon: Camera,
    empty: "Photos from trips and everyday life are on the way.",
  },
  {
    kind: "projects",
    label: "Projects",
    singular: "Project",
    dot: "var(--gm-cyan)",
    colors: ["#2bc4ff", "#c531f2", "#ff1f2a"],
    icon: CodeXml,
    empty: "Projects are on the way.",
  },
  {
    kind: "videos",
    label: "Videos",
    singular: "Video",
    dot: "var(--gm-blue)",
    colors: ["#4f6ff5", "#a35be0", "#2bc4ff"],
    icon: Clapperboard,
    empty: "Clips and recordings are on the way.",
  },
];

export const kindInfo = (kind: StudioKind) =>
  STUDIO_KINDS.find((k) => k.kind === kind) as StudioKindInfo;

export const isStudioKind = (value: string | null): value is StudioKind =>
  STUDIO_KINDS.some((k) => k.kind === value);

const image =
  (kind: StudioKind) =>
  (entry: ImageEntry): StudioItem => ({
    kind,
    media: { type: "image", ...entry },
  });

/** Every kind's items, in the order they're listed. */
export const STUDIO: Record<StudioKind, StudioItem[]> = {
  doodles: doodles.map(image("doodles")),
  drawings: drawings.map(image("drawings")),
  music: music.map((entry) => ({ kind: "music", media: { type: "audio", ...entry } })),
  paintings: paintings.map(image("paintings")),
  photos: photos.map(image("photos")),
  projects: projects.map((project) => ({
    kind: "projects",
    media: {
      type: "project",
      id: project.slug,
      title: project.title,
      note: project.summary,
      year: project.year,
      project,
    },
  })),
  videos: videos.map((entry) => ({ kind: "videos", media: { type: "video", ...entry } })),
};

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
