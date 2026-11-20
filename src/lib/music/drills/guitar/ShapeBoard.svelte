<script lang="ts">
  // A chord shape on the fret window: dots carry finger numbers in the fingers'
  // colours (a barre is one bar), open strings an O and muted strings an x on the
  // nut. `show=false` hides the shape (Check); strings in `heard` show a ring and
  // a check either way (what was played is no secret).
  import type { ChordShape, Tuning } from "@repo/music-core/data/index";
  import { chordPerfectTargets } from "@repo/music-core/content/technique";
  import { tuningById } from "@repo/music-core/theory/fretboard";
  import Fretboard, { type FretMark } from "#lib/music/components/Fretboard.svelte";
  import type { Flashes } from "#lib/music/components/feedback.svelte.ts";

  interface Props {
    shape: ChordShape & { fretWindow?: { start: number; end: number } };
    show?: boolean;
    demo?: number | null;
    flashes?: Flashes;
    label?: string;
    interactive?: boolean;
    /** The tuning the shape is played on (default: the shape's own). */
    tuning?: Tuning;
    /** Strings whose target note has been heard. */
    heard?: number[];
    /** Rows 32 px apart, so a six-string neck fits a laptop's first view. */
    compact?: boolean;
  }
  let { shape, show = true, demo = null, flashes, label = "Fretboard", interactive = true, tuning: given, heard = [], compact = false }: Props = $props();

  const tuning = $derived(given ?? tuningById(shape.tuningId)!);
  const targets = $derived(chordPerfectTargets(shape, tuning));
  const fretted = $derived(targets.filter((t) => t.fret > 0).map((t) => t.fret));
  const from = $derived(shape.fretWindow ? shape.fretWindow.start : fretted.length && Math.min(...fretted) > 3 ? Math.min(...fretted) - 1 : 0);
  const to = $derived(Math.min(tuning.fretCount, Math.max(from + 4, shape.fretWindow?.end ?? 0, ...fretted)));
  const dot = (t: (typeof targets)[number]): FretMark => ({ string: t.string, fret: t.fret, label: t.finger ? String(t.finger) : undefined, finger: t.finger || undefined, demo: demo === t.midi, heard: heard.includes(t.string) });
  const marks = $derived<FretMark[]>(
    show
      ? targets.map(dot)
      : targets.filter((t) => heard.includes(t.string) || t.midi === demo).map((t) => (heard.includes(t.string) ? dot(t) : { string: t.string, fret: t.fret, demo: true })),
  );
  const muted = $derived(show ? shape.frets.flatMap((f, i) => (f === null ? [i + 1] : [])) : []);
</script>

<Fretboard openStrings={tuning.openStrings} {from} {to} {marks} {flashes} {muted} {label} {interactive} {compact} barres stringNames />
