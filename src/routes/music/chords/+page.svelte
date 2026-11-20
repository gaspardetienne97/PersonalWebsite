<script lang="ts">
  // Chord-Perfect (catalog 4.5): Build, Pick, Strum and identify, Changes.
  import { m } from "@repo/i18n/messages.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import ShapeDrill from "#lib/music/drills/guitar/ShapeDrill.svelte";
  import StrumIdentify from "#lib/music/drills/guitar/StrumIdentify.svelte";
  import ChangesDrill from "#lib/music/drills/guitar/ChangesDrill.svelte";
  import LineDrill from "#lib/music/drills/guitar/LineDrill.svelte";
  import { applyBenchParams } from "#lib/music/drills/guitar/instrument.svelte.ts";
  import { CHORD_MODES, modeFrom } from "#lib/music/drills/guitar/modes.ts";

  const mode = $derived(modeFrom(CHORD_MODES, page.url.searchParams.get("mode")));
  let ready = $state(false);
  onMount(() => void applyBenchParams().then(() => (ready = true)));
</script>

<svelte:head><title>{m.music_strings_chords_title()}</title></svelte:head>

{#if ready}
  {#key mode}
    {#if mode === "build" || mode === "pick"}
      <ShapeDrill kind={mode} />
    {:else if mode === "strum"}
      <StrumIdentify />
    {:else if mode === "fingerpick"}
      <LineDrill kind="fingerpick" />
    {:else}
      <ChangesDrill />
    {/if}
  {/key}
{/if}
