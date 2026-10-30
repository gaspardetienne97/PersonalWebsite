<script lang="ts">
  // This run's answers as a grid: a row per item played, a column per answer
  // given. The diagonal is right, everything off it is a mix-up, shaded by how
  // often. Tapping a square plays the two items back to back.
  import type { AnswerRecord } from "./session";

  let {
    records,
    order,
    name,
    onplay,
  }: {
    records: AnswerRecord[];
    /** Every item in teaching order (answers outside it count as "Something else"). */
    order: string[];
    name: (token: string) => string;
    onplay: (played: string, answered: string) => void;
  } = $props();

  const OTHER = "other";
  const rank = (t: string) => (t === OTHER ? 1e9 : order.indexOf(t) < 0 ? 1e6 : order.indexOf(t));
  const byRank = (a: string, b: string) => rank(a) - rank(b);
  const answerOf = (r: AnswerRecord) => (r.answered && (order.includes(r.answered) || r.answered === r.expected) ? r.answered : OTHER);
  const rows = $derived([...new Set(records.map((r) => r.expected))].sort(byRank));
  const cols = $derived([...new Set([...rows, ...records.map(answerOf)])].sort(byRank));
  const count = (a: string, b: string) => records.filter((r) => r.expected === a && answerOf(r) === b).length;
  const label = (t: string) => (t === OTHER ? "Something else" : name(t));
  const times = (n: number) => (n === 1 ? "once" : `${n} times`);
</script>

<div class="grid-wrap mt-3 overflow-x-auto">
  <table class="text-sm">
    <thead>
      <tr>
        <th scope="col" class="corner text-left align-bottom text-xs font-normal text-ws-soft">Played ↓<br />You said →</th>
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
                style:--heat="{n ? Math.round(18 + (n / total) * 52) : 0}%"
                aria-label="Played {label(r)}, you said {label(c)}{n ? `, ${times(n)}` : ', never'}. Play {r === c || c === OTHER ? 'it' : 'both'}."
                onclick={() => onplay(r, c)}>{n || ""}</button
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
    display: grid;
    place-items: center;
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
  .cell:hover {
    border-color: var(--instr);
  }
  .cell:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 2px;
  }
</style>
