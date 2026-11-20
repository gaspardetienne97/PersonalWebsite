<script lang="ts">
  // This run's answers as a grid: a row per item played, a column per answer
  // given. The diagonal is right (a tick), everything off it is a mix-up (a cross),
  // shaded by how often. Tapping a square plays the two items back to back. On a
  // phone the mix-ups are a list of pairs, each with its own play button.
  import { confusionCells, OTHER_ANSWER as OTHER, times, type AnswerRecord } from "./session";
  import Play from "@lucide/svelte/icons/play";

  let {
    records,
    order,
    name,
    onplay,
    named = null,
  }: {
    records: AnswerRecord[];
    /** Every item in teaching order (answers outside it count as "Something else"). */
    order: string[];
    name: (token: string) => string;
    onplay: (played: string, answered: string) => void;
    /** The mix-up the headline names (played, answered): its square is outlined. */
    named?: { expected: string; answered: string } | null;
  } = $props();

  const cells = $derived(confusionCells(records, order));
  const rows = $derived(cells.rows);
  const cols = $derived(cells.cols);
  const count = (a: string, b: string) => cells.count(a, b);
  const label = (t: string) => (t === OTHER ? "Something else" : name(t));
  /** The mix-ups, most often first: what a phone lists. */
  const pairs = $derived(
    rows
      .flatMap((r) => cols.filter((c) => c !== r && count(r, c) > 0).map((c) => ({ r, c, n: count(r, c) })))
      .sort((a, b) => b.n - a.n),
  );
</script>

<ul class="mt-3 grid gap-2 sm:hidden">
  {#each pairs as p (p.r + p.c)}
    <li class="flex items-center justify-between gap-3 rounded-xl border border-ws-line px-3 py-1.5">
      <span><span class="font-semibold">{label(p.r)}</span> heard as <span class="font-semibold">{label(p.c)}</span>, {times(p.n)}</span>
      <button type="button" class="pair-play" aria-label="Play {label(p.r)}{p.c === OTHER ? '' : `, then ${label(p.c)}`}" onclick={() => onplay(p.r, p.c)}><Play class="size-4" aria-hidden="true" /></button>
    </li>
  {/each}
</ul>

<div class="grid-wrap mt-3 overflow-x-auto max-sm:hidden">
  <p class="mb-1 text-sm text-ws-soft">Rows: the one played. Columns: what you answered.</p>
  <table class="text-sm">
    <thead>
      <tr>
        <th scope="col" class="corner text-left align-bottom text-sm font-normal text-ws-soft">Played, then<br />you answered</th>
        {#each cols as c (c)}
          <th scope="col" class="col-h align-bottom font-medium"><span>{label(c)}</span></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r)}
        {@const total = records.filter((x) => x.expected === r).length}
        <tr>
          <th scope="row" class="row-h text-left font-medium">{label(r)}</th>
          {#each cols as c (c)}
            {@const n = count(r, c)}
            <td>
              <button
                type="button"
                class="cell tnum font-semibold"
                data-kind={!n ? "empty" : r === c ? "right" : "wrong"}
                data-named={named && named.expected === r && named.answered === c ? "" : undefined}
                style:--heat="{n ? Math.round(18 + (n / total) * 52) : 0}%"
                aria-label="Played {label(r)}, you said {label(c)}{n ? `, ${times(n)}` : ', never'}{named && named.expected === r && named.answered === c ? ', the mix-up named above' : ''}. Play {r === c || c === OTHER ? 'it' : 'both'}."
                onclick={() => onplay(r, c)}
                >{#if n}<span aria-hidden="true" class="glyph">{r === c ? "✓" : "✕"}</span>{n}{/if}</button
              >
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  table {
    border-collapse: separate;
    border-spacing: 2px;
  }
  .corner,
  .row-h {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--ws-surface);
    max-width: 7.5rem;
    padding-right: 0.5rem;
    line-height: 1.2;
  }
  /* Full names, read bottom to top, so a column stays one square wide. */
  .col-h span {
    display: inline-block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    max-height: 8rem;
    padding-bottom: 0.25rem;
    line-height: 1.1;
  }
  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--ws-line);
    background: transparent;
  }
  .cell[data-kind="right"] {
    background: color-mix(in oklch, var(--success) var(--heat), transparent);
  }
  .cell[data-kind="wrong"] {
    background: color-mix(in oklch, var(--destructive) var(--heat), transparent);
  }
  /* The square the headline names. */
  .cell[data-named] {
    outline: 3px solid var(--ws-ink);
    outline-offset: 1px;
  }
  .glyph {
    font-size: 0.8125rem;
  }
  .pair-play {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    background: var(--ws-raised);
  }
  .pair-play:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 2px;
  }
  .cell:hover {
    border-color: var(--instr);
  }
  .cell:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 2px;
  }
</style>
