<script lang="ts">
  // The rudiment as a row of strokes: hand letter, pad, accent mark. The
  // current stroke is ringed while it is due; after a run each stroke shows how
  // it landed (glyph plus ms), so colour is never the only cue.
  import type { PadHit } from "@repo/music-core/content/winds-pads";
  import { padLabel } from "./midi-status";
  import { m } from "@repo/i18n/messages.js";

  interface Props {
    hits: PadHit[];
    /** One beat in ms: a stroke on a beat starts a group (a pyramid's beats hold 1, 2, 3, 4 strokes). */
    beatMs: number;
    current?: number | null;
    outcomes?: ({ errorMs: number; rightPad: boolean } | null)[];
    windowMs?: number;
  }
  let { hits, beatMs, current = null, outcomes, windowMs = 60 }: Props = $props();
  const main = $derived(hits.filter((h) => !h.grace));
  const flam = $derived(hits.some((h) => h.grace));
  /** The beat a stroke starts, 1-based, or null off the beat. */
  const beatOf = (h: PadHit) => {
    const b = h.atMs / beatMs;
    return Math.abs(b - Math.round(b)) < 1e-6 ? Math.round(b) + 1 : null;
  };

  function verdict(i: number) {
    if (!outcomes) return null;
    const o = outcomes[i];
    if (!o) return { glyph: "✕", text: m.music_winds_missed(), kind: "miss" };
    if (!o.rightPad) return { glyph: "✕", text: m.music_winds_stick_wrong_pad(), kind: "miss" };
    const ms = Math.round(o.errorMs);
    if (Math.abs(ms) <= windowMs) return { glyph: "✓", text: `${ms > 0 ? "+" : ""}${ms}`, kind: "ok" };
    return { glyph: ms > 0 ? "›" : "‹", text: `${ms > 0 ? "+" : ""}${ms}`, kind: "off" };
  }
</script>

<ol class="lane" aria-label={m.music_winds_stick_aria({ count: main.length })}>
  {#each main as h, i (i)}
    {@const v = verdict(i)}
    {@const beat = beatOf(h)}
    <li
      class="stroke"
      class:beat={beat !== null}
      class:now={current === i}
      data-hand={h.hand}
      data-kind={v?.kind}
    >
      <span class="count">{beat ?? ""}</span>
      <span class="hand">{h.hand === "left" ? m.music_winds_stick_left() : m.music_winds_stick_right()}{#if h.accent}<span aria-label={m.music_winds_stick_accent()}>&gt;</span>{/if}</span>
      <span class="pad">{flam ? m.music_winds_stick_flam_pad({ pad: padLabel(h.pad) }) : padLabel(h.pad)}</span>
      {#if v}<span class="v tnum"><span aria-hidden="true">{v.glyph}</span> {v.kind === "miss" ? v.text : m.music_winds_stick_ms({ value: v.text })}</span>{/if}
    </li>
  {/each}
</ol>

<style>
  .lane {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3.9rem, 1fr));
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
  /* Every small label at 13 px, so a stroke's pad and offset read without leaning in. */
  .count {
    height: 1rem;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--ws-stage-soft);
  }
  .pad {
    font-size: 0.8125rem;
    color: var(--ws-stage-soft);
  }
  .v {
    font-size: 0.8125rem;
    white-space: nowrap;
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
