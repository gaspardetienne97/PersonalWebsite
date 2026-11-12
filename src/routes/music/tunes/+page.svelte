<script lang="ts">
  // Tunes (jazz path ranks 1 and 11): each standard's ladder, rungs a to f read from checked
  // runs, and the repertoire, where a tune with rung a done comes back for review.
  import Check from "lucide-svelte/icons/check";
  import { RUNGS, nextReview, tuneLadders, type Rung, type TuneLadderState } from "@repo/music-core/progress/ladder";
  import { practice } from "$lib/music/practice.svelte";
  import { btn, panel } from "$lib/music/components/ui";

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

  const dateText = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

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

<svelte:head><title>Tunes | Woodshed</title></svelte:head>

{#snippet ladder(l: TuneLadderState)}
  <ol class="flex flex-wrap gap-1.5" aria-label="{l.tune.name}: the ladder">
    {#each RUNGS as r (r.id)}
      {@const st = l.rungs[r.id]}
      {@const href = rungHref(l, r.id)}
      <li>
        {#if href}
          <a {href} class="rung" data-done={st.done} title="{r.label}: {r.done}" aria-label="{r.id}, {r.label}, {st.done ? 'done' : st.runs ? `${st.runs} run${st.runs === 1 ? '' : 's'}, not yet done` : 'not started'}">
            {#if st.done}<Check class="size-3.5" aria-hidden="true" />{/if}{r.id}
          </a>
        {:else}
          <span class="rung" data-done="false" data-off="true" title="{r.label}: the tune player has no changes for this tune yet." aria-label="{r.id}, {r.label}, waits for the tune's changes" role="img">{r.id}</span>
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Tunes</h1>
    <p class="mt-1 max-w-prose text-ws-soft">
      Every standard is learned in six rungs, read from your checked runs. A tune with rung a done joins your repertoire and comes back for review as a skill does. <a
        class="font-semibold text-instr-ink underline underline-offset-4"
        href="/music/progress">Back to Progress</a
      >
    </p>
  </header>

  <section class={panel} aria-labelledby="rungs-h">
    <h2 id="rungs-h" class="font-display text-xl font-semibold">The ladder</h2>
    <dl class="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {#each RUNGS as r (r.id)}
        <div class="flex gap-2"><dt class="font-semibold">{r.id}. {r.label}:</dt><dd class="text-ws-soft">{r.done}</dd></div>
      {/each}
    </dl>
  </section>

  <section class="flex flex-col gap-3" aria-labelledby="rep-h" data-testid="repertoire">
    <h2 id="rep-h" class="font-display text-2xl font-semibold">Repertoire</h2>
    {#if review}
      <article class="{panel} flex flex-wrap items-center gap-4">
        <div class="min-w-0 flex-1 basis-64">
          <p class="text-sm text-ws-soft">{review.review!.due ? "Due for review" : "Next to review"}</p>
          <p class="font-display text-2xl font-semibold">{review.tune.name}</p>
          <p class="text-sm text-ws-soft">Play rungs a and d: the head from your score, then comp it.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a class={btn} href={rungHref(review, "a")}>Rung a in the Song editor</a>
          {#if rungHref(review, "d")}<a class={btn} href={rungHref(review, "d")}>Rung d in Accompaniment</a>{/if}
        </div>
      </article>
      <ul class="flex flex-col gap-2">
        {#each repertoire as l (l.tune.id)}
          <li class="{panel} flex flex-wrap items-center gap-x-4 gap-y-2">
            <p class="min-w-0 flex-1 basis-48 font-semibold">{l.tune.name}</p>
            <p class="tnum text-sm" class:font-semibold={l.review!.due}>{l.review!.due ? "Due now" : `Review on ${dateText(l.review!.dueAt)}`}</p>
            {@render ladder(l)}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-ws-soft">No tune is in the repertoire yet. Rung a on two days puts it there.</p>
    {/if}
  </section>

  <section class="flex flex-col gap-3" aria-labelledby="learn-h" data-testid="ladders">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h2 id="learn-h" class="font-display text-2xl font-semibold">Learning</h2>
      <button type="button" class={btn} aria-pressed={all} onclick={() => (all = !all)}>{all ? "Your tunes and the tune player's" : "Every jazz shelf tune"}</button>
    </div>
    <ul class="flex flex-col gap-2">
      {#each shown as l (l.tune.id)}
        <li class="{panel} flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-semibold">{l.tune.name}</p>
            <p class="tnum text-sm text-ws-soft">{l.played ? `${l.played} checked run${l.played === 1 ? "" : "s"}, last on ${dateText(l.lastPlayed!)}` : "Not played yet"}{l.tune.bpm ? `. Shelf tempo ${l.tune.bpm}` : ""}</p>
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
