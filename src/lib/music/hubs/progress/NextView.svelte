<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // What next: what to play in the next few minutes and why. It is a heuristic,
  // so it always links to the evidence (Skills, Sessions).
  import { BUDGET_OPTIONS, roleLabel } from "@repo/music-core/progress/routine";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { hueForRoute, hueVar } from "../../hues";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { blockReason, nextDrill, todayPlan } from "../../today.svelte";
  import DrillPreview from "../DrillPreview.svelte";
  import { practiceName } from "@repo/music-core/progress/coach";
  import { CAPABILITY_LABEL, fallingSentence, MIN_EVIDENCE, nextBuckets, pct, previewHref, relativeDay, skillRows, type SkillRow } from "./model";
  import Ring from "./Ring.svelte";
  import ProgressStrip from "./ProgressStrip.svelte";
  import Play from "@lucide/svelte/icons/play";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { btn, btnPrimary } from "../../components/ui";

  let { now = Date.now(), strip = true }: { now?: number; strip?: boolean } = $props();

  const plan = $derived(todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes));
  const instrument = $derived(plan.instrument);
  const budget = $derived(plan.routine.budgetMinutes);
  const rows = $derived(skillRows({ stats: practice.stats, mastery: practice.mastery, instrument, now }));
  const buckets = $derived(nextBuckets(rows));
  const upNext = $derived(plan.routine.steps.find((s) => !plan.done.includes(s.n)));
  const toMeasure = $derived(Math.min(plan.checked, MIN_EVIDENCE));
  let lengthOpen = $state(false);
  const anything = $derived(buckets.falling.length + buckets.holding.length + buckets.unmeasured.length > 0);

  const reasoning = $derived.by(() => {
    const parts = [plan.advice.summary];
    const { falling, holding, unmeasured } = buckets;
    if (falling.length) parts.push(fallingSentence(falling, plan.advice.focus?.skillId));
    else if (holding.length) parts.push(m.music_hubs_next_none_falling());
    if (unmeasured.length)
      parts.push(m.music_hubs_next_unmeasured({ count: unmeasured.length, min: MIN_EVIDENCE }));
    return parts.join(" ");
  });

  type Trend = "falling" | "holding" | "new";
  // The skill map: one tile per drill skill (twins of one drill share a tile), grouped by area,
  // lowest estimate first within each area.
  const map = $derived.by(() => {
    const tiles: { r: SkillRow; trend: Trend; name: string }[] = [];
    const seen = new Set<string>();
    const add = (list: SkillRow[], trend: Trend) => {
      for (const r of list) {
        const name = practiceName(r.skill.id);
        if (seen.has(name)) continue;
        seen.add(name);
        tiles.push({ r, trend, name });
      }
    };
    add(buckets.falling, "falling");
    add(buckets.holding, "holding");
    add(buckets.unmeasured.slice(0, 8), "new");
    const areas = new Map<keyof typeof CAPABILITY_LABEL, typeof tiles>();
    for (const t of tiles) areas.set(t.r.skill.capability, [...(areas.get(t.r.skill.capability) ?? []), t]);
    return [...areas];
  });
  const TONE: Record<Trend, string> = { falling: "var(--warn)", holding: "var(--success)", new: "var(--ws-soft)" };

  // After the set: one named drill, the same one Today offers.
  const after = $derived(upNext ? undefined : nextDrill(plan));
  const afterName = $derived(after?.name);
  // The coach's pick is drawn as the weak skill's own drill (its link may be the mixed ear drill);
  // a family of skills ("Intervals") is drawn as its weakest measured member.
  const focusDrawn = $derived.by(() => {
    const id = plan.advice.focus?.skillId;
    if (!id) return undefined;
    const kids = rows
      .filter((r) => r.skill.id.startsWith(`${id.replace(/s$/, "")}.`) && r.direct && r.estimate !== undefined)
      .sort((a, b) => a.estimate! - b.estimate!);
    return kids[0]?.skill.id ?? id;
  });
  const target = $derived(
    upNext?.href ?? (after && (after.href === plan.advice.action.href ? previewHref(focusDrawn, after.href) : after.href)),
  );

  // Pitch skills drawn on one octave of keys from C: each interval's top note, each degree's key,
  // filled by today's estimate once measured, dashed while it is not.
  const SEMI: Record<string, number> = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12, "1": 0, b2: 1, "2": 2, b3: 3, "3": 4, "4": 5, "#4": 6, "5": 7, b6: 8, "6": 9, b7: 10, "7": 11 };
  const pitchMaps = $derived(
    [
      { title: m.music_hubs_next_intervals_map(), prefix: "pitch.interval." },
      { title: m.music_hubs_next_degrees_map(), prefix: "pitch.scale-degree." },
    ]
      .map((pm) => ({
        ...pm,
        marks: rows
          .filter((r) => r.skill.id.startsWith(pm.prefix) && r.touched)
          .map((r) => {
            const token = r.skill.id.slice(pm.prefix.length);
            return { semi: SEMI[token], token, value: r.checked >= MIN_EVIDENCE ? r.estimate : undefined };
          })
          .filter((x) => x.semi !== undefined),
      }))
      .filter((pm) => pm.marks.length),
  );
  const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
  const keyX = (semi: number) => {
    const w = WHITE.indexOf(semi);
    return w >= 0 ? w * 25 + 12.5 : (WHITE.indexOf(semi - 1) + 1) * 25;
  };

  const drop = (r: SkillRow) => Math.round(((r.lastMeasured ?? 0) - (r.estimate ?? 0)) * 100);
