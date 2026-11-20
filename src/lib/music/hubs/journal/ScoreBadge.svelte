<script lang="ts">
  // A small badge beside a run's score: "Best yet", "Up from 72%", "Down from 90%". Glyph and word,
  // so colour is never the only cue. Nothing for a first run of a setup.
  import Trophy from "@lucide/svelte/icons/trophy";
  import TrendingUp from "@lucide/svelte/icons/trending-up";
  import TrendingDown from "@lucide/svelte/icons/trending-down";
  import Equal from "@lucide/svelte/icons/equal";
  import type { RunRecord } from "@repo/music-core";
  import { practice } from "../../practice.svelte";
  import { runDelta } from "../progress/model";

  let { run }: { run: RunRecord } = $props();
  const d = $derived(runDelta(run, practice.sessions));
  const ICON = { best: Trophy, up: TrendingUp, down: TrendingDown, same: Equal };
</script>

{#if d}
  {@const I = ICON[d.kind]}
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[13px] font-semibold {d.kind === 'best'
      ? 'bg-success/15 text-success'
      : d.kind === 'up'
        ? 'text-success'
        : 'text-ws-soft'}"><I class="size-3.5" aria-hidden="true" />{d.text}</span
  >
{/if}
