<script lang="ts">
  // What one test clip looks like on the instrument: chord boxes, a strum row,
  // notes on the neck, a bar of tab, piano keys, an Aerophone fingering or the
  // syllables to sing. The step sounding in the example is lit; with no example
  // playing, the step the player picked is.
  import { noteName } from "@repo/music-core";
  import { chord, note } from "../names.svelte";
  import { writtenOffset } from "@repo/music-core/theory/transposition";
  import ChordDiagram from "../components/ChordDiagram.svelte";
  import Fretboard, { type FretMark } from "../components/Fretboard.svelte";
  import Piano from "../components/Piano.svelte";
  import AerophoneKeys from "../components/AerophoneKeys.svelte";
  import type { CellMarks } from "../components/feedback.svelte";
  import StrumSlots from "../drills/guitar/StrumSlots.svelte";
  import { m } from "@repo/i18n/messages.js";
  import { settings } from "../runtime";
  import { OPEN_STRINGS, type Clip } from "./clips";

  interface Props {
    clip: Clip;
    /** The step the example is sounding, or null when it is quiet. */
    step?: number | null;
    /** The strum slot the example is on. */
    slot?: number | null;
    /** A step picked by hand: the page sounds it. */
    onpick?: (step: number) => void;
  }
  let { clip, step = null, slot = null, onpick }: Props = $props();

  const v = $derived(clip.visual);
  const instrument = $derived(v.instrument ?? "guitar");
  let picked = $state(0);
  const playing = $derived(step !== null);
  const shown = $derived(Math.min(step ?? picked, Math.max(0, clip.steps.length - 1)));
  const pick = (i: number) => {
    picked = i;
    onpick?.(i);
  };
  /** Each shape once: a progression that comes back to a chord shows its box once, lit both times. */
  const shapes = $derived([...new Set(v.shapes ?? [])]);
  const shapeLabel = (name: string) =>
    instrument === "ukulele" ? m.music_runtime_clipvisual_ukulele_shape({ chord: chord(name) }) : m.music_runtime_clipvisual_guitar_shape({ chord: chord(name) });

  // The neck: every position of the clip, the one sounding (or picked) marked as the note to play now.
  const fretMarks = $derived.by((): FretMark[] => {
    if (!v.fret) return [];
    const seen = new Map<number, FretMark>();
    v.fret.notes.forEach((n, i) => {
      const key = n.string * 100 + n.fret;
      const now = i === shown && (playing || clip.steps.length > 1);
      const old = seen.get(key);
      if (!old) seen.set(key, { string: n.string, fret: n.fret, label: note(n.label), role: "scale", state: now ? "now" : undefined, demo: now && playing });
      else if (now) Object.assign(old, { state: "now", demo: playing });
    });
    return [...seen.values()];
  });

  // The keys: a line of single notes shows them all, a set of chords shows the one picked.
  const keyMarks = $derived.by((): Record<number, CellMarks> => {
    const k = v.keys;
    if (!k) return {};
    const single = k.steps.every((s) => s.length === 1);
    const out: Record<number, CellMarks> = {};
    const role = (m: number) => (k.left ? (k.left.includes(m) ? "left" : "right") : undefined);
    if (single) for (const [m] of k.steps) out[m] = { target: true, label: note(noteName(m, "flat", false)), role: role(m) };
    for (const m of k.steps[shown] ?? [])
      if (!single || playing) out[m] = { target: true, demo: playing, label: note(noteName(m, "flat", false)), role: role(m) };
    return out;
  });

  // The Aerophone chart is looked up at the written pitch: hand it the concert note that reads as this one.
  const aeroShift = $derived(writtenOffset("aerophone", settings.value));
  const written = $derived(v.written?.[Math.min(shown, v.written.length - 1)] ?? null);

  // One bar of tab, six lines, eight slots.
  const TAB = { w: 520, h: 172, left: 44, top: 34, row: 20, col: 56 };
  const COUNTS = ["1", "&", "2", "&", "3", "&", "4", "&"];
</script>

