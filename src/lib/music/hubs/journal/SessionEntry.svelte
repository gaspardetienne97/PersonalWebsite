<script lang="ts">
  // One journal entry as a card named for its drills, with the drill's icon and a score
  // sparkline; on demand its runs and attempt evidence. Delete lives in the edit view,
  // behind a confirm, so it is never one tap from the main actions.
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import Trash from "lucide-svelte/icons/trash-2";
  import { tick } from "svelte";
  import type { PracticeSession, ScoringEvent } from "@repo/music-core";
  import { sessionMinutes } from "@repo/music-core/progress/journal";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { practice } from "../../practice.svelte";
  import { btn, btnPrimary } from "../../components/ui";
  import { hueForRoute, hueVar } from "../../hues";
  import { HUE_ICON } from "../hue-icons";
  import {
    ASSISTANCE_LABEL,
    INPUT_LABEL,
    SOURCE_LABEL,
    exerciseDrill,
    exerciseTitle,
    formatDuration,
    formatLabel,
    parseTags,
    pct,
    plural,
    scoreHistory,
    sessionTitle,
  } from "../progress/model";

  let { session, announce }: { session: PracticeSession; announce: (msg: string) => void } = $props();

  let open = $state(false);
  let editing = $state(false);
  let confirming = $state(false);
  let note = $state("");
  let nextTime = $state("");
  let tags = $state("");
  let keepBtn = $state<HTMLButtonElement>();
  let deleteBtn = $state<HTMLButtonElement>();

  const id = $derived(session.id);
  const events = $derived(open ? practice.events.filter((e) => e.sessionId === session.id) : []);
  const byRun = $derived(
    session.runs.map((r) => ({ run: r, events: events.filter((e) => e.runId === r.id) })),
  );
  const orphans = $derived(events.filter((e) => !session.runs.some((r) => r.id === e.runId)));
  const duration = $derived(formatDuration(sessionMinutes(session) * 60_000));
  const instrument = $derived(session.instrument ? INSTRUMENT_LABEL[session.instrument] : "several instruments");
  const title = $derived(sessionTitle(session));
  // The first run sets the card's hue and icon, and its drill's recent scores the sparkline.
  const lead = $derived(session.runs.find((r) => r.score !== undefined) ?? session.runs[0]);
  const hue = $derived(
    hueForRoute((lead && exerciseDrill(lead.exerciseId)?.entry.route) ?? "/music", lead?.instrument ?? session.instrument),
  );
  const Icon = $derived(HUE_ICON[hue]);
  const scores = $derived(lead?.score !== undefined ? scoreHistory(practice.sessions, lead.exerciseId, lead.endedAt) : []);
  const when = $derived(
    new Date(session.startTime).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  );

  function startEdit() {
    note = session.note ?? "";
    nextTime = session.nextTime ?? "";
    tags = session.tags.join(", ");
    editing = true;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await practice.editSession(id, { note: note.trim() || undefined, nextTime: nextTime.trim() || undefined, tags: parseTags(tags) });
    editing = false;
    announce("Session updated.");
  }

  async function askDelete() {
    confirming = true;
    await tick();
    keepBtn?.focus();
  }

  async function keep() {
    confirming = false;
    await tick();
    deleteBtn?.focus();
  }

  async function remove() {
    await practice.deleteSession(id);
    announce("Session deleted.");
  }
</script>

