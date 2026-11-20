<script lang="ts">
  // One journal entry as a card named for its drills, with the drill's icon and a score
  // sparkline; on demand its runs and attempt evidence. The note leads when there is one.
  // Add or edit the note sits on the card; Delete waits behind a small overflow button and asks first.
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Trash from "@lucide/svelte/icons/trash-2";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import ScoreBadge from "./ScoreBadge.svelte";
  import TagInput from "./TagInput.svelte";
  import { tick } from "svelte";
  import type { PracticeSession, ScoringEvent } from "@repo/music-core";
  import { sessionMinutes } from "@repo/music-core/progress/journal";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { practice } from "../../practice.svelte";
  import { btn, btnPrimary } from "../../components/ui";
  import Pencil from "@lucide/svelte/icons/pencil";
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
    pct,
    plural,
    scoreHistory,
    sessionInstruments,
    sessionTitle,
  } from "../progress/model";

  let { session, announce }: { session: PracticeSession; announce: (msg: string) => void } = $props();

  let open = $state(false);
  let editing = $state(false);
  let confirming = $state(false);
  let more = $state(false);
  let note = $state("");
  let nextTime = $state("");
  let tags = $state<string[]>([]);
  // Tags used on any session, offered while typing.
  const known = $derived([...new Set(practice.sessions.flatMap((x) => x.tags))].sort());
  let keepBtn = $state<HTMLButtonElement>();
  let deleteBtn = $state<HTMLButtonElement>();

  const id = $derived(session.id);
  const events = $derived(open ? practice.events.filter((e) => e.sessionId === session.id) : []);
  const byRun = $derived(
    session.runs.map((r) => ({ run: r, events: events.filter((e) => e.runId === r.id) })),
  );
  const orphans = $derived(events.filter((e) => !session.runs.some((r) => r.id === e.runId)));
  const duration = $derived(formatDuration(sessionMinutes(session) * 60_000));
  // Same naming as Sessions on Progress: the instruments the runs used, or the answer buttons.
  const played = $derived(sessionInstruments(session, INSTRUMENT_LABEL));
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

  let noteBox = $state<HTMLTextAreaElement>();
  async function startEdit() {
    // One thing at a time: the answers and the More row fold away while the note is edited.
    open = false;
    more = confirming = false;
    note = session.note ?? "";
    nextTime = session.nextTime ?? "";
    tags = [...session.tags];
    editing = true;
    await tick();
    noteBox?.focus();
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await practice.editSession(id, { note: note.trim() || undefined, nextTime: nextTime.trim() || undefined, tags: [...tags] });
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
    more = false;
    await tick();
    moreBtn?.focus();
  }
  let moreBtn = $state<HTMLButtonElement>();
  // Save at full strength (contract K5 tokens, falling back to the hue until they land).


  async function remove() {
    await practice.deleteSession(id);
    announce("Session deleted.");
  }
</script>

