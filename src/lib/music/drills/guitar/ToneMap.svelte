<script lang="ts">
  // Pitch classes as chips: target tones heard (filled, tick), target tones
  // missing (dashed, "missing"), other tones heard (hollow, "extra"). Words and
  // form carry the meaning, colour only repeats it. `plain` (before a run) shows
  // the target tones with no verdict.
  import { FLAT_NAMES } from "@repo/music-core";

  let { expected = [], heard = [], label = "Tones", plain = false }: { expected?: readonly number[]; heard?: readonly number[]; label?: string; plain?: boolean } = $props();
  const chips = $derived([
    ...expected.map((pc) => ({ pc, state: plain ? ("tone" as const) : heard.includes(pc) ? ("hit" as const) : ("missing" as const) })),
    ...heard.filter((pc) => !expected.includes(pc)).map((pc) => ({ pc, state: "extra" as const })),
  ]);
  const word = { hit: "heard", missing: "missing", extra: "extra", tone: "" };
</script>

<ul class="flex flex-wrap gap-1.5" aria-label={label}>
  {#each chips as c (c.pc)}
    <li
      class="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm {c.state === 'hit'
        ? 'bg-success/90 font-semibold text-white'
        : c.state === 'missing'
          ? 'border-2 border-dashed border-ws-stage-ink/40 text-ws-stage-soft'
          : c.state === 'tone'
            ? 'border-2 border-ws-stage-ink/25 text-ws-stage-ink'
            : 'border-2 border-warn text-ws-stage-ink'}"
    >
      <span class="font-display text-base font-semibold">{FLAT_NAMES[c.pc]}</span>
      {#if c.state !== "tone"}<span class="text-xs">{c.state === "hit" ? "✓" : word[c.state]}</span>{/if}
      {#if c.state === "hit"}<span class="sr-only">heard</span>{/if}
    </li>
  {:else}
    <li class="text-sm text-ws-stage-soft">No tones yet.</li>
  {/each}
</ul>
