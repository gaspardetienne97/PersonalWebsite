<script lang="ts">
  // A chord shape on the fret window: dots carry finger numbers, open strings a
  // ring, muted strings an x at the nut. `show=false` hides the shape (Check).
  import type { ChordShape, Tuning } from "@repo/music-core/data/index";
  import { chordPerfectTargets } from "@repo/music-core/content/technique";
  import { tuningById } from "@repo/music-core/theory/fretboard";
  import Fretboard, { type FretMark } from "$lib/music/components/Fretboard.svelte";
  import type { Flashes } from "$lib/music/components/feedback.svelte";

  interface Props {
    shape: ChordShape & { fretWindow?: { start: number; end: number } };
    show?: boolean;
    demo?: number | null;
    flashes?: Flashes;
    label?: string;
    interactive?: boolean;
    /** The tuning the shape is played on (default: the shape's own). */
    tuning?: Tuning;
  }
  let { shape, show = true, demo = null, flashes, label = "Fretboard", interactive = true, tuning: given }: Props = $props();

  const tuning = $derived(given ?? tuningById(shape.tuningId)!);
  const targets = $derived(chordPerfectTargets(shape, tuning));
  const fretted = $derived(targets.filter((t) => t.fret > 0).map((t) => t.fret));
  const from = $derived(shape.fretWindow ? shape.fretWindow.start : fretted.length && Math.min(...fretted) > 3 ? Math.min(...fretted) - 1 : 0);
  const to = $derived(Math.min(tuning.fretCount, Math.max(from + 4, shape.fretWindow?.end ?? 0, ...fretted)));
  const marks = $derived<FretMark[]>(
    show
      ? targets.map((t) => ({ string: t.string, fret: t.fret, label: t.finger ? String(t.finger) : undefined, demo: demo === t.midi }))
      : demo !== null
        ? targets.filter((t) => t.midi === demo).map((t) => ({ string: t.string, fret: t.fret, demo: true }))
        : [],
  );
  const muted = $derived(show ? shape.frets.flatMap((f, i) => (f === null ? [i + 1] : [])) : []);
</script>

<Fretboard openStrings={tuning.openStrings} {from} {to} {marks} {flashes} {muted} {label} {interactive} />
