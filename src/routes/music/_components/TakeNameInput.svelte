<script lang="ts">
  let {
    value,
    label,
    placeholder,
    tone = "name",
    onCommit,
  }: {
    value: string;
    label: string;
    placeholder?: string;
    /** "name" reads as the card title; "note" as its quiet one-liner. */
    tone?: "name" | "note";
    onCommit?: (value: string) => void;
  } = $props();

  let field = $state<HTMLInputElement>();
  let commits = $state(0);

  // The field always shows what is stored: a commit that was rejected (blank) or
  // normalised (trimmed) leaves `value` unchanged, so the commit count re-runs this.
  $effect(() => {
    void commits;
    if (field) field.value = value;
  });

  function commit(event: Event & { currentTarget: HTMLInputElement }): void {
    onCommit?.(event.currentTarget.value);
    commits += 1;
  }

  function revert(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    // Restoring the value before blurring means the browser fires no change event.
    event.currentTarget.value = value;
    event.currentTarget.blur();
  }
</script>

<!-- Reads as text until it is hovered or focused, so a card stays a card. -->
<input
  type="text"
  class={[
    "min-h-11 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1",
    "hover:border-input focus:border-input focus:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    tone === "name" ? "text-sm font-semibold" : "text-xs text-muted-foreground",
  ]}
  bind:this={field}
  {value}
  {placeholder}
  aria-label={label}
  onchange={commit}
  onkeydown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") revert(event);
  }}
/>
