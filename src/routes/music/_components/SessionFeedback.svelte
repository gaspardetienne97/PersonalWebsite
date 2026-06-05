<script lang="ts">
  let {
    kind,
    message,
    detail,
    xp,
    class: cls = "",
    onreplay,
  }: {
    kind: "correct" | "wrong";
    message: string;
    detail?: string;
    xp?: number;
    class?: string;
    onreplay?: () => void;
  } = $props();
</script>

<div
  role="status"
  aria-live="polite"
  class="flex items-center gap-4 rounded-xl border p-4
    {kind === 'correct'
    ? 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400'
    : 'border-destructive/20 bg-destructive/10 text-destructive'}
    {cls}"
>
  <div
    class="grid size-10 shrink-0 place-items-center rounded-full text-xl {kind === 'correct'
      ? 'bg-green-500/20'
      : 'bg-destructive/20'}"
  >
    {kind === "correct" ? "✓" : "✗"}
  </div>
  <div class="min-w-0 flex-1">
    <div class="font-semibold">{message}</div>
    {#if detail}
      <div class="mt-0.5 text-sm opacity-80">{detail}</div>
    {/if}
  </div>
  {#if kind === "correct" && xp}
    <span class="shrink-0 rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">+{xp} XP</span>
  {/if}
  {#if kind === "wrong" && onreplay}
    <button
      type="button"
      onclick={onreplay}
      class="shrink-0 rounded-lg border border-destructive/30 px-3 py-1.5 text-sm font-medium hover:bg-destructive/10"
    >
      Hear again
    </button>
  {/if}
</div>
