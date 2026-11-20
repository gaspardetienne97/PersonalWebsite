<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import SongsView from "#lib/music/hubs/library/SongsView.svelte";
  import ReferenceView from "#lib/music/hubs/library/ReferenceView.svelte";
  import ImportView from "#lib/music/hubs/library/ImportView.svelte";

  const TABS = [
    { id: "songs", label: "Songs" },
    { id: "reference", label: "Reference" },
    { id: "import", label: "Import" },
  ] as const;
  const tab = $derived(page.url.searchParams.get("tab") ?? "songs");
  const label = $derived(TABS.find((t) => t.id === tab)?.label ?? "Songs");
  let status = $state("");
  $effect(() => {
    status = `Showing ${label}.`;
  });
</script>

<svelte:head><title>Library: {label} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Library</h1>
      <p class="mt-1 text-ws-soft">Your songs, the chord and scale reference, and a way in for new scores.</p>
    </div>
    <HubTabs param="tab" tabs={TABS} label="Library views" />
  </header>
  <p role="status" class="sr-only">{status}</p>
  {#if tab === "reference"}
    <ReferenceView onstatus={(s) => (status = s)} />
  {:else if tab === "import"}
    <ImportView onstatus={(s) => (status = s)} />
  {:else}
    <SongsView onstatus={(s) => (status = s)} />
  {/if}
</div>
