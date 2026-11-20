<script lang="ts">
  // String independence (catalog 4.5): Spider, Positions, Note finder, Interval recall, Legato, Bends, Harmonics.
  import { m } from "@repo/i18n/messages.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import LineDrill from "#lib/music/drills/guitar/LineDrill.svelte";
  import FindDrill from "#lib/music/drills/guitar/FindDrill.svelte";
  import BendDrill from "#lib/music/drills/guitar/BendDrill.svelte";
  import { applyBenchParams } from "#lib/music/drills/guitar/instrument.svelte.ts";
  import { FRETBOARD_MODES, modeFrom } from "#lib/music/drills/guitar/modes.ts";

  const mode = $derived(modeFrom(FRETBOARD_MODES, page.url.searchParams.get("mode")));
  let ready = $state(false);
  onMount(() => void applyBenchParams().then(() => (ready = true)));
</script>

<svelte:head><title>{m.music_strings_fretboard_title()}</title></svelte:head>

{#if ready}
  {#key mode}
    {#if mode === "spider" || mode === "positions" || mode === "legato" || mode === "harmonics"}
      <LineDrill kind={mode} />
    {:else if mode === "bends"}
      <BendDrill />
    {:else}
      <FindDrill kind={mode as "note-finder" | "interval-recall"} />
    {/if}
  {/key}
{/if}
