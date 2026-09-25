<script lang="ts">
  import { TUNINGS } from "@repo/music-core/data/index";
  import Choice from "$lib/music/components/Choice.svelte";
  import { bench } from "$lib/music/bench.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { settings } from "$lib/music/runtime";
  import Flashcards from "$lib/music/drills/reading/Flashcards.svelte";
  import SightReading from "$lib/music/drills/reading/SightReading.svelte";
  import { READING_SETUP } from "$lib/music/drills/reading/reading";

  const cfg = new DrillSetup("reading", { ...READING_SETUP });
  const activity = $derived(cfg.value.activity === "sight-reading" ? "sight-reading" : "flashcards");
  const instrument = $derived.by(() => {
    const pick = cfg.value.instrument === "auto" ? settings.value.activeInstrument : cfg.value.instrument;
    return pick === "guitar" || pick === "ukulele" ? pick : "piano";
  });
  const tuning = $derived(
    instrument === "piano"
      ? null
      : (TUNINGS[instrument].find((t) => t.id === (instrument === "guitar" ? settings.value.guitarTuningId : settings.value.ukuleleTuningId)) ?? TUNINGS[instrument][0]),
  );
</script>

<svelte:head><title>{activity === "flashcards" ? "Note reading" : "Sight-reading"} | Woodshed</title></svelte:head>

{#if !bench.running}
  <div class="mx-auto mb-3 flex w-full max-w-6xl">
    <Choice
      label="Activity"
      options={[
        { value: "flashcards", label: "Flashcards" },
        { value: "sight-reading", label: "Sight-reading" },
      ]}
      value={activity}
      onchange={(v) => cfg.set({ activity: v })}
    />
  </div>
{/if}

{#key `${activity}|${instrument}`}
  {#if activity === "flashcards"}
    <Flashcards {cfg} {instrument} {tuning} />
  {:else}
    <SightReading {cfg} {instrument} {tuning} />
  {/if}
{/key}