<div class="flex flex-col gap-4" data-testid="clip-visual">
  {#if clip.steps.length > 1 && clip.steps.length <= 16}
    <ol class="flex flex-wrap gap-1.5" aria-label={m.music_runtime_clipvisual_steps_label()}>
      {#each clip.steps as name, i (i)}
        <li>
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-lg border px-3 font-medium {v.syllables ? 'text-xl' : 'text-base'} {i === shown
              ? 'border-transparent bg-instr-strong text-on-instr'
              : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
            aria-current={i === shown ? "step" : undefined}
            aria-label={m.music_runtime_clipvisual_step_label({ number: i + 1, name })}
            onclick={() => pick(i)}>{name}</button
          >
        </li>
      {/each}
    </ol>
  {/if}

  {#if v.shapes}
    <ul class="flex flex-wrap gap-2" aria-label={m.music_runtime_clipvisual_shapes_label()}>
      {#each shapes as s (s)}
        {@const current = shapes.length > 1 && v.shapes[shown] === s}
        <li class="{shapes.length > 1 ? 'w-[7.75rem]' : 'w-40'} rounded-xl border bg-ws-surface p-2 {current ? 'border-instr-ink ring-2 ring-instr-ink' : 'border-ws-line'}" data-current={current || undefined}>
          <p class="text-center font-display text-xl font-semibold">{chord(s.name)}</p>
          <ChordDiagram frets={s.frets} fingers={s.fingers} label={shapeLabel(s.name)} />
        </li>
      {/each}
    </ul>
  {/if}

  {#if v.strum}
    <div class="rounded-xl bg-ws-stage p-3 text-ws-stage-ink">
      <StrumSlots slots={v.strum} lit={slot} label={m.music_runtime_clipvisual_strum_label()} />
    </div>
  {/if}

  {#if v.fret}
    <!-- The neck's string names and fret numbers are drawn for the dark stage. -->
    <div class="rounded-xl bg-ws-stage p-3 text-ws-stage-ink">
    <Fretboard
      openStrings={OPEN_STRINGS[instrument]}
      from={v.fret.from}
      to={v.fret.to}
      marks={fretMarks}
      interactive={false}
      showHeldPitches={false}
      compact
      label={instrument === "ukulele" ? m.music_runtime_clipvisual_ukulele_fretboard() : m.music_runtime_clipvisual_guitar_fretboard()}
    />
    </div>
  {/if}

  {#if v.tab}
    <svg viewBox="0 0 {TAB.w} {TAB.h}" class="h-auto w-full max-w-xl" role="img" aria-label={m.music_runtime_clipvisual_tab_label()}>
      {#each COUNTS as c, i (i)}
        <text x={TAB.left + 30 + i * TAB.col} y={TAB.top - 14} text-anchor="middle" class="tab-finger">{v.tab.notes.find((n) => n.slot === i)?.finger ?? ""}</text>
        <text x={TAB.left + 30 + i * TAB.col} y={TAB.top + 5 * TAB.row + 30} text-anchor="middle" class="tab-count" class:beat={i % 2 === 0}>{c}</text>
      {/each}
      {#each [1, 2, 3, 4, 5, 6] as s (s)}
        <text x={TAB.left - 22} y={TAB.top + (s - 1) * TAB.row + 5} text-anchor="middle" class="tab-count">{note(noteName(OPEN_STRINGS.guitar[s - 1], "flat", false))}</text>
        <line x1={TAB.left} x2={TAB.w - 8} y1={TAB.top + (s - 1) * TAB.row} y2={TAB.top + (s - 1) * TAB.row} class="tab-line" />
      {/each}
      <line x1={TAB.left} x2={TAB.left} y1={TAB.top} y2={TAB.top + 5 * TAB.row} class="tab-bar" />
      <line x1={TAB.w - 8} x2={TAB.w - 8} y1={TAB.top} y2={TAB.top + 5 * TAB.row} class="tab-bar" />
      {#each v.tab.notes as n (n.slot)}
        {@const x = TAB.left + 30 + n.slot * TAB.col}
        {@const y = TAB.top + (n.string - 1) * TAB.row}
        <rect x={x - 11} y={y - 10} width="22" height="20" rx="5" class="tab-pad" class:now={playing && n.slot === step} />
        <text {x} y={y + 5} text-anchor="middle" class="tab-fret" class:now={playing && n.slot === step}>{n.fret}</text>
      {/each}
    </svg>
    <p class="text-sm text-ws-soft">{m.music_runtime_clipvisual_tab_note({ e: note("E") })}</p>
  {/if}

  {#if v.keys}
    <Piano low={v.keys.low} high={v.keys.high} fit={{ low: v.keys.low, high: v.keys.high }} minKey={18} marks={keyMarks} held={new Set()} interactive={false} names="c" label={m.music_runtime_clipvisual_piano_label()} />
    {#if v.keys.left}<p class="text-sm text-ws-soft">{m.music_runtime_clipvisual_left_hand()}</p>{/if}
  {/if}

  {#if written !== null}
    <div class="flex flex-wrap items-start gap-4">
      <AerophoneKeys midi={written - aeroShift} compact name={() => noteName(written, "flat")} />
      <p class="max-w-xs text-sm text-ws-soft">
        {m.music_runtime_clipvisual_fingering({ note: note(noteName(written, "flat")) })}
        {#if clip.steps.length > 1}{m.music_runtime_clipvisual_pick_note()}{/if}
      </p>
    </div>
  {/if}

  {#if v.syllables && clip.steps.length <= 1}
    <p class="font-display text-4xl font-semibold">{v.syllables[0]}</p>
  {/if}
</div>

<style>
  .tab-line {
    stroke: color-mix(in oklch, var(--ws-ink) 45%, transparent);
    stroke-width: 1.2;
  }
  .tab-bar {
    stroke: var(--ws-ink);
    stroke-width: 2;
  }
  .tab-pad {
    fill: var(--ws-surface);
  }
  .tab-pad.now {
    fill: var(--instr-strong);
  }
  .tab-fret {
    fill: var(--ws-ink);
    font-size: 16px;
    font-weight: 700;
  }
  .tab-fret.now {
    fill: var(--on-instr);
  }
  .tab-count,
  .tab-finger {
    fill: var(--ws-soft);
    font-size: 14px;
  }
  .tab-count.beat,
  .tab-finger {
    fill: var(--ws-ink);
    font-weight: 600;
  }
</style>
