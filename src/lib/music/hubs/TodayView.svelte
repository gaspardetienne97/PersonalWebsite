<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import Play from "@lucide/svelte/icons/play";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Star from "@lucide/svelte/icons/star";
  import Info from "@lucide/svelte/icons/info";
  import { BUDGET_OPTIONS, blockStars, roleLabel } from "@repo/music-core/progress/routine";
  import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
  import { levelFor } from "@repo/music-core/progress/rewards";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import {
    blockReason,
    blockSummary,
    localWeekday,
    nextDrill,
    setDayInstrument,
    splitOptions,
    todayChallenges,
    todayPlan,
    tomorrowPlan,
    WEEKDAYS,
  } from "../today.svelte";
  import { btn, btnPrimary, panel } from "../components/ui";
  import Picker from "../components/Picker.svelte";
  import { HUE_ICON } from "./hue-icons";
  import Ring from "./progress/Ring.svelte";
  import StreakWeek from "./progress/StreakWeek.svelte";
  import { formatDuration } from "./progress/model";
  import DrillPreview from "./DrillPreview.svelte";

  const plan = $derived(todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes));
  const instrument = $derived(plan.instrument);
  const weekday = localWeekday();
  const budget = $derived(plan.routine.budgetMinutes);
  const challenges = $derived(todayChallenges(plan.advice));
  const nextStep = $derived(plan.routine.steps.find((s) => !plan.done.includes(s.n)));
  const allDone = $derived(plan.routine.steps.length > 0 && !nextStep);
  const minutesLeft = $derived(
    plan.routine.steps.filter((s) => !plan.done.includes(s.n)).reduce((t, s) => t + s.minutes, 0),
  );
  // The coach's bar, drawn: checked answers so far against the five it needs.
  const toMeasure = $derived(Math.min(plan.checked, COACH_MIN_ATTEMPTS));
  // A set run in Practice: true, and the card says why the coach still has nothing.
  const practiceOnly = $derived(plan.done.length > 0 && !plan.advice.measured && plan.checked === 0);

  // Length and the weekday's routine: changed rarely, so they wait behind Adjust.
  let adjusting = $state(false);
  // One block's details open at a time; the block about to start is open until another is picked.
  // Its Start is the set's one primary button. -1: the reader closed it.
  let openRow = $state<number | null>(null);
  const shownRow = $derived(openRow ?? nextStep?.n ?? null);
  let coachInfo = $state(false);
  // The set's playing time is the sum of its blocks' run times, so the total and the rows agree.
  const playedTotal = $derived(Object.values(plan.playedMs).reduce((a, b) => a + b, 0));

  // Once the set is done: one named drill to try next (the coach's when it has measured something,
  // else the first drill on this instrument the set did not use), and tomorrow's set.
  const tomorrow = $derived(allDone ? tomorrowPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes) : undefined);
  const nextUp = $derived(allDone ? nextDrill(plan) : undefined);

  const hueOf = (href: string) => hueForRoute(href, instrument);
  // Stars per block on the advance rule's lines (70%, 85%, clean); a block with no scored run has none.
  const stars = $derived(plan.done.length ? blockStars(plan.routine, practice.sessions) : {});
  const STAR_WORDS = [m.music_hubs_today_stars_under70(), m.music_hubs_today_stars_70(), m.music_hubs_today_stars_85(), m.music_hubs_today_stars_clean()];
  // Confetti only when a block earned its third star (a run the advance rule counts), never on a set with nothing scored.
  const passed = $derived(allDone && Object.values(stars).some((n) => n >= 3));
  // Static confetti, drawn at rest so a still frame shows it; motion only adds a short fall.
  const confetti = $derived(
    Array.from({ length: 24 }, (_, i) => {
      const step = plan.routine.steps[i % Math.max(1, plan.routine.steps.length)];
      return {
        x: ((i * 41) % 97) + 1.5,
        y: ((i * 53) % 30) + 6,
        r: (i * 47) % 180,
        round: i % 3 === 0,
        hue: step ? hueVar(hueOf(step.href)) : "var(--instr)",
      };
    }),
  );
  // Before any practice the side cards have nothing to say: no challenges, no second button.
  const fresh0 = $derived(practice.sessions.length === 0);

  // The burst plays the first time a done set is seen each day, not on every visit.
  let fresh = $state(false);
  $effect(() => {
    if (!allDone) return;
    const day = new Date().toDateString();
    try {
      if (localStorage.getItem("woodshed.set-celebrated") === day) return;
      localStorage.setItem("woodshed.set-celebrated", day);
    } catch {
      // No storage: celebrate anyway.
    }
    fresh = true;
  });

  const greeting = (instrument: string) => {
    const h = new Date().getHours();
    return h < 12
      ? m.music_hubs_today_greeting_morning({ instrument })
      : h < 18
        ? m.music_hubs_today_greeting_afternoon({ instrument })
        : m.music_hubs_today_greeting_evening({ instrument });
  };
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <section aria-labelledby="set-title" class="min-w-0">
    <div class="flex items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-ws-soft">
          {greeting(INSTRUMENT_LABEL[instrument])}{plan.pass > 1 ? m.music_hubs_today_greeting_set({ n: plan.pass }) : ""}<!-- The streak at a glance where its card sits below the fold. --><span class="lg:hidden"
            >{plan.streak.current === 1 ? m.music_hubs_today_greeting_streak_first() : plan.streak.current ? m.music_hubs_today_greeting_streak({ days: plan.streak.current }) : ""}</span
          >
        </p>
        <h2 id="set-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {#if allDone}{m.music_hubs_today_title_complete()}{:else if plan.done.length}{m.music_hubs_today_title_left({ count: minutesLeft })}{:else}{m.music_hubs_today_title_plan({ minutes: budget })}{/if}
        </h2>
      </div>
      <button type="button" class="{btn} shrink-0" aria-expanded={adjusting} aria-controls="set-adjust" onclick={() => (adjusting = !adjusting)}>
        <SlidersHorizontal class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">{m.music_hubs_today_adjust()}</span><ChevronDown
          class="size-4 motion-safe:transition-transform max-sm:hidden {adjusting ? 'rotate-180' : ''}"
          aria-hidden="true"
        />
      </button>
    </div>

    {#if adjusting}
      <div id="set-adjust" class="mt-3 flex flex-col gap-3 rounded-2xl border border-ws-line bg-ws-surface p-3 sm:p-4">
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium" id="len-label">{m.music_hubs_today_length()}</span>
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="len-label">
            {#each BUDGET_OPTIONS as min (min)}
              <button
                type="button"
                class="tnum min-h-11 min-w-12 rounded-full border px-3 text-sm {min === budget
                  ? 'border-transparent bg-instr-strong font-semibold text-on-instr'
                  : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
                aria-pressed={min === budget}
                onclick={() => settings.update({ routineBudgetMinutes: min })}>{m.music_hubs_minutes_short({ minutes: min })}</button
              >
            {/each}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="font-medium" aria-hidden="true">{m.music_hubs_today_day_routine({ day: WEEKDAYS[weekday] })}</span>
          <Picker
            class="w-auto"
            label={m.music_hubs_today_day_instrument({ day: WEEKDAYS[weekday] })}
            value={settings.value.weeklySplit?.[weekday] ?? ""}
            options={splitOptions(settings.value.activeInstrument)}
            onchange={(v) => setDayInstrument(weekday, v)}
          />
          <span class="text-ws-soft">{m.music_hubs_today_day_repeats({ day: WEEKDAYS[weekday] })}</span>
        </div>
      </div>
    {/if}

    <!-- The set as a ribbon that fills block by block, and the one button that plays it. -->
    <div
      class="relative mt-4 overflow-hidden rounded-3xl border bg-ws-surface p-4 shadow-sm sm:p-5 {allDone
        ? 'border-success/60 ring-1 ring-success/30'
        : 'border-ws-line'}"
    >
      <div
        class="flex gap-1.5"
        role="progressbar"
        aria-label={m.music_hubs_today_set_label()}
        aria-valuemin={0}
        aria-valuemax={plan.routine.steps.length}
        aria-valuenow={plan.done.length}
        aria-valuetext={m.music_hubs_today_set_value({ done: plan.done.length, total: plan.routine.steps.length })}
      >
        {#each plan.routine.steps as step (step.n)}
          {@const done = plan.done.includes(step.n)}
          {@const isNext = nextStep?.n === step.n}
          {@const Icon = HUE_ICON[hueOf(step.href)]}
          <!-- A slim bar sized by minutes: it fills as the block is played. The names sit under it, so no empty pill reads as a disabled button. -->
          <div class="min-w-11 basis-0" style:flex-grow={step.minutes} style:--step-hue={hueVar(hueOf(step.href))}>
            <div class="relative h-3 overflow-hidden rounded-full bg-ws-raised {isNext ? 'ring-2 ring-[color:var(--step-hue)] ring-offset-2 ring-offset-ws-surface' : ''}">
              <div
                class="ws-fill absolute inset-y-0 left-0 rounded-full bg-[color:var(--step-hue)] {done ? '' : 'opacity-60'}"
                style:width={done ? "100%" : `${Math.min(95, ((plan.playedMs[step.n] ?? 0) / (step.minutes * 600)))}%`}
                style:transition-delay={fresh ? `${(step.n - 1) * 180}ms` : undefined}
              ></div>
            </div>
            <span class="sr-only">{done ? m.music_hubs_today_block_done_sr({ label: step.label }) : isNext ? m.music_hubs_today_block_now_sr({ label: step.label }) : step.label}</span>
          </div>
        {/each}
      </div>
      <!-- Each block's name and length (or Done) sit under its segment, the same at every width. -->
      <div class="mt-1.5 flex gap-1.5" aria-hidden="true">
        {#each plan.routine.steps as step (step.n)}
          {@const done = plan.done.includes(step.n)}
          {@const Icon = HUE_ICON[hueOf(step.href)]}
          <span class="min-w-11 basis-0 px-0.5 text-[13px] leading-tight [overflow-wrap:anywhere] sm:text-sm" style:flex-grow={step.minutes}>
            <span class="flex items-start gap-1 font-medium">
              {#if done}<span class="{fresh ? 'ws-pop' : ''} mt-px shrink-0" style:animation-delay={fresh ? `${(step.n - 1) * 180 + 300}ms` : undefined}><Check class="size-4 text-success" /></span>{:else}<Icon class="mt-px size-4 shrink-0 text-ws-soft" />{/if}
              <span class="min-w-0">{step.label}</span>
            </span>
            <span class="tnum block text-ws-soft">{done ? m.music_hubs_done() : nextStep?.n === step.n ? m.music_hubs_today_block_now_minutes({ minutes: step.minutes }) : m.music_hubs_minutes_short({ minutes: step.minutes })}</span>
          </span>
        {/each}
      </div>

      {#if allDone}
        <!-- The set's moment: stars per block on the advance rule's lines, confetti only on a pass. -->
        <div class="relative mt-4 overflow-hidden rounded-2xl bg-success/10 p-4 sm:p-5 {passed ? 'pt-12 sm:pt-12' : ''}">
          <!-- A band of confetti over the stars, clear of the text. -->
          <span class:fresh class="celebrate pointer-events-none absolute inset-x-0 top-0 h-11" aria-hidden="true">
            {#if passed}
              <svg class="size-full overflow-visible">
                {#each confetti as c, i (i)}
                  {#if c.round}
                    <ellipse class="bit" style:--d="{(i % 6) * 60}ms" cx="{c.x}%" cy={c.y} rx="3.5" ry="5" fill={c.hue} style:rotate="{c.r}deg" />
                  {:else}
                    <rect class="bit" style:--d="{(i % 6) * 60}ms" x="{c.x}%" y={c.y - 6} width="5" height="12" rx="1.5" fill={c.hue} style:rotate="{c.r}deg" />
                  {/if}
                {/each}
              </svg>
            {/if}
          </span>
          <ul class="relative flex flex-wrap gap-x-6 gap-y-3">
            {#each plan.routine.steps as step (step.n)}
              {@const n = stars[step.n]}
              <li class="flex min-w-0 flex-col gap-1">
                <span class="text-sm font-semibold">{step.label}</span>
                {#if n === undefined}
                  <span class="text-sm text-ws-soft">{m.music_hubs_today_not_measured()}</span>
                {:else}
                  <span class="flex items-center gap-0.5" role="img" aria-label={m.music_hubs_today_stars_label({ n, words: STAR_WORDS[n] })}>
                    {#each [1, 2, 3] as k (k)}
                      <Star class="size-7 {k <= n ? 'fill-warn text-ws-ink' : 'text-ws-soft'}" aria-hidden="true" />
                    {/each}
                    <span class="tnum ml-1.5 text-sm text-ws-soft" aria-hidden="true">{m.music_hubs_today_n_of_3({ n })}</span>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
          <!-- What the set came to: every block played (what completes a set, minutes are only the plan), with the time its runs took. -->
          <p class="tnum relative mt-4 font-semibold">{m.music_hubs_today_done_heading()}</p>
          <p class="tnum relative text-sm text-ws-soft">{m.music_hubs_today_done_detail({ duration: formatDuration(playedTotal), minutes: budget })}</p>
          <dl class="tnum relative mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {#if plan.summary.accuracy !== undefined}
              <div><dt class="text-[13px] text-ws-soft">{m.music_hubs_today_correct()}</dt><dd class="font-semibold">{Math.round(plan.summary.accuracy * 100)}%</dd></div>
            {/if}
            <div><dt class="text-[13px] text-ws-soft">{m.music_hubs_today_xp_earned()}</dt><dd class="font-semibold">+{plan.summary.xp}</dd></div>
          </dl>
          {#if nextUp}<p class="relative mt-4 text-sm">{nextUp.why}</p>{/if}
          <div class="relative mt-2 flex flex-wrap items-center gap-2">
            <!-- The day is done, so nothing here is filled: more practice is an offer. -->
            {#if nextUp}<a class={btn} href={nextUp.href}><Play class="size-4" aria-hidden="true" /><span><span class="font-normal">{m.music_hubs_today_extra()}</span> {nextUp.label}</span></a>{/if}
            <a class={btn} href={plan.repeatHref}>{m.music_hubs_today_repeat()}</a>
            <a class="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-instr-ink hover:underline" href="/music/progress?view=journal">{m.music_hubs_today_open_journal()}</a>
          </div>
        </div>
      {/if}
    </div>

    {#if allDone && tomorrow}
      <section aria-labelledby="tomorrow-title" class="mt-4 rounded-3xl border border-ws-line bg-ws-surface p-4 sm:p-5">
        <h2 id="tomorrow-title" class="font-display text-lg font-semibold">{m.music_hubs_today_tomorrow({ minutes: tomorrow.routine.budgetMinutes, instrument: INSTRUMENT_LABEL[tomorrow.instrument] })}</h2>
        <ol class="mt-2 flex flex-col gap-1.5 text-sm">
          {#each tomorrow.routine.steps as st (st.n)}
            {@const T = HUE_ICON[hueOf(st.href)]}
            <li class="flex items-center gap-2" style:--step-hue={hueVar(hueOf(st.href))}>
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--step-hue)] text-ws-stage" aria-hidden="true"><T class="size-3.5" /></span>
              <span class="min-w-0 flex-1 truncate">{st.label}</span>
              <span class="tnum text-ws-soft">{m.music_hubs_minutes_short({ minutes: st.minutes })}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <!-- The blocks: what each one plays and why it is here. A row opens to its details and its own Start. -->
    <ol class="mt-4 flex flex-col gap-2">
      {#each plan.routine.steps as step (step.n)}
        {@const done = plan.done.includes(step.n)}
        {@const isNext = nextStep?.n === step.n}
        {@const expanded = shownRow === step.n}
        {@const played = plan.playedMs[step.n]}
        <li
          class="min-w-0 rounded-2xl border {isNext ? 'border-transparent bg-ws-surface shadow-sm ring-2 ring-[color:var(--step-hue)]' : 'border-ws-line'}"
          style:--step-hue={hueVar(hueOf(step.href))}
        >
          <button
            type="button"
            class="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-ws-raised/60 sm:gap-4 sm:px-4"
            aria-expanded={expanded}
            aria-controls="block-{step.n}"
            onclick={() => (openRow = expanded ? -1 : step.n)}
          >
            <!-- On a phone the small picture stays in the row when open, so the open block ends above the tab bar. -->
            <span class="relative {expanded ? 'sm:hidden' : ''}">
              <DrillPreview href={step.href} {instrument} class="rounded-lg" />
              {#if done}<span class="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-success text-white" aria-hidden="true"><Check class="size-3.5" /></span>{/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-ws-soft">
                <span>{roleLabel(step)}</span>
                {#if done}<span class="font-semibold text-success">{m.music_hubs_done()}</span>{:else if isNext}<span class="rounded-full bg-instr-wash px-2 font-semibold text-instr-ink">{m.music_hubs_now()}</span>{/if}
              </span>
              <span class="block font-semibold"><span class="sr-only">{done ? m.music_hubs_today_step_done_sr({ n: step.n }) : m.music_hubs_today_step_sr({ n: step.n })}</span>{step.label}</span>
              {#if !expanded}<span class="block text-sm text-ws-soft">{blockSummary(step)}</span>{/if}
            </span>
            <!-- One figure: the plan's minutes until the block is done, then the time it took. -->
            <span class="tnum shrink-0 text-right text-sm text-ws-soft">
              {#if done}{stars[step.n] === undefined ? m.music_hubs_done() : m.music_hubs_today_n_of_3_stars({ n: stars[step.n] })}{:else}{m.music_hubs_minutes_short({ minutes: step.minutes })}{#if played}<span class="block text-[13px]">{m.music_hubs_today_so_far({ duration: formatDuration(played) })}</span>{/if}{/if}
            </span>
            <ChevronDown class="size-4 shrink-0 text-ws-soft motion-safe:transition-transform {expanded ? 'rotate-180' : ''}" aria-hidden="true" />
          </button>
          {#if expanded}
            <div id="block-{step.n}" class="flex flex-col gap-3 border-t border-ws-line px-3 py-3 sm:flex-row sm:items-center sm:px-4">
              <DrillPreview href={step.href} size="md" {instrument} class="max-sm:hidden sm:w-60 sm:shrink-0" />
              <!-- One line on what it is, then the block's Start; the rest of the reason from sm up. -->
              <div class="flex min-w-0 flex-col items-start gap-3">
                <p class="text-sm">{blockSummary(step)}</p>
                {#if isNext && !done}
                  <a class={btnPrimary + " min-h-14 w-full px-6 font-display text-base sm:w-auto sm:text-lg"} href={step.href}>
                    <Play class="size-5" aria-hidden="true" />{m.music_hubs_today_start_with({ label: step.label })}
                  </a>
                {:else}
                  <a href={step.href} class={btn}>
                    <Play class="size-4" aria-hidden="true" />{done ? m.music_hubs_again() : m.music_hubs_start()}<span class="sr-only">&nbsp;{step.label}</span>
                  </a>
                {/if}
                {#if blockReason(step) !== blockSummary(step)}<p class="text-sm text-ws-soft max-sm:hidden">{blockReason(step).slice(blockSummary(step).length).trim()}</p>{/if}
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  </section>

  <aside class="flex min-w-0 flex-col gap-4">
    <section class={panel} aria-label={m.music_hubs_today_streak()}>
      <StreakWeek week={plan.streak.week} current={plan.streak.current} freezes={plan.freezes} pop={fresh ? plan.today : undefined} />
    </section>

    <section class={panel} aria-labelledby="coach-title">
      <h2 id="coach-title" class="font-display text-lg font-semibold">{plan.advice.headline}</h2>
      {#if plan.advice.focus}
        <!-- One figure for the focus skill: its checked answers, all time, on this instrument. -->
        <div class="mt-3 flex items-center gap-3">
          <Ring value={plan.advice.focus.accuracy} stroke={plan.advice.focus.accuracy >= 0.85 ? "var(--success)" : "var(--warn)"} class="size-12 shrink-0" />
          <p class="text-sm">
            <span class="tnum font-semibold">{m.music_hubs_today_focus_right({ pct: Math.round(plan.advice.focus.accuracy * 100) })}</span> {m.music_hubs_today_focus_on({ name: plan.advice.focus.name })}
            <span class="tnum text-ws-soft">{m.music_hubs_today_focus_answers({ count: plan.advice.focus.attempts })}</span>
          </p>
        </div>
      {:else if !plan.advice.measured && plan.checked < COACH_MIN_ATTEMPTS}
        <!-- Nothing measured yet: one line and the bar; the method waits behind the info button. -->
        <p class="mt-1 flex items-start gap-1 text-sm">
          <span class="flex-1">{m.music_hubs_today_coach_need({ count: COACH_MIN_ATTEMPTS })}</span>
          <button
            type="button"
            class="-my-2 grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
            aria-label={m.music_hubs_today_coach_info_label()}
            aria-expanded={coachInfo}
            aria-controls="coach-info"
            onclick={() => (coachInfo = !coachInfo)}><Info class="size-5" aria-hidden="true" /></button
          >
        </p>
        {#if coachInfo}<p id="coach-info" class="mt-1 rounded-xl bg-ws-raised px-3 py-2 text-sm">{m.music_hubs_today_coach_info({ summary: plan.advice.summary })}</p>{/if}
        <div class="mt-3 flex items-center gap-3">
          <!-- No answers yet, so no number: an empty ring that fills once the coach has measured something. -->
          <Ring class="size-11 shrink-0" />
          <div
            class="h-2 flex-1 rounded-full bg-ws-raised"
            role="progressbar"
            aria-label={m.music_hubs_today_coach_bar()}
            aria-valuemin={0}
            aria-valuemax={COACH_MIN_ATTEMPTS}
            aria-valuenow={toMeasure}
          >
            <div class="h-full rounded-full bg-instr" style:width="{(toMeasure / COACH_MIN_ATTEMPTS) * 100}%"></div>
          </div>
          <span class="tnum text-sm font-semibold">{m.music_hubs_n_of_total({ n: toMeasure, total: COACH_MIN_ATTEMPTS })}</span>
        </div>
        {#if practiceOnly}
          <p class="mt-2 text-sm text-ws-soft">{m.music_hubs_today_practice_only()}</p>
        {/if}
      {:else}
        <p class="mt-1 text-sm">{plan.advice.summary}</p>
      {/if}
      {#if plan.advice.measured && plan.advice.insights.length}
        <ul class="mt-3 flex flex-col gap-1 text-sm text-ws-soft">
          {#each plan.advice.insights as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}
      {#if !fresh0 && !(allDone && nextUp?.href === plan.advice.action.href)}
        <a class="{btn} mt-3" href={plan.advice.action.href}>{plan.advice.action.label}</a>
      {/if}
    </section>

    {#if !fresh0}
    <section class={panel} aria-labelledby="challenges-title">
      <h2 id="challenges-title" class="font-display text-lg font-semibold">{m.music_hubs_today_challenges()}</h2>
      <ul class="mt-3 flex flex-col gap-3">
        {#each challenges as c (c.id)}
          <li class="text-sm">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-medium"
                >{#if c.done}<Check class="mr-1 inline size-4 text-success" aria-hidden="true" /><span class="sr-only">{m.music_hubs_done_sr()}</span>{/if}{c.title}</span
              >
              <span class="tnum text-ws-soft">{m.music_hubs_n_of_total({ n: c.progress, total: c.target })}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-ws-raised" aria-hidden="true">
              <div class="h-full rounded-full {c.done ? 'bg-success' : 'bg-instr'}" style:width="{(c.progress / c.target) * 100}%"></div>
            </div>
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-[13px] text-ws-soft">{m.music_hubs_today_xp_level({ level: levelFor(practice.xpTotal), xp: practice.xpTotal })}</p>
    </section>
    {/if}
  </aside>
</div>

<style>
  /* Confetti rests in place; for people who have not asked for less motion it falls in once a day. */
  @media (prefers-reduced-motion: no-preference) {
    .fresh .bit {
      animation: fall 900ms ease-out var(--d) both;
    }
  }
  .bit {
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes fall {
    from {
      opacity: 0;
      translate: 0 -12px;
    }
  }
</style>
