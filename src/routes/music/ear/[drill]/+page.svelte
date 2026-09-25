<script lang="ts">
  import { page } from "$app/state";
  import EarDrill from "$lib/music/drills/ear/EarDrill.svelte";

  let { data } = $props();
</script>

<svelte:head><title>{data.title} | Woodshed</title></svelte:head>

<!-- A new drill slug is a new drill: fresh setup, state and run. -->
{#key page.params.drill}
  <EarDrill slug={page.params.drill ?? "mixed"} />
{/key}
