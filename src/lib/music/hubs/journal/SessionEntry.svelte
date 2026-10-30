<script lang="ts">
  // One journal entry as a card named for its drills, with the drill's icon and a score
  // sparkline; on demand its runs and attempt evidence. Delete lives in the edit view,
  // behind a confirm, so it is never one tap from the main actions.
  import ChevronDown from "lucide-svelte/icons/chevron-down";
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
  const minutes = $derived(Math.round(sessionMinutes(session)));
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
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="relative mt-2 overflow-x-auto" role="region" aria-label="Attempt evidence" tabindex="0">
      <table class="w-full min-w-[32rem] text-left text-sm">
        <thead class="text-ws-soft">
          <tr>
            <th scope="col" class="py-1.5 pr-3 font-medium">Target</th>
            <th scope="col" class="py-1.5 pr-3 font-medium">Result</th>
            <th scope="col" class="py-1.5 pr-3 text-right font-medium">Credit</th>
            <th scope="col" class="py-1.5 pr-3 font-medium">Assistance</th>
            <th scope="col" class="py-1.5 pr-3 font-medium">Input</th>
            <th scope="col" class="py-1.5 font-medium">Instrument</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ws-line">
          {#each list as e (e.id)}
            <tr>
              <td class="py-1.5 pr-3">{formatLabel(e.target) || e.promptId}</td>
              <td class="py-1.5 pr-3">
                {#if e.correct}<span class="text-success" aria-hidden="true">✓</span> Right{:else}<span
                    class="text-destructive"
                    aria-hidden="true">✗</span
                  > Missed{#if e.response !== undefined}, answered {formatLabel(e.response)}{/if}{/if}
              </td>
              <td class="tnum py-1.5 pr-3 text-right">{pct(e.partialCredit)}</td>
              <td class="py-1.5 pr-3">{e.assistance ? ASSISTANCE_LABEL[e.assistance] : "Not recorded"}</td>
              <td class="py-1.5 pr-3">{INPUT_LABEL[e.source]}</td>
              <td class="py-1.5">{e.instrument ? INSTRUMENT_LABEL[e.instrument] : "Not recorded"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="mt-1 text-sm text-ws-soft">No graded attempts.</p>
  {/if}
{/snippet}

<article class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="{id}-title" data-session={id} style:--card-hue={hueVar(hue)}>
  <div class="flex items-start gap-3">
    <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--card-hue)] text-[oklch(0.2_0.04_288)]" aria-hidden="true">
      <Icon class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <h3 id="{id}-title" class="font-semibold">{title}</h3>
      <p class="text-sm text-ws-soft">{when}. {SOURCE_LABEL[session.source]} on {instrument}</p>
    </div>
    {#if scores.length}
      <div
        class="flex h-10 shrink-0 items-end gap-0.5"
        role="img"
        aria-label="{exerciseTitle(lead!.exerciseId)} scores up to this session: {scores.map((v) => pct(v)).join(', ')}"
      >
        {#each scores as v, i (i)}
          <span
            class="w-1.5 rounded-sm bg-[color:var(--card-hue)] {i === scores.length - 1 ? '' : 'opacity-45'}"
            style:height="{Math.max(10, v * 100)}%"
          ></span>
        {/each}
      </div>
    {/if}
  </div>
  <dl class="tnum mt-3 flex gap-5 text-sm">
    <div><dt class="text-ws-soft">XP</dt><dd class="font-semibold">{session.xp}</dd></div>
    <div><dt class="text-ws-soft">Attempts</dt><dd class="font-semibold">{session.eventIds.length}</dd></div>
    <div><dt class="text-ws-soft">Minutes</dt><dd class="font-semibold">{minutes}</dd></div>
    {#if lead?.score !== undefined}<div><dt class="text-ws-soft">Score</dt><dd class="font-semibold">{pct(lead.score)}</dd></div>{/if}
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
        <span class="grow"></span>
        {#if confirming}
          <span class="flex flex-wrap items-center gap-2 rounded-full bg-destructive/10 py-1 pl-4 pr-1 text-sm" role="group" aria-label="Confirm delete">
            Delete this session?
            <button type="button" class="inline-flex min-h-11 items-center justify-center rounded-full bg-destructive px-4 text-sm font-semibold text-white hover:brightness-110" onclick={remove}>Delete session</button>
            <button type="button" class={btn} bind:this={keepBtn} onclick={keep}>Keep it</button>
          </span>
        {:else}
          <button type="button" class="{btn} text-destructive" bind:this={deleteBtn} onclick={askDelete}>Delete session</button>
        {/if}
      </div>
    </form>
  {/if}

  <div class="mt-3 flex flex-wrap items-center gap-2">
    <button type="button" class={btn} aria-expanded={open} aria-controls="{id}-detail" onclick={() => (open = !open)}>
      <ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true" />
      {open ? "Hide runs and evidence" : `Show ${plural(session.runs.length, "run")} and evidence`}
    </button>
    {#if !editing}
      <button type="button" class={btn} onclick={startEdit}>Edit note and tags</button>
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
