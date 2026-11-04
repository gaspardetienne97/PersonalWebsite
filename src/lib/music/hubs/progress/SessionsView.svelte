<script lang="ts">
  // Sessions: what you actually did, and whether the same setup improved.
  import Lock from "lucide-svelte/icons/lock";
  import Check from "lucide-svelte/icons/check";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import {
    achievements,
    computeStreak,
    dayKey,
    levelFor,
    practicedDays,
    weeklySummary,
  } from "@repo/music-core/progress/rewards";
  import { weekRollups } from "@repo/music-core/progress/journal";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { todayPlan } from "../../today.svelte";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { hueForRoute, hueVar } from "../../hues";
  import { HUE_ICON } from "../hue-icons";
  import { exerciseDrill, foldShort, formatDuration, pct, plural, relativeDay, sessionInstruments, sessionMs, sessionTitle, setupTrends } from "./model";
  import ScoreBadge from "../journal/ScoreBadge.svelte";
  import WeekCompare from "./WeekCompare.svelte";

  let { now = Date.now() }: { now?: number } = $props();

  const today = $derived(dayKey(now));
  const days = $derived(practicedDays(practice.sessions));
  const xp = $derived(practice.xpTotal);
  const level = $derived(levelFor(xp));
  const toNext = $derived(level * 250 - xp);
  const weeks = $derived(weekRollups(practice.sessions, today));
  const trends = $derived(setupTrends(practice.sessions));
  const plan = $derived(todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes));
  const weakSpot = $derived(
    plan.advice.focus ? { skillId: plan.advice.focus.skillId, name: plan.advice.focus.name, href: plan.advice.action.href } : undefined,
  );
  const summary = $derived(weeklySummary({ today, sessions: practice.sessions, events: practice.events, weakSpot }));
  const streak = $derived(computeStreak(days, settings.value.frozenDays, today));
  const badges = $derived(
    achievements({
      xp,
      longestStreak: streak.longest,
      mastery: practice.mastery,
      frozenDays: settings.value.frozenDays,
    }),
  );

  // The latest sessions first, as a dated list: what, on what, how long, and how it went.
  const RECENT = 8;
  // Tap-length sessions fold into the one before them (display only), so "0 sec, 89%" never shows.
  const recent = $derived(
    foldShort(practice.sessions)
      .slice(0, RECENT)
      .map(({ session: s, folded }) => {
        const lead = s.runs.find((r) => r.score !== undefined) ?? s.runs[0];
        const hue = hueForRoute((lead && exerciseDrill(lead.exerciseId)?.entry.route) ?? "/music", lead?.instrument ?? s.instrument);
        return { s, lead, hue, ms: sessionMs(s), folded };
      }),
  );
  const when = (ms: number) => {
    const day = relativeDay(ms, now);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  };


  const trendWords = (first: number, last: number) => {
    const d = Math.round((last - first) * 100);
    return d > 0 ? `up ${d} points` : d < 0 ? `down ${-d} points` : "level";
  };
</script>