{#snippet evidence(list: ScoringEvent[])}
  {#if list.length}
    {@const misses = list.filter((e) => !e.correct)}
    <!-- Every attempt as a dot (glyph and colour), then the misses spelled out; the rest on demand. -->
    <ol class="mt-2 flex flex-wrap gap-1" aria-label="Attempts in order: {list.length - misses.length} right, {misses.length} missed">
      {#each list as e, i (e.id)}
        <li
          class="grid size-6 place-items-center rounded-full text-xs font-bold {e.correct ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}"
          title="{i + 1}. {formatLabel(e.target) || e.promptId}: {e.correct ? 'right' : 'missed'}"
        >
          <span aria-hidden="true">{e.correct ? "✓" : "✗"}</span><span class="sr-only">{i + 1}: {e.correct ? "right" : "missed"}</span>
        </li>
      {/each}
    </ol>
    {#if misses.length}
      <ul class="mt-2 flex flex-col gap-1 text-sm" aria-label="Missed">
        {#each misses as e (e.id)}
          <li class="flex flex-wrap gap-x-2">
            <span class="text-destructive" aria-hidden="true">✗</span>
            <span>Wanted <span class="font-semibold">{formatLabel(e.target) || e.promptId}</span>{#if e.response !== undefined}, answered <span class="font-semibold">{formatLabel(e.response)}</span>{/if}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-1 text-sm text-success">All {list.length} right.</p>
    {/if}
    <details class="group mt-2 text-sm">
      <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-ws-soft hover:text-ws-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown class="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" />Details of each attempt
      </summary>
      <ol class="flex flex-col divide-y divide-ws-line rounded-xl border border-ws-line">
        {#each list as e, i (e.id)}
          <li class="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
            <span class="font-medium sm:w-48 sm:shrink-0">
              <span class="tnum text-ws-soft">{i + 1}.</span>
              {formatLabel(e.target) || e.promptId}:
              {#if e.correct}<span class="text-success">Right</span>{:else}<span class="text-destructive">Missed</span>{#if e.response !== undefined}, answered {formatLabel(e.response)}{/if}{/if}
            </span>
            <span class="text-ws-soft">
              Credit {pct(e.partialCredit)}, {e.assistance ? ASSISTANCE_LABEL[e.assistance] : "Not recorded"}, {INPUT_LABEL[e.source]}{e.instrument
                ? `, ${INSTRUMENT_LABEL[e.instrument]}`
                : ""}
            </span>
          </li>
        {/each}
      </ol>
    </details>
  {:else}
    <p class="mt-1 text-sm text-ws-soft">No graded attempts.</p>
  {/if}
{/snippet}

<article class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="{id}-title" data-session={id} style:--card-hue={hueVar(hue)}>
  <div class="flex items-start gap-3">
    <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--card-hue)] text-ws-stage" aria-hidden="true">
      <Icon class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <h3 id="{id}-title" class="font-semibold">{title}</h3>
      <p class="text-sm text-ws-soft">{when}. {SOURCE_LABEL[session.source]} on {instrument}</p>
    </div>
    {#if lead?.score !== undefined}
      <div class="flex shrink-0 items-end gap-2">
        {#if scores.length > 1}
          <div
            class="flex h-9 items-end gap-0.5"
            role="img"
            aria-label="{exerciseTitle(lead.exerciseId)} scores up to this session: {scores.map((v) => pct(v)).join(', ')}"
          >
            {#each scores as v, i (i)}
              <span
                class="w-1.5 rounded-sm bg-[color:var(--card-hue)] {i === scores.length - 1 ? '' : 'opacity-45'}"
                style:height="{Math.max(10, v * 100)}%"
              ></span>
            {/each}
          </div>
        {/if}
        <p class="tnum font-display text-2xl font-semibold leading-none"><span class="sr-only">Score </span>{pct(lead.score)}</p>
      </div>
    {/if}
  </div>
  <!-- What it measured first, effort after: right answers and time, XP last. -->
  <dl class="tnum mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
    {#if session.eventIds.length}
      <div class="flex gap-1.5"><dt class="text-ws-soft">Answers</dt><dd class="font-semibold">{session.eventIds.length}</dd></div>
    {/if}
    <div class="flex gap-1.5"><dt class="text-ws-soft">Time</dt><dd class="font-semibold">{duration}</dd></div>
    <div class="flex gap-1.5"><dt class="text-ws-soft">XP</dt><dd class="font-semibold">+{session.xp}</dd></div>
  </dl>

  {#if !editing}
    {#if session.note}<p class="mt-2 max-w-prose whitespace-pre-line">{session.note}</p>{/if}
    {#if session.nextTime}<p class="mt-1 text-sm"><span class="font-medium">Next time:</span> {session.nextTime}</p>{/if}
    {#if session.tags.length}
      <ul class="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
        {#each session.tags as t (t)}<li class="rounded-full bg-instr-wash px-2.5 py-0.5 text-sm">{t}</li>{/each}
      </ul>
    {/if}
  {:else}
    <form class="mt-3 flex max-w-xl flex-col gap-3" onsubmit={save}>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Note</span>
        <textarea class="min-h-20 rounded-lg border border-ws-line bg-ws-surface p-2" bind:value={note}></textarea>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Next time</span>
        <input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={nextTime} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Tags, separated by commas</span>
        <input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={tags} />
      </label>
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" class={btnPrimary}>Save</button>
        <button type="button" class={btn} onclick={() => (editing = confirming = false)}>Cancel</button>
      </div>
      <!-- Deleting is its own row, away from Save, and asks first. -->
      <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-ws-line pt-3">
        {#if confirming}
          <span class="flex flex-wrap items-center gap-2 rounded-2xl bg-destructive/10 py-1 pl-4 pr-1 text-sm" role="group" aria-label="Confirm delete">
            Delete this session and its {plural(session.eventIds.length, "answer")} for good?
            <button type="button" class="inline-flex min-h-11 items-center justify-center rounded-full bg-destructive px-4 text-sm font-semibold text-white hover:brightness-110" onclick={remove}>Delete session</button>
            <button type="button" class={btn} bind:this={keepBtn} onclick={keep}>Keep it</button>
          </span>
        {:else}
          <button type="button" class="{btn} text-destructive" bind:this={deleteBtn} onclick={askDelete}><Trash class="size-4" aria-hidden="true" />Delete session</button>
        {/if}
      </div>
    </form>
  {/if}

  <div class="mt-3 flex flex-wrap items-center gap-2">
    <button type="button" class={btn} aria-expanded={open} aria-controls="{id}-detail" onclick={() => (open = !open)}>
      <ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true" />
      {open ? "Hide answers" : "Show every answer"}
    </button>
    {#if !editing}
      <button type="button" class={btn} onclick={startEdit}>Edit note<span class="max-sm:sr-only"> and tags</span></button>
    {/if}
  </div>

  {#if open}
    <div id="{id}-detail" class="mt-3 flex flex-col gap-4 border-l-2 border-instr pl-4">
      {#each byRun as { run, events: list } (run.id)}
        <div class="min-w-0">
          <p class="font-medium">
            {exerciseTitle(run.exerciseId)}{#if run.score !== undefined}, <span class="tnum">{pct(run.score)}</span>{/if}
          </p>
          <p class="text-sm text-ws-soft">
            {ASSISTANCE_LABEL[run.assistance]}{run.instrument ? `, ${INSTRUMENT_LABEL[run.instrument]}` : ""}{run.headline
              ? `. ${run.headline}`
              : ""}
          </p>
          {@render evidence(list)}
        </div>
      {/each}
      {#if orphans.length}
        <div class="min-w-0">
          <p class="font-medium">Attempts from a run that did not finish</p>
          {@render evidence(orphans)}
        </div>
      {/if}
      {#if !session.runs.length && !orphans.length}
        <p class="text-sm text-ws-soft">This session has no runs.</p>
      {/if}
    </div>
  {/if}
</article>
