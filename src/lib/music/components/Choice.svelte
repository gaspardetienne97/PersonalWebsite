<script lang="ts" generics="T extends string | number">
  import * as Tooltip from "@repo/ui/tooltip";
  import Picker from "$lib/music/components/Picker.svelte";
  // A labelled setup choice: buttons that wrap for up to a dozen options (all
  // visible, one tap), a list only past that. Never overflows at 375 px. Long
  // catalogues with search belong in CatalogPicker.
  interface Option {
    value: T;
    label: string;
    /** A short explanation shown as a tooltip and read with the button. */
    hint?: string;
    /** A second line on the button (the degrees of a level, the notes of a chord). */
    detail?: string;
    /** List heading when the options show as a list. */
    group?: string;
  }
  interface Props {
    label: string;
    options: readonly Option[];
    value: T;
    onchange?: (v: T) => void;
    disabled?: boolean;
    /** Prefer a list once there are more than 8 options (long labels). */
    select?: boolean;
    /** Lets the setup sentence jump to this control (DrillShell summary clauses). */
    setupKey?: string;
  }
  let { label, options, value = $bindable(), onchange, disabled = false, select = false, setupKey }: Props = $props();
  const asList = $derived(options.length > 12 || (select && options.length > 8));
  const id = `choice-${Math.random().toString(36).slice(2, 8)}`;
  function set(v: T) {
    value = v;
    onchange?.(v);
  }
</script>

{#if asList}
  <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup={setupKey}>
    <span class="font-medium">{label}</span>
    <Picker
      {label}
      {disabled}
      value={String(value)}
      options={options.map((o) => ({ value: String(o.value), label: o.label, group: o.group }))}
      onchange={(raw) => {
        const hit = options.find((o) => String(o.value) === raw);
        if (hit) set(hit.value);
      }}
    />
  </div>
{:else}
  <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-labelledby={id} data-setup={setupKey}>
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
    class="min-h-11 rounded-lg border px-3 text-sm {o.detail ? 'py-1.5 text-left' : ''} {o.value === value
      ? 'border-transparent bg-instr font-semibold text-ws-stage'
      : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
    aria-pressed={o.value === value}
    aria-describedby={o.hint ? `${id}-${o.value}-hint` : undefined}
    {disabled}
    onclick={() => set(o.value)}
    >{#if o.detail}<span class="block leading-tight">{o.label}</span><span class="block text-[13px] font-normal opacity-75">{o.detail}</span>{:else}{o.label}{/if}</button
  >
{/snippet}
