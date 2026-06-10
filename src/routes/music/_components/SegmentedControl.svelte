<script lang="ts">
  type Option = { value: string; label: string };

  let {
    options,
    value = $bindable(),
    onChange,
    size = "md",
    class: cls = "",
    ariaLabel,
  }: {
    options: Option[];
    value: string;
    onChange?: (value: string) => void;
    size?: "sm" | "md";
    class?: string;
    ariaLabel?: string;
  } = $props();

  function select(next: string): void {
    value = next;
    onChange?.(next);
  }
</script>

<div
  role="group"
  aria-label={ariaLabel}
  class="inline-flex items-center gap-0.5 rounded-lg border bg-muted/60 p-1 {cls}"
>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={value === option.value}
      onclick={() => select(option.value)}
      class="rounded-md font-semibold transition-colors {size === 'sm'
        ? 'px-3 py-1 text-xs'
        : 'px-3.5 py-1.5 text-sm'} {value === option.value
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'}"
    >
      {option.label}
    </button>
  {/each}
</div>
