<script lang="ts">
  let {
    instrument,
    dot = false,
    class: cls = "",
  }: {
    instrument: string;
    dot?: boolean;
    class?: string;
  } = $props();
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary {cls}"
>
  {#if dot}
    <span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
  {/if}
  {instrument}
</span>
