import Piano from "@lucide/svelte/icons/piano";
import AudioLines from "@lucide/svelte/icons/audio-lines";
import ListMusic from "@lucide/svelte/icons/list-music";
import CircuitBoard from "@lucide/svelte/icons/circuit-board";
import { MARKERS } from "#lib/circuit/router.ts";
import { m } from "@repo/i18n/messages.js";

export type Project = {
  slug: string;
  title: string;
  /** One line for cards. */
  summary: string;
  /** A short paragraph for the Studio. */
  description: string;
  href: string;
  /**
   * Big apps open full screen with their own look and navigation instead of
   * sitting inside the site's header and footer.
   */
  fullscreen: boolean;
  stack: string[];
  icon: typeof Piano;
  /** Trace colours for the cover art. */
  colors: string[];
  /** The year it started (its first commit), used to find what's newest. */
  year?: number;
};

export const projects: Project[] = [
  {
    slug: "woodshed",
    title: "Woodshed",
    get summary() {
      return m.project_woodshed_summary();
    },
    get description() {
      return m.project_woodshed_description();
    },
    href: "/music",
    fullscreen: true,
    stack: ["Svelte 5", "Web Audio", "Web MIDI", "Tone.js", "IndexedDB"],
    icon: Piano,
    colors: [MARKERS.yellow, MARKERS.red, MARKERS.green, MARKERS.violet],
    year: 2026,
  },
  {
    slug: "narrator",
    title: "Narrator",
    get summary() {
      return m.project_narrator_summary();
    },
    get description() {
      return m.project_narrator_description();
    },
    href: "/pdf",
    fullscreen: true,
    stack: ["PDF.js", "Kokoro TTS", "WebGPU", "Svelte 5"],
    icon: AudioLines,
    colors: ["#1291fa", "#a21fb8", "#ff0c0d", MARKERS.blue],
    year: 2026,
  },
  {
    slug: "listplay",
    title: "Listplay",
    get summary() {
      return m.project_listplay_summary();
    },
    get description() {
      return m.project_listplay_description();
    },
    href: "/listplay",
    fullscreen: false,
    stack: ["Spotify Web API", "OAuth PKCE", "SvelteKit"],
    icon: ListMusic,
    colors: [MARKERS.green, MARKERS.blue, MARKERS.yellow],
    year: 2025,
  },
  {
    slug: "this-website",
    get title() {
      return m.project_site_title();
    },
    get summary() {
      return m.project_site_summary();
    },
    get description() {
      return m.project_site_description();
    },
    href: "/about#this-website",
    fullscreen: false,
    stack: ["SvelteKit", "Tailwind CSS", "PostgreSQL", "Nix"],
    icon: CircuitBoard,
    colors: ["#2bc4ff", "#c531f2", "#ff1f2a", "#ff6fa6"],
  },
];
