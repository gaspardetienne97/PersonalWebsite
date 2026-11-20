<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The chord and scale reference: tools for making music, so it sits with Create, not with the songs.
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ReferenceView from "#lib/music/hubs/library/ReferenceView.svelte";

  let status = $state<string>(m.music_hubs_ref_page_status());
</script>

<svelte:head><title>{m.music_hubs_ref_head()}</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="min-w-0">
    <a class="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-instr-ink" href="/music/create"><ArrowLeft class="size-4" aria-hidden="true" />{m.music_hubs_cr_title()}</a>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{m.music_hubs_cr_chords_scales()}</h1>
    <p class="mt-1 max-w-prose text-ws-soft">{m.music_hubs_ref_page_intro()}</p>
  </header>
  <p role="status" class="sr-only">{status}</p>
  <ReferenceView onstatus={(s) => (status = s)} />
</div>
