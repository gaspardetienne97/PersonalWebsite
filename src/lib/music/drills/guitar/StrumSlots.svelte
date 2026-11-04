<script lang="ts" module>
  export type SlotMark = { kind: "ontime" | "early" | "late" | "wrong" | "miss"; text: string };
</script>

<script lang="ts">
  // One bar of a strum pattern as slots ("1 & 2 & 3 & 4 &"): a down or up arrow
  // (or a chuck) where the hand strikes, an empty slot where it passes. During a
  // run the slot sounding now is lit on the click, and each stroke of the bar
  // gets a mark as it is judged: a glyph as well as a colour.
  import ArrowDown from "lucide-svelte/icons/arrow-down";
  import ArrowUp from "lucide-svelte/icons/arrow-up";
  import X from "lucide-svelte/icons/x";
  import Check from "lucide-svelte/icons/check";
  import ChevronsLeft from "lucide-svelte/icons/chevrons-left";
  import ChevronsRight from "lucide-svelte/icons/chevrons-right";
  import Minus from "lucide-svelte/icons/minus";
  import type { Slot } from "./strum-slots";

  // `legend`: what the marks mean, before the run (and in the demo); during a run each mark carries its own word.
  let { slots, lit = null, marks = {}, label, legend = false }: { slots: Slot[]; lit?: number | null; marks?: Record<number, SlotMark>; label: string; legend?: boolean } = $props();

  const per = $derived(Math.max(1, Math.round(slots.length / 4)));
  const icon = $derived(slots.length > 16 ? "size-3.5" : slots.length > 8 ? "size-4" : "size-6");
  const WORD = { down: "down", up: "up", mute: "chuck" } as const;
  const MARK_ICON = { ontime: Check, early: ChevronsLeft, late: ChevronsRight, wrong: X, miss: Minus } as const;
  const MARK_TONE = { ontime: "bg-success text-success-foreground", early: "bg-early text-[color:var(--on-early)]", late: "bg-late text-[color:var(--on-late)]", wrong: "bg-destructive text-white", miss: "border border-ws-stage-ink/40 text-ws-stage-soft" } as const;
</script>

<ol class="grid gap-y-1" style:grid-template-columns="repeat({slots.length}, minmax(0, 1fr))" aria-label={label}>
  {#each slots as s, i (i)}
    {@const m = marks[i]}
    {@const MarkIcon = m ? MARK_ICON[m.kind] : null}
    <li class="flex min-w-0 flex-col items-center gap-1 {i % per === 0 && i ? 'border-l border-ws-stage-ink/15' : ''}">
      <span
        class="ws-pulse grid h-11 w-full max-w-11 place-items-center rounded-lg transition-colors {i === lit
          ? 'bg-instr-strong text-on-instr'
          : s.stroke
            ? s.accent
              ? 'bg-ws-stage-ink/15'
              : 'bg-ws-stage-ink/8'
            : 'border border-dashed border-ws-stage-ink/15'}"
        data-beat={i === lit ? i + 1 : undefined}
        aria-current={i === lit ? "step" : undefined}
      >
        {#if s.stroke === "down"}<ArrowDown class={icon} strokeWidth={s.accent ? 3.25 : 2.25} aria-hidden="true" />
        {:else if s.stroke === "up"}<ArrowUp class={icon} strokeWidth={s.accent ? 3.25 : 2.25} aria-hidden="true" />
        {:else if s.stroke === "mute"}<X class={icon} strokeWidth={s.accent ? 3.25 : 2.25} aria-hidden="true" />
        {/if}
      </span>
      <span class="text-[13px] leading-none tnum {i % per === 0 ? 'font-semibold' : 'text-ws-stage-soft'}" aria-hidden="true">{s.count}</span>
      <span class="grid size-6 place-items-center">
        {#if m && MarkIcon}
          {#key m.kind}<span class="ws-pop grid size-6 place-items-center rounded-full {MARK_TONE[m.kind]}" title={m.text}><MarkIcon class="size-4" strokeWidth={3} aria-hidden="true" /></span>{/key}
        {/if}
      </span>
      <span class="sr-only">{s.count || "between"}: {s.stroke ? `${s.accent ? "accented " : ""}${WORD[s.stroke]}` : "no strum"}{m ? `, ${m.text}` : ""}</span>
    </li>
  {/each}
</ol>
{#if legend}
  <!-- What the marks mean, shown once before the run: the same glyphs the strokes get as they are judged. -->
  <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-stage-soft" aria-hidden="true">
    {#each [["ontime", "On time"], ["early", "Early"], ["late", "Late"], ["miss", "Missed"], ["wrong", "Wrong"]] as const as [k, word] (k)}
      {@const Icon = MARK_ICON[k]}
      <li class="flex items-center gap-1.5"><span class="grid size-5 place-items-center rounded-full {MARK_TONE[k]}"><Icon class="size-3.5" strokeWidth={3} /></span>{word}</li>
    {/each}
  </ul>
{/if}
