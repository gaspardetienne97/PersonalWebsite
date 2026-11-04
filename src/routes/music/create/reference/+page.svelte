<script lang="ts">
  // The chord and scale reference: tools for making music, so it sits with Create, not with the songs.
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import ReferenceView from "$lib/music/hubs/library/ReferenceView.svelte";

  let status = $state("Showing the chord and scale reference.");
</script>

<svelte:head><title>Chords and scales | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="min-w-0">
    <a class="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-instr-ink" href="/music/create"><ArrowLeft class="size-4" aria-hidden="true" />Create</a>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Chords and scales</h1>
    <p class="mt-1 max-w-prose text-ws-soft">Every chord, scale and key in one place, to look up while you write or practise.</p>
  </header>
  <p role="status" class="sr-only">{status}</p>
  <ReferenceView onstatus={(s) => (status = s)} />
</div>
