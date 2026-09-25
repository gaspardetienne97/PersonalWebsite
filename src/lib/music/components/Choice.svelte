<script lang="ts" generics="T extends string | number">
  import * as Tooltip from "@repo/ui/tooltip";
  // A labelled setup choice: a wrapping segmented control for a few options,
  // a native select for many. Never overflows at 375 px.
  interface Option {
    value: T;
    label: string;
    /** A short explanation shown as a tooltip and read with the button. */
    hint?: string;
  }
  interface Props {
    label: string;
    options: readonly Option[];
    value: T;
    onchange?: (v: T) => void;
    disabled?: boolean;
    /** Force a select even for few options. */
    select?: boolean;
  }
  let { label, options, value = $bindable(), onchange, disabled = false, select = false }: Props = $props();
  const id = `choice-${Math.random().toString(36).slice(2, 8)}`;
  function set(v: T) {
    value = v;
    onchange?.(v);
  }
</script>

{#if select || options.length > 5}
  <label class="flex min-w-0 flex-col gap-1 text-sm">
    <span class="font-medium">{label}</span>
    <select
      class="min-h-11 w-full min-w-0 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm"
      {disabled}
      value={String(value)}
      onchange={(e) => {
        const raw = e.currentTarget.value;
        const hit = options.find((o) => String(o.value) === raw);
        if (hit) set(hit.value);
      }}
    >
      {#each options as o (o.value)}<option value={String(o.value)}>{o.label}</option>{/each}
    </select>
  </label>
{:else}
  <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-labelledby={id}>
    <span id={id} class="font-medium">{label}</span>
    <div class="flex flex-wrap gap-1.5">
      {#each options as o (o.value)}
        {#if o.hint}
          <Tooltip.Provider delayDuration={250}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}{@render option(o, props)}{/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="max-w-64">{o.hint}</Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
          <span id="{id}-{o.value}-hint" class="sr-only">{o.hint}</span>
        {:else}
          {@render option(o, {})}
        {/if}
      {/each}
    </div>
  </div>
{/if}

{#snippet option(o: Option, props: Record<string, unknown>)}
  <button
    {...props}
    type="button"
    class="min-h-11 rounded-lg border px-3 text-sm {o.value === value
      ? 'border-transparent bg-instr font-semibold text-ws-stage'
      : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
    aria-pressed={o.value === value}
    aria-describedby={o.hint ? `${id}-${o.value}-hint` : undefined}
    {disabled}
    onclick={() => set(o.value)}>{o.label}</button
  >
{/snippet}
