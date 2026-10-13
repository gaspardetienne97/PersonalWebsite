<script lang="ts">
  // A key picker: a button with the key on it that opens the circle of fifths
  // (major keys only). Neighbouring keys sit side by side, so the key a fifth
  // or a fourth away is one tap over. Values are pitch classes; `name` spells
  // them the way the caller's drill does (Gb or F#, Db or C#).
  import * as Popover from "@repo/ui/popover";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import { cn } from "@repo/ui/utils";
  import { CIRCLE } from "@repo/music-core/theory/circle";
  import CircleOfFifths from "./CircleOfFifths.svelte";

  let {
    value,
    onchange,
    label,
    name = (pc: number) => CIRCLE.find((k) => k.pc === pc)?.major ?? String(pc),
    tone = "surface",
    class: className = "",
  }: {
    /** Pitch class of the key, 0 to 11. */
    value: number;
    onchange: (pc: number) => void;
    label: string;
    name?: (pc: number) => string;
    tone?: "surface" | "stage";
    class?: string;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLElement | null>(null);
  // Inside the app's root, so the open wheel keeps the theme's colours (as Picker does).
  const portalTo = $derived(trigger?.closest<HTMLElement>(".woodshed") ?? undefined);
  const selected = $derived(CIRCLE.find((k) => k.pc === value)?.fifths ?? 0);
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    bind:ref={trigger}
    aria-label="{label}: {name(value)}"
    class={cn(
      "flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
      tone === "stage" ? "border-ws-stage-ink/15 bg-ws-stage-ink/8 text-ws-stage-ink hover:bg-ws-stage-ink/15" : "border-ws-line bg-ws-surface text-ws-ink hover:bg-ws-raised",
      className,
    )}
  >
    <span class="truncate">{name(value)}</span>
    <ChevronDown class="size-4 opacity-70" aria-hidden="true" />
  </Popover.Trigger>
  <Popover.Content portalProps={{ to: portalTo }} class="w-[min(19rem,calc(100vw-2rem))] rounded-xl border-ws-line bg-ws-surface p-3 text-ws-ink shadow-lg">
    <CircleOfFifths
      compact
      numerals={false}
      {selected}
      label="{label}: the circle of fifths"
      onpick={(f) => {
        onchange(CIRCLE.find((k) => k.fifths === f || k.enharmonic?.fifths === f)?.pc ?? 0);
        open = false;
      }}
    />
    <p class="mt-2 text-center text-xs text-ws-soft">A fifth up clockwise, a fourth up the other way.</p>
  </Popover.Content>
</Popover.Root>
