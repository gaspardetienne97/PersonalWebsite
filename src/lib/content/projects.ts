import Piano from "@lucide/svelte/icons/piano";
import AudioLines from "@lucide/svelte/icons/audio-lines";
import ListMusic from "@lucide/svelte/icons/list-music";
import CircuitBoard from "@lucide/svelte/icons/circuit-board";
import { MARKERS } from "#lib/circuit/router.ts";

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
    summary: "A practice room for piano, guitar, ukulele, wind synth and pads.",
    description:
      "Woodshed listens through the microphone or MIDI, plays along, and turns practice into learning paths: ear training, rhythm, scales, voicings and songs, with progress you can see.",
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
    summary: "Reads PDFs, EPUBs and text aloud with the words lit up as it goes.",
    description:
      "Drop in a book or paste an article and Narrator reads it to you, highlighting each word. It uses your system voices or a neural voice that runs entirely in the browser.",
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
    summary: "My Spotify playlists, plus a monthly playlist of my top songs.",
    description:
      "A small client for the Spotify Web API: sign in, browse your playlists, and build a playlist from the songs you played most this month.",
    href: "/listplay",
    fullscreen: false,
    stack: ["Spotify Web API", "OAuth PKCE", "SvelteKit"],
    icon: ListMusic,
    colors: [MARKERS.green, MARKERS.blue, MARKERS.yellow],
    year: 2025,
  },
  {
    slug: "this-website",
    title: "This website",
    summary: "The site you're on, self-hosted on my homelab.",
    description:
      "SvelteKit and Svelte 5 on a Node server in my homelab, built with a Nix flake. The intro circuits are routed live in your browser each time you visit.",
    href: "/about#this-website",
    fullscreen: false,
    stack: ["SvelteKit", "Tailwind CSS", "PostgreSQL", "Nix"],
    icon: CircuitBoard,
    colors: ["#2bc4ff", "#c531f2", "#ff1f2a", "#ff6fa6"],
  },
];
