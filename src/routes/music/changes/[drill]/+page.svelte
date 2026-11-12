<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>{data.title} | Woodshed</title></svelte:head>

<!-- Another mode is another drill: fresh setup, state and run. -->
{#key data.mode}
  <data.Mode />
{/key}