</script>

<div class="flex flex-col gap-8 lg:gap-10">
  <!-- The streak and week: above the plan on a laptop, under the next block on a phone. -->
  {#if strip}<div class="max-lg:order-1"><ProgressStrip /></div>{/if}
  <section aria-labelledby="next-title" class="grid min-w-0 gap-x-10 gap-y-4 lg:grid-cols-2">
    <!-- One line, one button: the next undone block of today's set; the why waits behind a details. -->
    <div class="min-w-0 self-start rounded-3xl border border-ws-line bg-ws-surface p-4 sm:p-5" style:--step-hue={upNext ? hueVar(hueForRoute(upNext.href, instrument)) : "var(--instr)"}>
      <p class="text-ws-soft">{upNext || !after ? m.music_hubs_next_practise_on({ instrument: INSTRUMENT_LABEL[instrument] }) : m.music_hubs_next_done_more({ instrument: INSTRUMENT_LABEL[instrument] })}</p>
      <h2 id="next-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {#if upNext}{m.music_hubs_next_your_next({ minutes: upNext.minutes, label: upNext.label })}{:else if after}{m.music_hubs_next_next({ name: afterName ?? "" })}{:else}{m.music_hubs_next_set_done()}{/if}
      </h2>
      <p class="mt-1 text-sm text-ws-soft">
        {#if upNext}{blockReason(upNext)}{:else if after}{after.href === plan.advice.action.href
            ? plan.advice.focus
              ? m.music_hubs_next_lowest_detail({ pct: pct(plan.advice.focus.accuracy), count: plan.advice.focus.attempts })
              : m.music_hubs_next_lowest()
            : after.why}{:else}{plan.advice.summary}{/if}
      </p>
      {#if target}<DrillPreview href={target} size="md" {instrument} class="mt-3 max-w-xs" />{/if}
      <div class="mt-4 flex flex-wrap items-center gap-2">
        {#if upNext}
          <a class="{btnPrimary} min-h-12 px-6 text-base" href={upNext.href}><Play class="size-4" aria-hidden="true" />{m.music_hubs_next_start({ label: upNext.label })}</a>
        {:else if after}
          <a class="{btnPrimary} min-h-12 px-6 text-base" href={after.href}><Play class="size-4" aria-hidden="true" />{after.label}</a>
        {:else}
          <a class="{btnPrimary} min-h-12 px-6 text-base" href={plan.advice.action.href}>{plan.advice.action.label}</a>
        {/if}
        <button type="button" class={btn} aria-expanded={lengthOpen} aria-controls="next-length" onclick={() => (lengthOpen = !lengthOpen)}>
          {m.music_hubs_next_change_length()}<ChevronDown class="size-4 motion-safe:transition-transform {lengthOpen ? 'rotate-180' : ''}" aria-hidden="true" />
        </button>
      </div>
      {#if lengthOpen}
        <div id="next-length" class="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={m.music_hubs_next_time_available()}>
          {#each BUDGET_OPTIONS as min (min)}
            <button
              type="button"
              class="tnum min-h-11 min-w-12 rounded-full border px-3 text-sm {min === budget
                ? 'border-transparent bg-instr font-semibold text-ws-stage'
                : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
              aria-pressed={min === budget}
              onclick={() => settings.update({ routineBudgetMinutes: min })}>{m.music_hubs_minutes_short({ minutes: min })}</button
            >
          {/each}
        </div>
      {/if}

      <details class="group mt-3 border-t border-ws-line pt-2 text-sm">
        <summary class="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium text-instr-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown class="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" />{m.music_hubs_next_why()}
        </summary>
        <p class="max-w-prose">{reasoning}</p>
      {#if !plan.advice.measured && plan.checked < MIN_EVIDENCE}
        <!-- The coach's bar, drawn: answers in Check mode so far against the five it needs. -->
        <div class="mt-2 flex items-center gap-3 text-sm">
          <span class="shrink-0 font-medium">{m.music_hubs_next_coach()}</span>
          <div
            class="h-2 flex-1 rounded-full bg-ws-raised"
            role="progressbar"
            aria-label={m.music_hubs_today_coach_bar()}
            aria-valuemin={0}
            aria-valuemax={MIN_EVIDENCE}
            aria-valuenow={toMeasure}
          >
            <div class="h-full rounded-full bg-instr" style:width="{(toMeasure / MIN_EVIDENCE) * 100}%"></div>
          </div>
          <span class="tnum shrink-0 text-ws-soft">{m.music_hubs_drills_checked_of({ n: toMeasure, total: MIN_EVIDENCE })}</span>
        </div>
      {:else}
        <p class="mt-2 text-sm"><span class="font-medium">{plan.advice.headline}.</span> {plan.advice.summary}</p>
      {/if}

        <p class="mt-2 text-ws-soft">
          {@html m.music_hubs_next_evidence({
            skills: `<a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/progress?view=skills">${m.music_hubs_next_every_skill()}</a>`,
            sessions: `<a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/progress?view=sessions">${m.music_hubs_next_your_sessions()}</a>`,
          })}
        </p>
      </details>
    </div>

    <div class="min-w-0 self-start">
      <h3 class="font-display text-lg font-semibold">{m.music_hubs_today_title_plan({ minutes: budget })}</h3>
      <ol aria-label={m.music_hubs_today_set_label()} class="mt-2 flex min-w-0 flex-col divide-y divide-ws-line border-y border-ws-line">
        {#each plan.routine.steps as step (step.n)}
          {@const done = plan.done.includes(step.n)}
          {@const isNext = upNext?.n === step.n}
          <li class="flex min-w-0 items-center gap-3 py-2.5" style:--step-hue={hueVar(hueForRoute(step.href, instrument))}>
            <span
              class="grid size-8 shrink-0 place-items-center rounded-full {done ? 'bg-success text-white' : 'bg-[color:var(--step-hue)] text-ws-stage'}"
              aria-hidden="true">{#if done}<Check class="size-4" />{:else}<span class="tnum text-[13px] font-semibold">{step.n}</span>{/if}</span
            >
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-x-2 font-semibold">
                <a href={step.href} class="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                  ><span class="sr-only">{done ? m.music_hubs_today_step_done_sr({ n: step.n }) : m.music_hubs_today_step_sr({ n: step.n })}</span><span class="mr-1 font-normal text-ws-soft">{m.music_hubs_next_role({ role: roleLabel(step) })}</span>{step.label}</a
                >
                {#if done}<span class="text-[13px] font-medium text-success">{m.music_hubs_done()}</span>{:else if isNext}<span class="rounded-full bg-instr-wash px-2 text-[13px] text-instr-ink">{m.music_hubs_now()}</span>{/if}
              </p>
              <p class="text-sm text-ws-soft">
                <span class="tnum">{m.music_hubs_minutes_period({ minutes: step.minutes })}</span>
                {blockReason(step)}
              </p>
            </div>
            <DrillPreview href={step.href} {instrument} class="max-sm:hidden" />
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <section aria-labelledby="picks-title" class="min-w-0 max-lg:order-2">
    <h2 id="picks-title" class="font-display text-xl font-semibold">{m.music_hubs_next_where()}</h2>
    {#if anything}
      <p class="text-sm text-ws-soft">{m.music_hubs_next_where_intro({ instrument: INSTRUMENT_LABEL[instrument] })}</p>
      <details class="group mt-1 text-sm">
        <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-instr-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown class="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" />{m.music_hubs_sessions_how_scores()}
        </summary>
        <p class="max-w-prose text-ws-soft">{m.music_hubs_next_how_body({ count: MIN_EVIDENCE })}</p>
      <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ws-soft" aria-label={m.music_hubs_next_key()}>
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-warn" aria-hidden="true"></span>{m.music_hubs_next_key_falling()}</li>
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-success" aria-hidden="true"></span>{m.music_hubs_next_key_holding()}</li>
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full border border-dashed border-ws-soft" aria-hidden="true"></span>{m.music_hubs_next_key_new({ count: MIN_EVIDENCE })}</li>
      </ul>
      </details>
      <div class="mt-4 flex flex-col gap-5">
        {#each map as [area, tiles] (area)}
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-ws-soft">{CAPABILITY_LABEL[area]}</h3>
            {#if area === "pitch" && pitchMaps.length}
              <div class="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                {#each pitchMaps as pm (pm.prefix)}
                  <figure class="min-w-0">
                    <svg viewBox="0 0 200 78" class="h-[7.5rem] w-auto" role="img" aria-label={m.music_hubs_pair({ a: pm.title, b: pm.marks.map((mk) => `${mk.token} ${mk.value === undefined ? m.music_hubs_next_not_measured() : pct(mk.value)}`).join(", ") })}>
                      {#each WHITE as w, i (w)}<rect x={i * 25 + 0.5} y="2" width="24" height="74" rx="2" class="pk-white" />{/each}
                      {#each [1, 3, 6, 8, 10] as b (b)}<rect x={keyX(b) - 7.5} y="2" width="15" height="44" rx="1.5" class="pk-black" />{/each}
                      {#each pm.marks as mk (mk.token)}
                        {@const black = !WHITE.includes(mk.semi)}
                        <circle cx={keyX(mk.semi)} cy={black ? 34 : 62} r="9.5" class={mk.value === undefined ? "pk-new" : "pk-hit"} style:fill-opacity={mk.value === undefined ? undefined : 0.25 + 0.75 * mk.value} />
                        <text x={keyX(mk.semi)} y={(black ? 34 : 62) + 3} text-anchor="middle" class="pk-label">{mk.token}</text>
                      {/each}
                    </svg>
                    <figcaption class="mt-1 text-[13px] text-ws-soft">{m.music_hubs_next_pitch_caption({ title: pm.title })}</figcaption>
                  </figure>
                {/each}
              </div>
            {/if}
            <ul class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {#each tiles as { r, trend, name } (r.skill.id)}
                <li class="min-w-0">
                  <a
                    href={r.href}
                    class="flex min-h-11 items-center gap-3 rounded-2xl border border-ws-line bg-ws-surface p-2.5 hover:bg-ws-raised"
                  >
                    <Ring value={trend === "new" ? undefined : r.estimate} stroke={TONE[trend]} class="size-12">
                      <span class="tnum text-[13px] font-semibold" aria-hidden="true">{trend === "new" ? `${r.checked}/${MIN_EVIDENCE}` : pct(r.estimate ?? 0)}</span>
                    </Ring>
                    <span class="flex min-w-0 flex-col">
                      <span class="font-medium">{name}</span>
                      <span class="tnum text-sm text-ws-soft">
                        {#if trend === "falling"}
                          <span class="sr-only">{m.music_hubs_next_falling_sr()}</span>{m.music_hubs_next_falling_line({ pct: pct(r.estimate ?? 0), drop: drop(r), when: relativeDay(r.lastPracticed ?? now, now) })}
                        {:else if trend === "holding"}
                          <span class="sr-only">{m.music_hubs_next_holding_sr()}</span>{m.music_hubs_next_holding_line({ pct: pct(r.estimate ?? 0), count: r.checked })}
                        {:else}
                          <span class="sr-only">{m.music_hubs_next_new_sr()}</span>{r.checked
                            ? m.music_hubs_next_new_checked({ count: r.checked })
                            : m.music_hubs_next_new_practice({ count: r.attempts })}
                        {/if}
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {:else}
      <p class="mt-2">
        {m.music_hubs_next_nothing({ instrument: INSTRUMENT_LABEL[instrument] })}
      </p>
    {/if}
  </section>
</div>

<style>
  .pk-white {
    fill: var(--ws-stage-ink);
    stroke: color-mix(in oklch, var(--ws-stage) 35%, transparent);
    stroke-width: 0.8;
  }
  .pk-black {
    fill: var(--ws-stage);
  }
  .pk-hit {
    fill: var(--instr);
  }
  .pk-new {
    fill: var(--ws-stage-ink);
    stroke: var(--ws-soft);
    stroke-width: 1.2;
    stroke-dasharray: 2 2;
  }
  .pk-label {
    font: 700 8.5px var(--font-sans, sans-serif); /* 13 px at the drawn height */
    fill: var(--ws-stage);
  }
</style>
