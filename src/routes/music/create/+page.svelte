<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import BeatGrid from "$lib/music/hubs/create/BeatGrid.svelte";
  import PianoRoll from "$lib/music/hubs/create/PianoRoll.svelte";
  import { bench } from "$lib/music/bench.svelte";

  const TABS = [
    { id: "beat", label: "Beat grid" },
    { id: "roll", label: "Piano roll" },
  ] as const;
  const mode = $derived(page.url.searchParams.get("mode") === "roll" ? "roll" : "beat");
  let status = $state("");
  const announce = (msg: string) => (status = msg);

  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });
</script>

<svelte:head><title>{mode === "roll" ? "Piano roll" : "Beat grid"} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Create</h1>
      <p class="mt-1 max-w-prose text-ws-soft">
        {mode === "roll"
          ? "Sketch parts note by note, hear them back, and take them to a DAW as MIDI or WAV."
          : "Build a beat on sixteen steps, play it on your own samples, and send the kit to the MPC."}
        <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Record a take</a>
      </p>
    </div>
    <HubTabs param="mode" tabs={TABS} label="Create modes" />
  </header>
  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
  {#key mode}
    {#if mode === "roll"}<PianoRoll {announce} />{:else}<BeatGrid {announce} />{/if}
  {/key}
</div>
