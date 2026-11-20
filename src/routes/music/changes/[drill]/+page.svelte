<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  let { data } = $props();
</script>

<svelte:head><title>{m.music_drills_changes_head_title({ title: data.title })}</title></svelte:head>

<!-- Another mode is another drill: fresh setup, state and run. -->
{#key data.mode}
  <data.Mode />
{/key}
