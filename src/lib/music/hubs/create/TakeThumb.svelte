<script lang="ts">
  // A mini piano roll of a MIDI take: one bar per note, pitch up, time across.
  // Each note name keeps one colour (every C looks alike), louder notes are
  // brighter, and a cursor shows where playback is (or where it paused).
  import type { TakeNote } from "$lib/music/takes";
  let { notes, durationMs, progress = null }: { notes: TakeNote[]; durationMs: number; progress?: number | null } = $props();
  const lo = $derived(Math.min(...notes.map((n) => n.midi), 60) - 1);
  const hi = $derived(Math.max(...notes.map((n) => n.midi), 72) + 1);
  const span = $derived(Math.max(1, durationMs));
  // Drawn across the full card width, like the audio waveform.
  const W = 600;
  const H = 64;
  // Bars stay readable however wide the range: at least 6 of the 64 units tall.
  const bar = $derived(Math.max(6, (H - 8) / (hi - lo)));
  const hue = (midi: number) => `oklch(0.77 0.15 ${(((midi % 12) + 12) % 12) * 30 + 20})`;
</script>

<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-16 w-full rounded-lg bg-ws-stage" aria-hidden="true">
  {#each notes as n, i (i)}
    {@const x = (n.startMs / span) * W}
    <rect
      {x}
      y={4 + ((hi - n.midi) / (hi - lo)) * (H - 8 - bar)}
      width={Math.max(3, (n.durationMs / span) * W)}
      height={bar}
      rx="2"
      fill={hue(n.midi)}
      opacity={(0.5 + n.velocity * 0.5) * (progress === null || x <= progress * W ? 1 : 0.5)}
    />
  {/each}
  {#if progress !== null}
    <line x1={progress * W} x2={progress * W} y1="0" y2={H} stroke="var(--ws-stage-ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  {/if}
</svg>
