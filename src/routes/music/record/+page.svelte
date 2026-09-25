<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import MidiRecorder from "$lib/music/hubs/create/MidiRecorder.svelte";
  import AudioRecorder from "$lib/music/hubs/create/AudioRecorder.svelte";
  import { bench } from "$lib/music/bench.svelte";

  const TABS = [
    { id: "midi", label: "MIDI notes" },
    { id: "mic", label: "Microphone" },
  ] as const;
  const source = $derived(page.url.searchParams.get("source") === "mic" ? "mic" : "midi");
  let status = $state("");
  const announce = (msg: string) => (status = msg);

  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });
</script>

<svelte:head><title>Record | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Record</h1>
      <p class="mt-1 max-w-prose text-ws-soft">
        Capture a take, listen back, and keep what is worth keeping. Takes stay in this browser and are in your backups.
      </p>
    </div>
    <HubTabs param="source" tabs={TABS} label="Record from" />
  </header>
  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
  {#key source}
    {#if source === "mic"}<AudioRecorder {announce} />{:else}<MidiRecorder {announce} />{/if}
  {/key}
</div>
