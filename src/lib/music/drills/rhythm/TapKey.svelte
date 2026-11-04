<script lang="ts">
  // The key to the marks under the beat line and the staff: each glyph beside its words,
  // drawn as the marks are, so colour is never the only cue.
  interface Props {
    /** Add the missed line (after a run, when a note had no tap). */
    missed?: boolean;
  }
  let { missed = false }: Props = $props();
</script>

<div class="mt-3 text-sm text-ws-stage-soft" data-testid="tap-key" title="On time is within 15 ms of the click.">
  <p class="flex flex-wrap items-center gap-x-4 gap-y-1">
    <span class="item"><svg viewBox="-6 -6 12 12" aria-hidden="true"><path class="ok" d="M-4.5 0 L-1.5 3.5 L4.5 -4" /></svg>On time</span>
    <span class="item"><svg viewBox="-6 -6 12 12" aria-hidden="true"><path class="chev early" d="M1 -5 L-4 0 L1 5 M5 -5 L0 0 L5 5" /></svg>Early</span>
    <span class="item"><svg viewBox="-6 -6 12 12" aria-hidden="true"><path class="chev late" d="M-1 -5 L4 0 L-1 5 M-5 -5 L0 0 L-5 5" /></svg>Late</span>
    <span class="item"><svg viewBox="-6 -6 12 12" aria-hidden="true"><path d="M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5" class="cross" /></svg>Extra or in a rest</span>
    {#if missed}<span class="item"><svg viewBox="-6 -6 12 12" aria-hidden="true"><circle r="4.5" class="hollow" /></svg>Missed</span>{/if}
  </p>
</div>

<style>
  .item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  svg {
    width: 16px;
    height: 16px;
    overflow: visible;
    flex-shrink: 0;
  }
  .ok {
    fill: none;
    stroke: var(--success);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .chev {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .chev.early {
    stroke: var(--early, var(--warn));
  }
  .chev.late {
    stroke: var(--late, var(--warn));
  }
  .cross {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2.5;
  }
  .hollow {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2;
  }
</style>
