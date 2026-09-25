<script lang="ts">
  // The rudiment as a row of strokes: hand letter, pad, accent mark. The
  // current stroke is ringed while it is due; after a run each stroke shows how
  // it landed (glyph plus ms), so colour is never the only cue.
  import type { PadHit } from "@repo/music-core/content/winds-pads";
  import { padLabel } from "./midi-status";

  interface Props {
    hits: PadHit[];
    /** Strokes per beat, for the beat grouping. */
    perBeat: number;
    current?: number | null;
    outcomes?: ({ errorMs: number; rightPad: boolean } | null)[];
    windowMs?: number;
  }
  let { hits, perBeat, current = null, outcomes, windowMs = 60 }: Props = $props();
  const main = $derived(hits.filter((h) => !h.grace));
  const flam = $derived(hits.some((h) => h.grace));

  function verdict(i: number) {
    if (!outcomes) return null;
    const o = outcomes[i];
    if (!o) return { glyph: "✕", text: "missed", kind: "miss" };
    if (!o.rightPad) return { glyph: "✕", text: "wrong pad", kind: "miss" };
    const ms = Math.round(o.errorMs);
    if (Math.abs(ms) <= windowMs) return { glyph: "✓", text: `${ms > 0 ? "+" : ""}${ms}`, kind: "ok" };
    return { glyph: ms > 0 ? "›" : "‹", text: `${ms > 0 ? "+" : ""}${ms}`, kind: "off" };
  }
</script>

<ol class="lane" aria-label="Sticking, {main.length} strokes">
  {#each main as h, i (i)}
    {@const v = verdict(i)}
    <li
      class="stroke"
      class:beat={i % perBeat === 0}
      class:now={current === i}
      data-hand={h.hand}
      data-kind={v?.kind}
    >
      <span class="count">{i % perBeat === 0 ? i / perBeat + 1 : ""}</span>
      <span class="hand">{h.hand === "left" ? "L" : "R"}{#if h.accent}<span aria-label=", accent">&gt;</span>{/if}</span>
      <span class="pad">{flam ? "flam " : ""}{padLabel(h.pad)}</span>
      {#if v}<span class="v tnum"><span aria-hidden="true">{v.glyph}</span> {v.kind === "miss" ? v.text : `${v.text} ms`}</span>{/if}
    </li>
  {/each}
</ol>

<style>
  .lane {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3.4rem, 1fr));
    gap: 6px;
  }
  .stroke {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 0.4rem 0.2rem 0.55rem;
    min-height: 5.2rem;
    border-radius: 0.5rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
    border-top: 3px solid transparent;
  }
  .stroke.beat {
    border-top-color: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
  }
  .stroke[data-hand="right"] .hand {
    color: var(--hand-right);
  }
  .stroke[data-hand="left"] .hand {
    color: var(--hand-left);
  }
  .now {
    background: color-mix(in oklch, var(--instr) 45%, transparent);
    outline: 2px solid var(--instr);
  }
  .hand {
    font-family: var(--font-display, inherit);
    font-weight: 700;
    font-size: 1.6rem;
    line-height: 1;
  }
  .count {
    height: 0.9rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--ws-stage-soft);
  }
  .pad {
    font-size: 0.66rem;
    color: var(--ws-stage-soft);
  }
  .v {
    font-size: 0.66rem;
    font-weight: 700;
  }
  [data-kind="ok"] .v {
    color: color-mix(in oklch, var(--success) 65%, white);
  }
  [data-kind="off"] .v {
    color: var(--warn);
  }
  [data-kind="miss"] .v {
    color: color-mix(in oklch, var(--destructive) 70%, white);
  }
</style>
