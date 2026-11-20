<script lang="ts">
  import { TUNINGS } from "@repo/music-core/data/index";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import Flashcards from "#lib/music/drills/reading/Flashcards.svelte";
  import SightReading from "#lib/music/drills/reading/SightReading.svelte";
  import { READING_SETUP } from "#lib/music/drills/reading/reading.ts";

  const cfg = new DrillSetup("reading", { ...READING_SETUP });
  const activity = $derived(cfg.value.activity === "sight-reading" ? "sight-reading" : "flashcards");
  // The practice strip's instrument; the shell switches the strip off the MPC.
  const instrument = $derived.by(() => {
    const pick = settings.value.activeInstrument;
    return pick === "guitar" || pick === "ukulele" || pick === "aerophone" ? pick : "piano";
  });
  const tuning = $derived(
    instrument === "piano" || instrument === "aerophone"
      ? null
      : (TUNINGS[instrument].find((t) => t.id === (instrument === "guitar" ? settings.value.guitarTuningId : settings.value.ukuleleTuningId)) ?? TUNINGS[instrument][0]),
  );
</script>

<svelte:head><title>{activity === "flashcards" ? "Note reading" : "Sight-reading"} | Woodshed</title></svelte:head>

{#key `${activity}|${instrument}`}
  {#if activity === "flashcards"}
    <Flashcards {cfg} {instrument} {tuning} />
  {:else}
    <SightReading {cfg} {instrument} {tuning} />
  {/if}
{/key}
