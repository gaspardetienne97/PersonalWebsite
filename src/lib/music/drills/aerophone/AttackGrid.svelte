<script lang="ts">
  // One cell per beat: the dashed mark is how long the note should sound
  // (35% staccato, 95% legato), the fill is how long it did.
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
    Attacks: {style}, each note sounds {Math.round(target * 100)}% of its beat{offsets ? ". Numbers: ms from the click, minus is early" : ""}
  </figcaption>
  <ol class="grid gap-1.5" style:grid-template-columns="repeat({count}, minmax(0, 1fr))">
    {#each Array.from({ length: count }, (_, i) => i) as i (i)}
      {@const f = played[i]}
      <li class="cell" class:now={current === i}>
        <span class="fill" style:width="{(f ?? 0) * 100}%" data-set={f !== undefined && f !== null ? "" : undefined}></span>
        <span class="mark" style:left="{target * 100}%"></span>
        {#if offsets}
          {@const o = offsets[i]}
          <span class="off" aria-hidden="true">{o == null ? "none" : `${o > 0 ? "+" : ""}${Math.round(o)}`}</span>
        {/if}
        <span class="sr-only">Beat {i + 1}{f != null ? `, sounded ${Math.round(f * 100)}%` : ""}{offsets ? (offsets[i] == null ? ", no attack" : `, ${Math.round(offsets[i]!)} ms from the click`) : ""}</span>
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
