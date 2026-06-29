<script lang="ts">
  import { cn } from "@repo/ui/utils";

  // Instrument identity switcher. Each option carries its own `data-instr`, so the
  // hue dot + active ring resolve to that instrument's hue via the cascade.
  // Hue is used only as a dot + subtle ring (identity), never as button text —
  // text stays on the readable foreground token (contrast guardrail).
  type Option = { value: string; label: string };

  let {
    options,
    value = $bindable(),
    onChange,
    ariaLabel = "Instrument",
    class: cls = "",
  }: {
    options: Option[];
    value: string;
    onChange?: (value: string) => void;
    ariaLabel?: string;
    class?: string;
  } = $props();

  function select(next: string): void {
    value = next;
    onChange?.(next);
  }
</script>

<div
  role="group"
  aria-label={ariaLabel}
  class={cn("inline-flex items-center gap-0.5 rounded-lg border bg-muted/60 p-1", cls)}
>
  {#each options as option (option.value)}
    <button
      type="button"
      data-instr={option.value}
      aria-pressed={value === option.value}
      onclick={() => select(option.value)}
      class={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        value === option.value
          ? "bg-background text-foreground shadow-sm ring-1 ring-instr/40"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span class="size-2 shrink-0 rounded-full bg-instr" aria-hidden="true"></span>
      {option.label}
    </button>
  {/each}
</div>
