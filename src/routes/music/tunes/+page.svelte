<script lang="ts">
  // Tunes (jazz path ranks 1 and 11): each standard's ladder, rungs a to f read from checked
  // runs, and the repertoire, where a tune with rung a done comes back for review.
  import Check from "@lucide/svelte/icons/check";
  import { RUNGS, nextReview, tuneLadders, type Rung, type TuneLadderState } from "@repo/music-core/progress/ladder";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { btn, panel } from "#lib/music/components/ui.ts";
  import { m } from "@repo/i18n/messages.js";
  import { intlLocale } from "@repo/i18n/format";

  let all = $state(false);
  const runs = $derived(practice.sessions.flatMap((s) => s.runs));
  const ladders = $derived(tuneLadders(runs));
  const review = $derived(nextReview(ladders));
  const repertoire = $derived(ladders.filter((l) => l.review).sort((a, b) => a.review!.dueAt - b.review!.dueAt));
  /** Tunes with runs first, then the tune player's tunes; every shelf tune when asked. */
  const shown = $derived(
    ladders
      .filter((l) => !l.review && (all || l.played || l.tune.changes))
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.tune.name.localeCompare(b.tune.name)),
  );

  const dateText = (ms: number) => new Date(ms).toLocaleDateString(intlLocale(), { day: "numeric", month: "short" });

  /** Where each rung is practised; undefined when the tune has no changes in the tune player yet. */
  function rungHref(l: TuneLadderState, r: Rung): string | undefined {
    const id = l.tune.id;
    const jam = `/music/changes/jam?progression=tune-${id}&bpm=${l.tune.bpm}`;
    if (r === "a" || r === "f") return `/music/songs/shelf/jazz/${id}`;
    if (r === "c") return "/music/changes/accompany?mode=lead-sheet&lh=shells";
    if (!l.tune.changes) return undefined;
    if (r === "b") return `/music/changes/jam?progression=tune-${id}&bpm=${Math.round(l.tune.bpm * 0.8)}&game=guide-tones&choruses=2`;
    if (r === "d") return `/music/changes/accompany?mode=comping&progression=tune-${id}&voicing=rootless`;
    return `${jam}&game=changes`;
  }
</script>

<svelte:head><title>{m.music_runtime_tunes_head_title()}</title></svelte:head>

{#snippet ladder(l: TuneLadderState)}
  <ol class="flex flex-wrap gap-1.5" aria-label={m.music_runtime_tunes_ladder_label({ tune: l.tune.name })}>
    {#each RUNGS as r (r.id)}
      {@const st = l.rungs[r.id]}
      {@const href = rungHref(l, r.id)}
      <li>
        {#if href}
          <a {href} class="rung" data-done={st.done} title={m.music_runtime_tunes_rung_title({ step: r.label, done: r.done })} aria-label={st.done ? m.music_runtime_tunes_rung_done({ id: r.id, step: r.label }) : st.runs ? m.music_runtime_tunes_rung_runs({ id: r.id, step: r.label, count: st.runs }) : m.music_runtime_tunes_rung_not_started({ id: r.id, step: r.label })}>
            {#if st.done}<Check class="size-3.5" aria-hidden="true" />{/if}{r.id}
          </a>
        {:else}
          <span class="rung" data-done="false" data-off="true" title={m.music_runtime_tunes_rung_off_title({ step: r.label })} aria-label={m.music_runtime_tunes_rung_off_label({ id: r.id, step: r.label })} role="img">{r.id}</span>
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{m.music_runtime_tunes_title()}</h1>
    <p class="mt-1 max-w-prose text-ws-soft">
      {m.music_runtime_tunes_intro()} <a
        class="font-semibold text-instr-ink underline underline-offset-4"
        href="/music/progress">{m.music_runtime_tunes_back_to_progress()}</a
      >
    </p>
  </header>

  <section class={panel} aria-labelledby="rungs-h">
    <h2 id="rungs-h" class="font-display text-xl font-semibold">{m.music_runtime_tunes_steps_heading()}</h2>
    <dl class="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {#each RUNGS as r (r.id)}
        <div class="flex gap-2"><dt class="font-semibold">{m.music_runtime_tunes_step_term({ id: r.id, step: r.label })}</dt><dd class="text-ws-soft">{r.done}</dd></div>
      {/each}
    </dl>
  </section>

  <section class="flex flex-col gap-3" aria-labelledby="rep-h" data-testid="repertoire">
    <h2 id="rep-h" class="font-display text-2xl font-semibold">{m.music_runtime_tunes_repertoire()}</h2>
    {#if review}
      <article class="{panel} flex flex-wrap items-center gap-4">
        <div class="min-w-0 flex-1 basis-64">
          <p class="text-sm text-ws-soft">{review.review!.due ? m.music_runtime_tunes_due_for_review() : m.music_runtime_tunes_next_to_review()}</p>
          <p class="font-display text-2xl font-semibold">{review.tune.name}</p>
          <p class="text-sm text-ws-soft">{m.music_runtime_tunes_review_hint()}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a class={btn} href={rungHref(review, "a")}>{m.music_runtime_tunes_step_a_link()}</a>
          {#if rungHref(review, "d")}<a class={btn} href={rungHref(review, "d")}>{m.music_runtime_tunes_step_d_link()}</a>{/if}
        </div>
      </article>
      <ul class="flex flex-col gap-2">
        {#each repertoire as l (l.tune.id)}
          <li class="{panel} flex flex-wrap items-center gap-x-4 gap-y-2">
            <p class="min-w-0 flex-1 basis-48 font-semibold">{l.tune.name}</p>
            <p class="tnum text-sm" class:font-semibold={l.review!.due}>{l.review!.due ? m.music_runtime_tunes_due_now() : m.music_runtime_tunes_review_on({ date: dateText(l.review!.dueAt) })}</p>
            {@render ladder(l)}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-ws-soft">{m.music_runtime_tunes_empty_repertoire()}</p>
    {/if}
  </section>

  <section class="flex flex-col gap-3" aria-labelledby="learn-h" data-testid="ladders">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h2 id="learn-h" class="font-display text-2xl font-semibold">{m.music_runtime_tunes_learning()}</h2>
      <button type="button" class={btn} aria-pressed={all} onclick={() => (all = !all)}>{all ? m.music_runtime_tunes_show_yours() : m.music_runtime_tunes_show_all()}</button>
    </div>
    <ul class="flex flex-col gap-2">
      {#each shown as l (l.tune.id)}
        <li class="{panel} flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-semibold">{l.tune.name}</p>
            <p class="tnum text-sm text-ws-soft">{l.played ? m.music_runtime_tunes_played({ count: l.played, date: dateText(l.lastPlayed!) }) : m.music_runtime_tunes_not_played()}{l.tune.bpm ? m.music_runtime_tunes_tempo({ bpm: l.tune.bpm }) : ""}</p>
          </div>
          {@render ladder(l)}
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .rung {
    display: inline-flex;
    min-width: 2.75rem;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    border-radius: 0.75rem;
    border: 1px solid var(--ws-line);
    font-weight: 600;
  }
  a.rung:hover {
    background: var(--ws-raised);
  }
  .rung[data-done="true"] {
    background: var(--instr);
    border-color: var(--instr);
    color: var(--ws-stage);
  }
  .rung[data-off="true"] {
    opacity: 0.45;
  }
</style>
