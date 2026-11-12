<script lang="ts" module>
  /** One mode of a trainer. With `href` (a catalog entry's own pathname) picking it goes there. */
  export interface TrainerMode {
    id: string;
    label: string;
    href?: string;
  }
  /** Catalog entries as a trainer's modes, one pathname each (Ear, Play over changes). */
  export const trainerModes = (entries: readonly { id: string; title: string; route: string }[]): TrainerMode[] =>
    entries.map((e) => ({ id: e.id, label: e.title, href: e.route }));
</script>

<script lang="ts">
  // A trainer's title is a picker for its mode: "Rhythm" then "Echo" with a chevron, in the title's own
  // type. The modes come from the catalog: one entry's modes (Rhythm, which keeps one pathname), or
  // one entry per pathname (`trainerModes`), where picking navigates.
  import { goto } from "$app/navigation";
  import Picker from "./Picker.svelte";

  let {
    label,
    options,
    value,
    onpick,
  }: {
    /** The accessible name ("Rhythm drill"). */
    label: string;
    options: readonly TrainerMode[];
    value: string;
    /** Left out, a mode with an `href` is navigated to. */
    onpick?: (id: string) => void;
  } = $props();

  function pick(id: string) {
    if (onpick) return onpick(id);
    const href = options.find((o) => o.id === id)?.href;
    if (href) void goto(href);
  }
</script>

<Picker
  {label}
  {value}
  options={options.map((o) => ({ value: o.id, label: o.label }))}
  onchange={pick}
  tone="bare"
  class="ws-title min-h-11 w-auto max-w-full gap-1.5 rounded-lg px-2.5 font-display font-semibold tracking-tight text-instr-ink hover:bg-instr-wash dark:hover:bg-instr-wash [&_svg:not([class*='text-'])]:text-instr-ink"
/>
