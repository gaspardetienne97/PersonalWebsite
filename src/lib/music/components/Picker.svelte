<script lang="ts" module>
  export interface PickOption {
    value: string;
    label: string;
    /** Options sharing a group are listed under its heading. */
    group?: string;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  // The app's one dropdown: @repo/ui's Select (bits-ui) in Woodshed's colours,
  // in place of the browser's own <select>, whose open list ignores the theme.
  // `tone="stage"` sits on the dark stage panels; `tone="bare"` inside a pill
  // that draws its own border. With `action`, it is a menu
  // of things to do (Add chords, Presets): it shows the placeholder again
  // after each pick.
  import * as Select from "@repo/ui/select";
  import { cn } from "@repo/ui/utils";

  let {
    value = "",
    options,
    onchange,
    label,
    placeholder = "Choose",
    tone = "surface",
    action = false,
    disabled = false,
    class: className = "",
  }: {
    value?: string;
    options: readonly PickOption[];
    onchange: (value: string) => void;
    /** The accessible name (the picker has no visible label of its own). */
    label: string;
    placeholder?: string;
    tone?: "surface" | "stage" | "bare";
    action?: boolean;
    disabled?: boolean;
    class?: string;
  } = $props();

  // Controlled locally so an action picker can go back to its placeholder.
  let current = $state("");
  $effect.pre(() => {
    current = action ? "" : value;
  });

  const shown = $derived(options.find((o) => o.value === current));
  const groups = $derived(
    options.reduce<{ name?: string; items: PickOption[] }[]>((out, o) => {
      const last = out.at(-1);
      if (last && last.name === o.group) last.items.push(o);
      else out.push({ name: o.group, items: [o] });
      return out;
    }, []),
  );

  // The open list is drawn inside the app's root so it keeps the theme's colours.
  // Found from the trigger once it is on the page (on a fresh load the root is
  // not reachable while components are still being set up); the body when a
  // component is rendered on its own, as in tests.
  let trigger = $state<HTMLElement | null>(null);
  const portalTo = $derived(trigger?.closest<HTMLElement>(".woodshed") ?? undefined);

  function pick(v: string) {
    if (!v) return;
    onchange(v);
    if (action) queueMicrotask(() => (current = ""));
  }
</script>

<Select.Root type="single" bind:value={current} onValueChange={pick} {disabled}>
  <Select.Trigger
    bind:ref={trigger}
    aria-label={label}
    data-value={action ? undefined : value}
    class={cn(
      "min-h-11 w-full min-w-0 justify-between gap-2 rounded-lg px-3 text-sm font-medium shadow-none transition-colors data-[size=default]:h-auto [&_svg]:opacity-70",
      tone === "stage"
        ? "border-ws-stage-ink/15 bg-ws-stage-ink/8 text-ws-stage-ink hover:bg-ws-stage-ink/15 dark:bg-ws-stage-ink/8 [&_svg:not([class*='text-'])]:text-ws-stage-ink"
        : tone === "bare"
          ? "min-h-9 border-0 bg-transparent px-0 hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent [&_svg:not([class*='text-'])]:text-ws-soft"
          : "border-ws-line bg-ws-surface text-ws-ink hover:bg-ws-raised dark:bg-ws-surface dark:hover:bg-ws-raised [&_svg:not([class*='text-'])]:text-ws-soft",
      className,
    )}
  >
    <span class="truncate" class:opacity-70={!shown}>{shown?.label ?? placeholder}</span>
  </Select.Trigger>
  <Select.Content
    portalProps={{ to: portalTo }}
    class="max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border-ws-line bg-ws-surface p-1 text-ws-ink shadow-lg"
  >
    {#each groups as g, gi (gi)}
      {#if g.name}
        <Select.Group>
          <Select.GroupHeading class="px-3 pb-1 pt-2 text-xs font-semibold text-ws-soft">{g.name}</Select.GroupHeading>
          {@render items(g.items)}
        </Select.Group>
      {:else}
        {@render items(g.items)}
      {/if}
    {/each}
  </Select.Content>
</Select.Root>

{#snippet items(list: PickOption[])}
  {#each list as o (o.value)}
    <Select.Item
      value={o.value}
      label={o.label}
      disabled={o.disabled}
      class="min-h-10 rounded-lg px-3 text-sm data-[highlighted]:bg-instr-wash data-[highlighted]:text-ws-ink data-[selected]:font-semibold [&_svg]:text-instr-ink"
    />
  {/each}
{/snippet}
