<script lang="ts">
  // A mini piano roll of a MIDI take: one bar per note, pitch up, time across.
  import type { TakeNote } from "$lib/music/takes";
  let { notes, durationMs }: { notes: TakeNote[]; durationMs: number } = $props();
  const lo = $derived(Math.min(...notes.map((n) => n.midi), 60) - 1);
  const hi = $derived(Math.max(...notes.map((n) => n.midi), 72) + 1);
  const span = $derived(Math.max(1, durationMs));
</script>

<svg viewBox="0 0 120 40" preserveAspectRatio="none" class="h-10 w-28 shrink-0 rounded-md bg-ws-stage" aria-hidden="true">
  {#each notes as n, i (i)}
    <rect
      x={(n.startMs / span) * 120}
      y={((hi - n.midi) / (hi - lo)) * 38}
      width={Math.max(1.2, (n.durationMs / span) * 120)}
      height={Math.max(1.5, 38 / (hi - lo))}
      rx="0.6"
      fill="var(--instr)"
      opacity={0.45 + n.velocity * 0.55}
    />
  {/each}
</svg>