{#snippet evidence(list: ScoringEvent[])}
  {#if list.length}
    {@const misses = list.filter((e) => !e.correct)}
    <!-- Every attempt as a dot (glyph and colour), then the misses spelled out; the rest on demand. -->
    <ol class="mt-2 flex flex-wrap gap-1" aria-label="Answers in order: {list.length - misses.length} right, {misses.length} missed">
      {#each list as e, i (e.id)}
        <li
          class="grid size-8 place-items-center rounded-full text-sm font-bold {e.correct ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}"
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
            <span>Expected <span class="font-semibold">{formatLabel(e.target) || e.promptId}</span>{#if e.response !== undefined}, you answered <span class="font-semibold">{formatLabel(e.response)}</span>{/if}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-1 text-sm text-success">All {list.length} right.</p>
    {/if}
    <details class="group mt-2 text-sm">
      <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-ws-soft hover:text-ws-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown class="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" />Details of each answer
      </summary>
      <ol class="flex flex-col divide-y divide-ws-line rounded-xl border border-ws-line">
        {#each list as e, i (e.id)}
          <li class="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
            <span class="font-medium sm:w-48 sm:shrink-0">
              <span class="tnum text-ws-soft">{i + 1}.</span>
              {formatLabel(e.target) || e.promptId}:
              {#if e.correct}<span class="text-success">Right</span>{:else}<span class="text-destructive">Missed</span>{#if e.response !== undefined}, you answered {formatLabel(e.response)}{/if}{/if}
            </span>
            <span class="text-ws-soft">
              Credit {pct(e.partialCredit)}, {e.assistance ? ASSISTANCE_LABEL[e.assistance] : "Mode not saved"}, {INPUT_LABEL[e.source]}{e.instrument
                ? `, ${INSTRUMENT_LABEL[e.instrument]}`
                : ""}
            </span>
          </li>
        {/each}
      </ol>
    </details>
  {:else}
    <p class="mt-1 text-sm text-ws-soft">No scored answers.</p>
  {/if}
{/snippet}

<article class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="{id}-title" data-session={id} style:--card-hue={hueVar(hue)}>
  <!-- The whole head is the toggle for every answer; the score stays right of the title at every width. -->
  <h3 class="font-semibold">
  <button
    type="button"
    class="-m-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl p-2 text-left hover:bg-ws-raised/60"
    aria-expanded={open}
    aria-controls="{id}-detail"
    onclick={() => (open = !open)}
  >
    <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--card-hue)] text-ws-stage" aria-hidden="true">
      <Icon class="size-5" />
    </span>
    <span class="min-w-0 flex-1">
      <span id="{id}-title" class="block">{title}</span>
      <span class="block text-sm font-normal text-ws-soft">{when}. {SOURCE_LABEL[session.source]} {played === "Answer buttons" ? "with answer buttons" : `on ${played}`}</span>
      <span class="sr-only">{open ? "Hide answers" : "Show every answer"}</span>
    </span>
    {#if lead?.score !== undefined}
      <span class="flex shrink-0 items-end gap-2">
        {#if scores.length > 1}
          <span
            class="flex h-9 items-end gap-0.5 max-sm:hidden"
            role="img"
            aria-label="{exerciseTitle(lead.exerciseId)} scores up to this session: {scores.map((v) => pct(v)).join(', ')}"
          >
            {#each scores as v, i (i)}
              <span
                class="w-1.5 rounded-sm bg-[color:var(--card-hue)] {i === scores.length - 1 ? '' : 'opacity-45'}"
                style:height="{Math.max(10, v * 100)}%"
              ></span>
            {/each}
          </span>
        {/if}
        <span class="flex flex-col items-end gap-1">
          <span class="tnum font-display text-2xl font-semibold leading-none"><span class="sr-only">Score </span>{pct(lead.score)}</span>
          <ScoreBadge run={lead} />
        </span>
      </span>
    {/if}
    <ChevronDown class="mt-1 size-4 shrink-0 text-ws-soft motion-safe:transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true" />
  </button>
  </h3>
  <!-- What it measured, then the time; XP stays on Progress. One small note button and the overflow. -->
  <div class="mt-3 flex items-center gap-3">
  <dl class="tnum flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
    {#if session.eventIds.length}
      <div class="flex gap-1.5"><dt class="text-ws-soft">Answers</dt><dd class="font-semibold">{session.eventIds.length}</dd></div>
    {/if}
    <div class="flex gap-1.5"><dt class="text-ws-soft">Time</dt><dd class="font-semibold">{duration}</dd></div>
  </dl>
    {#if !editing}
      <button
        type="button"
        class="-my-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
        aria-label={session.note || session.nextTime || session.tags.length ? "Edit note" : "Add note"}
        title={session.note || session.nextTime || session.tags.length ? "Edit note" : "Add note"}
        onclick={startEdit}
        ><Pencil class="size-5" aria-hidden="true" />{#if !(session.note || session.nextTime || session.tags.length)}<!-- An empty card asks for its note in words, so the journal reads as a log, not a score list. -->Add note{/if}</button
      >
    {/if}
    <!-- Deleting waits behind a small overflow button and asks first. -->
    <button
      type="button"
      class="-my-2 grid shrink-0 size-11 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
      bind:this={moreBtn}
      aria-label="More for this session"
      aria-expanded={more}
      aria-controls="{id}-more"
      onclick={() => {
        more = !more;
        confirming = false;
      }}><Ellipsis class="size-5" aria-hidden="true" /></button
    >
  </div>
  {#if !editing}
    {#if session.note}<p class="mt-3 line-clamp-3 max-w-prose whitespace-pre-line border-l-2 border-[color:var(--card-hue)] pl-3" title={session.note}>{session.note}</p>{/if}
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
        <textarea class="min-h-20 rounded-lg border border-ws-line bg-ws-surface p-2" bind:this={noteBox} bind:value={note}></textarea>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Next time</span>
        <input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={nextTime} placeholder="What to try next session" />
      </label>
      <TagInput bind:tags suggestions={known} />
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" class={btnPrimary}>Save</button>
        <button type="button" class="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-ws-soft hover:bg-ws-raised hover:text-ws-ink" onclick={() => (editing = confirming = false)}>Cancel</button>
      </div>
    </form>
  {/if}



  {#if more}
    <div id="{id}-more" class="mt-2 flex flex-wrap items-center justify-end gap-2">
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
  {/if}

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
          <p class="font-medium">Answers from a run that didn't finish</p>
          {@render evidence(orphans)}
        </div>
      {/if}
      {#if !session.runs.length && !orphans.length}
        <p class="text-sm text-ws-soft">This session has no runs.</p>
      {/if}
    </div>
  {/if}
</article>