{#if practice.sessions.length === 0}
  <div class="rounded-2xl border border-dashed border-ws-line p-6">
    <p class="font-semibold">No sessions saved yet.</p>
    <p class="text-sm text-ws-soft">Finish one drill and it shows up here with its score, so the next visit has something to beat.</p>
    <a class="mt-3 inline-flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage" href="/music"
      >Start today's set</a
    >
  </div>
{:else}
  <section aria-labelledby="recent-title" class="mb-8">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="recent-title" class="font-display text-xl font-semibold">Recent sessions</h2>
      <a class="inline-flex min-h-11 items-center text-sm font-semibold text-instr-ink underline-offset-4 hover:underline" href="/music/journal"
        >All {plural(practice.sessions.length, "session")} in the journal</a
      >
    </div>
    <ul class="mt-2 flex flex-col divide-y divide-ws-line border-y border-ws-line">
      {#each recent as { s, lead, hue, ms, folded } (s.id)}
        {@const Icon = HUE_ICON[hue]}
        {@const href = lead && exerciseDrill(lead.exerciseId)?.entry.route}
        <!-- A row is its drill's door: tap it to practise the same thing again. -->
        <li class="min-w-0" style:--h={hueVar(hue)}>
          <svelte:element
            this={href ? "a" : "div"}
            {href}
            class="flex min-w-0 items-center gap-3 py-2.5 {href ? '-mx-2 rounded-xl px-2 hover:bg-ws-raised' : ''}"
          >
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-[color:var(--h)] text-ws-stage" aria-hidden="true"><Icon class="size-5" /></span>
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{sessionTitle(s)}</p>
              <p class="text-sm text-ws-soft">
                {when(s.startTime)}. {sessionInstruments(s, INSTRUMENT_LABEL)}, {formatDuration(ms)}{#if s.eventIds.length}, {plural(s.eventIds.length, "answer")}{/if}{#if folded}, plus {plural(folded, "short try", "short tries")}{/if}
              </p>
            </div>
            <span class="tnum flex shrink-0 flex-col items-end text-right">
              {#if lead?.score !== undefined}<span class="font-display text-lg font-semibold">{pct(lead.score)}</span><ScoreBadge run={lead} />{:else}<span class="text-sm text-ws-soft">No score</span>{/if}
            </span>
            {#if href}
              <span class="flex shrink-0 items-center gap-1 text-sm font-semibold text-instr-ink">
                <span class="max-sm:sr-only">Practise again</span><ChevronRight class="size-4" aria-hidden="true" />
              </span>
            {/if}
          </svelte:element>
        </li>
      {/each}
    </ul>
  </section>

  <div class="flex min-w-0 flex-col gap-8">
      <section aria-labelledby="weeks-title">
        <h2 id="weeks-title" class="font-display text-xl font-semibold">This week and last</h2>
        <div class="max-w-md"><WeekCompare {weeks} /></div>
      </section>

      <section aria-labelledby="setups-title">
        <h2 id="setups-title" class="font-display text-xl font-semibold">Same setup, later visits</h2>
        <p class="text-sm text-ws-soft">Runs are paired only when the exercise and its whole setup match.</p>
        {#if trends.length}
          <ul class="mt-3 flex flex-col divide-y divide-ws-line border-y border-ws-line">
            {#each trends as t (t.key)}
              {@const series = t.scores.slice(-12)}
              <li class="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
                <div class="min-w-0 flex-1 basis-56">
                  <p class="font-semibold">{t.title}</p>
                  <p class="text-sm text-ws-soft">{t.detail}</p>
                  <p class="tnum mt-1 text-sm">
                    First {pct(t.first)}, last {pct(t.last)}, best {pct(t.best)}: {trendWords(t.first, t.last)} over
                    {plural(t.scores.length, "run")}, latest {relativeDay(t.lastAt, now)}.
                  </p>
                </div>
                <div
                  class="flex h-10 items-end gap-0.5"
                  role="img"
                  aria-label="Scores in order: {series.map((s) => pct(s)).join(', ')}"
                >
                  {#each series as s, i (i)}
                    <span
                      class="w-2 rounded-sm {s === t.best ? 'bg-instr' : 'bg-instr/45'}"
                      style:height="{Math.max(8, s * 100)}%"
                    ></span>
                  {/each}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-2 text-sm">Nothing repeated yet. Run any drill twice with the same setup to see whether it improved.</p>
        {/if}
      </section>
  </div>

  <!-- Level and achievements: their own section, apart from what you played. -->
  <section aria-labelledby="level-title" class="border-t border-ws-line pt-6">
    <h2 id="level-title" class="font-display text-xl font-semibold">Level and achievements</h2>
    <div class="mt-3 grid gap-8 lg:grid-cols-2">
      <div class="min-w-0">
        <dl class="tnum grid max-w-md grid-cols-2 gap-3">
          <div class="rounded-2xl bg-ws-raised/60 px-4 py-3">
            <dt class="text-sm text-ws-soft">Level</dt>
            <dd class="font-display text-3xl font-semibold">{level}</dd>
          </div>
          <div class="rounded-2xl bg-ws-raised/60 px-4 py-3">
            <dt class="text-sm text-ws-soft">Streak</dt>
            <dd class="font-display text-3xl font-semibold">{plural(streak.current, "day")}</dd>
          </div>
        </dl>
        <div class="mt-3 h-2 max-w-md rounded-full bg-ws-raised" aria-hidden="true">
          <div class="h-full rounded-full bg-instr" style:width="{((250 - toNext) / 250) * 100}%"></div>
        </div>
        <!-- One line: the weekly figure only once it differs from the total. -->
        <p class="tnum mt-2 max-w-md text-sm">
          <span class="font-semibold">Level {level}. {xp} XP, {toNext} to level {level + 1}.</span>
          {#if summary.xp !== xp}<span class="text-ws-soft">{summary.xp} XP this week.</span>{/if}
        </p>
        <details class="group mt-1 max-w-md text-sm">
          <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-instr-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown class="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" />How scores work
          </summary>
          <p class="text-ws-soft">Every session earns XP. Skill scores move only on answers in Check runs, where the targets are hidden.</p>
        </details>
      </div>
      <div class="min-w-0">
        <h3 id="badges-title" class="font-display text-lg font-semibold">Achievements</h3>
        <p class="text-sm text-ws-soft">{badges.filter((b) => b.unlocked).length} of {badges.length} unlocked.</p>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {#each badges as b (b.id)}
            <li
              class="flex items-center gap-3 rounded-xl px-3 py-2 {b.unlocked
                ? 'bg-instr-wash'
                : 'border border-dashed border-ws-soft/60'}"
            >
              <span
                class="grid size-9 shrink-0 place-items-center rounded-full {b.unlocked ? 'bg-instr text-ws-stage' : 'bg-ws-raised text-ws-soft'}"
                aria-hidden="true"
              >
                {#if b.unlocked}<Check class="size-4" />{:else}<Lock class="size-4" />{/if}
              </span>
              <div class="min-w-0">
                <p class="font-medium">{b.title}</p>
                <p class="text-sm text-ws-soft">{b.unlocked ? "Unlocked." : "Locked."} {b.description}</p>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </section>
{/if}
