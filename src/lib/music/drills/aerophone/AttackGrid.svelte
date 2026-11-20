<script lang="ts">
  // One cell per beat: the dashed mark is how long the note should sound
  // (35% staccato, 95% legato), the fill is how long it did.
  import { m } from "@repo/i18n/messages.js";

  interface Props {
    count: number;
    target: number;
    /** Sounding fraction per beat played so far (null = not ended / not measured). */
    played: (number | null)[];
    current?: number | null;
    style: "staccato" | "legato";
    /** After a run: each attack against its click in ms (negative early), null when none came. */
    offsets?: (number | null)[];
  }
  let { count, target, played, current = null, style, offsets }: Props = $props();
</script>

<figure class="rounded-xl bg-ws-stage-ink/6 p-3">
  <figcaption class="mb-2 text-sm text-ws-stage-soft">
    {(offsets ? m.music_winds_attack_caption_offsets : m.music_winds_attack_caption)({ style, pct: Math.round(target * 100) })}
  </figcaption>
  <ol class="grid gap-1.5" style:grid-template-columns="repeat({count}, minmax(0, 1fr))">
    {#each Array.from({ length: count }, (_, i) => i) as i (i)}
      {@const f = played[i]}
      <li class="cell" class:now={current === i}>
        <span class="fill" style:width="{(f ?? 0) * 100}%" data-set={f !== undefined && f !== null ? "" : undefined}></span>
        <span class="mark" style:left="{target * 100}%"></span>
        {#if offsets}
          {@const o = offsets[i]}
          <span class="off" aria-hidden="true">{o == null ? m.music_winds_attack_none() : `${o > 0 ? "+" : ""}${Math.round(o)}`}</span>
        {/if}
        <span class="sr-only">{m.music_winds_attack_beat({ n: i + 1 })}{f != null ? m.music_winds_attack_sounded({ pct: Math.round(f * 100) }) : ""}{offsets ? (offsets[i] == null ? m.music_winds_attack_no_attack() : m.music_winds_attack_from_click({ ms: Math.round(offsets[i]!) })) : ""}</span>
      </li>
    {/each}
  </ol>
</figure>

<style>
  .cell {
    position: relative;
    height: 2.5rem;
    border-radius: 0.4rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    overflow: hidden;
  }
  .cell.now {
    outline: 2px solid var(--instr);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--instr);
    opacity: 0.85;
  }
  .off {
    position: absolute;
    right: 0.25rem;
    bottom: 0.1rem;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--ws-stage-ink);
  }
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 2px dashed var(--ws-stage-ink);
  }
</style>
