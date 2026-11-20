<script lang="ts" module>
  export type SlotMark = { kind: "ontime" | "early" | "late" | "wrong" | "miss"; text: string };
</script>

<script lang="ts">
  // One bar of a strum pattern as slots ("1 & 2 & 3 & 4 &"): a down or up arrow
  // (or a chuck) where the hand strikes, an empty slot where it passes. During a
  // run the slot sounding now is lit on the click, and each stroke of the bar
  // gets a mark as it is judged: a glyph as well as a colour.
  import { m } from "@repo/i18n/messages.js";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import X from "@lucide/svelte/icons/x";
  import Check from "@lucide/svelte/icons/check";
  import ChevronsLeft from "@lucide/svelte/icons/chevrons-left";
  import ChevronsRight from "@lucide/svelte/icons/chevrons-right";
  import Minus from "@lucide/svelte/icons/minus";
  import type { Slot } from "./strum-slots";

  // `legend`: what the marks mean, before the run (and in the demo); during a run each mark carries its own word.
  // `compact` (results): one short row, each stroke's mark in its slot (the arrow where nothing was judged).
  // `counts` (results): the legend becomes the run's tally, each mark with how many strums got it, so the tally and the grid share one set of glyphs.
  let { slots, lit = null, marks = {}, label, legend = false, compact = false, counts }: { slots: Slot[]; lit?: number | null; marks?: Record<number, SlotMark>; label: string; legend?: boolean; compact?: boolean; counts?: Record<SlotMark["kind"], number> } = $props();

  const per = $derived(Math.max(1, Math.round(slots.length / 4)));
  const icon = $derived(slots.length > 16 ? "size-3.5" : slots.length > 8 ? "size-4" : "size-6");
  const WORD = { down: m.music_strings_slots_down, up: m.music_strings_slots_up, mute: m.music_strings_slots_chuck } as const;
  const ACCENTED = { down: m.music_strings_slots_down_accented, up: m.music_strings_slots_up_accented, mute: m.music_strings_slots_chuck_accented } as const;
  const MARK_ICON = { ontime: Check, early: ChevronsLeft, late: ChevronsRight, wrong: X, miss: Minus } as const;
  const MARK_TONE = { ontime: "bg-success text-success-foreground", early: "bg-early text-[color:var(--on-early)]", late: "bg-late text-[color:var(--on-late)]", wrong: "bg-destructive text-white", miss: "border border-ws-stage-ink/40 text-ws-stage-soft" } as const;
</script>

<ol class="grid gap-y-1" style:grid-template-columns="repeat({slots.length}, minmax(0, 1fr))" aria-label={label}>
  {#each slots as s, i (i)}
    {@const mark = marks[i]}
    {@const MarkIcon = mark ? MARK_ICON[mark.kind] : null}
    {@const count = s.count || m.music_strings_slots_between()}
    {@const stroke = s.stroke ? (s.accent ? ACCENTED : WORD)[s.stroke]() : m.music_strings_slots_no_strum()}
    <li class="flex min-w-0 flex-col items-center gap-1 {i % per === 0 && i ? 'border-l border-ws-stage-ink/15' : ''}">
      {#if compact}
        <span class="grid size-7 place-items-center">
          {#if mark && MarkIcon}<span class="grid size-7 place-items-center rounded-full {MARK_TONE[mark.kind]}" title={mark.text}><MarkIcon class="size-4" strokeWidth={3} aria-hidden="true" /></span>
          {:else if s.stroke}<span class="size-1.5 rounded-full bg-ws-stage-ink/40" aria-hidden="true"></span>{/if}
        </span>
      {:else}
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
      {/if}
      <span class="text-[13px] leading-none tnum {i % per === 0 ? 'font-semibold' : 'text-ws-stage-soft'}" aria-hidden="true">{s.count}</span>
      <!-- The mark row: kept while a run can mark it, left out before one (no empty band under the counts). -->
      <span class="grid size-6 place-items-center" class:hidden={compact || (legend && !Object.keys(marks).length)}>
        {#if !compact && mark && MarkIcon}
          {#key mark.kind}<span class="ws-pop grid size-6 place-items-center rounded-full {MARK_TONE[mark.kind]}" title={mark.text}><MarkIcon class="size-4" strokeWidth={3} aria-hidden="true" /></span>{/key}
        {/if}
      </span>
      <span class="sr-only">{mark ? m.music_strings_slots_sr_mark({ count, stroke, mark: mark.text }) : m.music_strings_slots_sr({ count, stroke })}</span>
    </li>
  {/each}
</ol>
{#if legend}
  <!-- What the marks mean, shown once before the run: the same glyphs the strokes get as they are judged. With
       `counts` it is the run's tally: every strum is in one of the five, so they add up to the strums expected. -->
  <!-- One row at every width: from sm the glyph beside its word, on a phone above it in five equal columns. -->
  <ul class="mt-2 grid grid-cols-5 gap-x-1 text-sm text-ws-stage-soft sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-1" aria-hidden={counts ? undefined : "true"} aria-label={counts ? m.music_strings_slots_tally_label() : undefined} data-testid={counts ? "strum-tally" : undefined}>
    {#each [["ontime", m.music_strings_on_time()], ["early", m.music_strings_early()], ["late", m.music_strings_late()], ["miss", m.music_strings_missed()], ["wrong", m.music_strings_wrong_chord()]] as const as [k, word] (k)}
      {@const Icon = MARK_ICON[k]}
      <li class="flex items-center gap-1.5 whitespace-nowrap max-sm:flex-col max-sm:gap-0.5 max-sm:whitespace-normal max-sm:text-center" data-kind={k}>
        <span class="grid size-5 shrink-0 place-items-center rounded-full {MARK_TONE[k]}"><Icon class="size-3.5" strokeWidth={3} aria-hidden="true" /></span>{word}{#if counts}<span class="tnum font-semibold text-ws-stage-ink">{counts[k]}</span>{/if}
      </li>
    {/each}
  </ul>
{/if}
