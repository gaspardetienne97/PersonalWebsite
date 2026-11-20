<script lang="ts">
  import { page } from "$app/state";
  import { m } from "@repo/i18n/messages.js";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import MidiRecorder from "#lib/music/hubs/create/MidiRecorder.svelte";
  import AudioRecorder from "#lib/music/hubs/create/AudioRecorder.svelte";
  import { bench } from "#lib/music/bench.svelte.ts";

  const TABS = [
    { id: "midi", label: m.music_runtime_record_tab_midi() },
    { id: "mic", label: m.music_runtime_record_tab_mic() },
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

<svelte:head><title>{m.music_runtime_record_head_title()}</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{m.music_runtime_record_title()}</h1>
      <p class="mt-1 max-w-prose text-ws-soft max-sm:hidden">
        {m.music_runtime_record_intro()}
      </p>
    </div>
    <HubTabs param="source" tabs={TABS} label={m.music_runtime_record_tabs_label()} />
  </header>
  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
  {#key source}
    {#if source === "mic"}<AudioRecorder {announce} />{:else}<MidiRecorder {announce} />{/if}
  {/key}
</div>
