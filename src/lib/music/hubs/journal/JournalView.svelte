<script lang="ts">
  // The journal: weekly rollups, the 12-week heatmap, goals, focus areas, a
  // composer for today's session, filters and the session list.
  import type { Instrument } from "@repo/music-core";
  import { INSTRUMENTS } from "@repo/music-core";
  import { skillName } from "@repo/music-core/progress/graph";
  import { dayKey } from "@repo/music-core/progress/rewards";
  import { filterSessions, focusAreas, heatmap, weekRollups, weeklyGoals } from "@repo/music-core/progress/journal";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { btn, btnPrimary } from "../../components/ui";
  import { parseTags, plural, signed } from "../progress/model";
  import Heatmap from "./Heatmap.svelte";
  import SessionEntry from "./SessionEntry.svelte";

  let { announce = () => {}, now = Date.now() }: { announce?: (msg: string) => void; now?: number } = $props();

  const today = $derived(dayKey(now));
  const sessions = $derived(practice.sessions);
  const weeks = $derived(weekRollups(sessions, today));
  const cells = $derived(heatmap(sessions, today, 12));
  const goals = $derived(weeklyGoals(sessions, today, settings.value.weeklySessionGoal));
  const focus = $derived(focusAreas(sessions));
  const latestToday = $derived(
    sessions.filter((s) => dayKey(s.startTime) === today).sort((a, b) => b.startTime - a.startTime)[0],
  );

  // Filters
  let skill = $state("");
  let instrument = $state<Instrument | "">("");
  let from = $state("");
  let to = $state("");
  const filtering = $derived(!!(skill || instrument || from || to));
  const skillOptions = $derived(
    [...new Set(sessions.flatMap((s) => s.runs.flatMap((r) => r.skillIds)))]
      .map((id) => ({ id, name: skillName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const shown = $derived(
    filterSessions(sessions, {
      skillId: skill || undefined,
      instrument: instrument || undefined,
      from: from || undefined,
      to: to || undefined,
    }).sort((a, b) => b.startTime - a.startTime),
  );
  function clearFilters() {
    skill = "";
    instrument = "";
    from = "";
    to = "";
    announce("Filters cleared.");
  }

  // Composer for today's latest session
  let draftNote = $state("");
  let draftTags = $state("");
  async function addToToday(e: SubmitEvent) {
    e.preventDefault();
    const s = latestToday;
    if (!s) return;
    const note = draftNote.trim();
    await practice.editSession(s.id, {
      note: note ? (s.note ? `${s.note}\n${note}` : note) : s.note,
      tags: [...new Set([...s.tags, ...parseTags(draftTags)])],
    });
    draftNote = "";
    draftTags = "";
    announce("Added to today's session.");
  }

  const ROWS = [
    { key: "xp", label: "XP" },
    { key: "sessions", label: "Sessions" },
    { key: "attempts", label: "Attempts" },
    { key: "minutes", label: "Minutes" },
  ] as const;
  const field = "min-h-11 w-full min-w-0 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
</script>

{#if sessions.length === 0}
  <div class="rounded-2xl border border-dashed border-ws-line p-6">
    <p class="font-semibold">Your journal is empty.</p>
    <p class="text-sm text-ws-soft">Every drill you finish is saved here with its score, its attempts and room for a note.</p>
    <a class="mt-3 inline-flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage" href="/music"
      >Start today's set</a
    >
  </div>
{:else}
  <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="composer-title" id="journal-composer" class="min-w-0 rounded-2xl bg-instr-wash p-4 sm:p-5 lg:col-start-1">
        <h2 id="composer-title" class="font-display text-xl font-semibold">Note on today</h2>
        {#if latestToday}
          <form class="mt-3 flex flex-col gap-3" onsubmit={addToToday}>
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-medium">What went well, what to fix</span>
              <textarea class="min-h-20 rounded-lg border border-ws-line bg-ws-surface p-2" bind:value={draftNote}></textarea>
            </label>
            <div class="flex flex-wrap items-end gap-3">
              <label class="flex min-w-0 flex-1 basis-48 flex-col gap-1 text-sm">
                <span class="font-medium">Tags, separated by commas</span>
                <input class={field} bind:value={draftTags} placeholder="scales, left hand" />
              </label>
              <button
                type="submit"
                class={btnPrimary}
                disabled={!draftNote.trim() && !draftTags.trim()}>Add to today's session</button
              >
            </div>
          </form>
        {:else}
          <p class="mt-1 text-sm">Nothing saved today yet. Notes attach to today's latest session once you practise.</p>
          <a class="mt-3 inline-flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage" href="/music"
            >Start today's set</a
          >
        {/if}
      </section>

    <aside class="flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
      <section aria-labelledby="rollup-title">
        <h2 id="rollup-title" class="font-display text-xl font-semibold">This week and last</h2>
        <table class="mt-2 w-full text-sm">
          <thead class="text-left text-ws-soft">
            <tr>
              <th scope="col" class="py-1.5 font-medium"><span class="sr-only">Measure</span></th>
              <th scope="col" class="py-1.5 text-right font-medium">This week</th>
              <th scope="col" class="py-1.5 text-right font-medium">Last week</th>
              <th scope="col" class="py-1.5 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-ws-line border-t border-ws-line">
            {#each ROWS as row (row.key)}
              <tr>
                <th scope="row" class="py-2 text-left font-medium">{row.label}</th>
                <td class="tnum py-2 text-right">{weeks.thisWeek[row.key]}</td>
                <td class="tnum py-2 text-right text-ws-soft">{weeks.lastWeek[row.key]}</td>
                <td class="tnum py-2 text-right">{signed(weeks.delta[row.key])}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="heat-title">
        <h2 id="heat-title" class="font-display text-xl font-semibold">Last 12 weeks</h2>
        <div class="mt-3"><Heatmap {cells} /></div>
      </section>

      <section aria-labelledby="goals-title">
        <h2 id="goals-title" class="font-display text-xl font-semibold">Weekly goals</h2>
        <div class="mt-3 flex items-end justify-between gap-3">
          <p class="text-sm">
            <span class="tnum font-display text-2xl font-semibold">{goals.sessions.done}</span>
            of <span class="tnum">{goals.sessions.target}</span> sessions this week{#if goals.sessions.met}<span class="text-success">, goal met</span>{/if}
          </p>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Target</span>
            <input
              type="number"
              min="1"
              max="21"
              class="tnum min-h-11 w-20 rounded-lg border border-ws-line bg-ws-surface px-3"
              value={settings.value.weeklySessionGoal}
              onchange={(e) => {
                const n = Math.round(Number(e.currentTarget.value));
                if (n >= 1 && n <= 21) {
                  settings.update({ weeklySessionGoal: n });
                  announce(`Weekly goal set to ${plural(n, "session")}.`);
                } else e.currentTarget.value = String(settings.value.weeklySessionGoal);
              }}
            />
          </label>
        </div>
        <div class="mt-2 h-2 rounded-full bg-ws-raised" aria-hidden="true">
          <div
            class="h-full rounded-full {goals.sessions.met ? 'bg-success' : 'bg-instr'}"
            style:width="{Math.min(1, goals.sessions.done / goals.sessions.target) * 100}%"
          ></div>
        </div>
        <p class="mt-3 text-sm">
          <span class="tnum">{goals.xp.thisWeek}</span> XP this week against <span class="tnum">{goals.xp.lastWeek}</span> last week,
          {goals.xp.thisWeek === goals.xp.lastWeek
            ? "level with it."
            : goals.xp.ahead
              ? `ahead by ${goals.xp.thisWeek - goals.xp.lastWeek}.`
              : `${goals.xp.lastWeek - goals.xp.thisWeek} to go to match it.`}
        </p>
      </section>

      <section aria-labelledby="focus-title">
        <h2 id="focus-title" class="font-display text-xl font-semibold">Focus areas</h2>
        {#if focus.length}
          <p class="text-sm text-ws-soft">From the tags on your sessions.</p>
          <ul class="mt-2 flex flex-col gap-1.5">
            {#each focus as f (f.tag)}
              <li class="flex items-center gap-3 text-sm">
                <span class="min-w-0 flex-1 truncate font-medium">{f.tag}</span>
                <span class="tnum text-ws-soft">{plural(f.count, "session")}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-1 text-sm">Tag a session and the tags you use most show up here.</p>
          <a class="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-instr-ink underline underline-offset-4" href="#journal-composer"
            >Tag today's session</a
          >
        {/if}
      </section>
    </aside>
      <section aria-labelledby="sessions-title" class="min-w-0 lg:col-start-1">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sessions-title" class="font-display text-xl font-semibold">Sessions</h2>
          <p class="tnum text-sm text-ws-soft">
            {filtering ? `${shown.length} of ${plural(sessions.length, "session")}` : plural(sessions.length, "session")}, newest first
          </p>
        </div>
        <form class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filter sessions" onsubmit={(e) => e.preventDefault()}>
          <label class="flex min-w-0 flex-col gap-1 text-sm">
            <span class="font-medium">Skill</span>
            <select class={field} bind:value={skill}>
              <option value="">Any skill</option>
              {#each skillOptions as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            </select>
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm">
            <span class="font-medium">Instrument</span>
            <select class={field} bind:value={instrument}>
              <option value="">Any instrument</option>
              {#each INSTRUMENTS as i (i)}<option value={i}>{INSTRUMENT_LABEL[i]}</option>{/each}
            </select>
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm">
            <span class="font-medium">From</span>
            <input type="date" class={field} bind:value={from} max={to || undefined} />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm">
            <span class="font-medium">To</span>
            <input type="date" class={field} bind:value={to} min={from || undefined} />
          </label>
        </form>
        {#if filtering && shown.length}
          <button type="button" class="{btn} mt-3" onclick={clearFilters}>Clear filters</button>
        {/if}

        {#if shown.length}
          <ul class="mt-2 divide-y divide-ws-line border-y border-ws-line">
            {#each shown as s (s.id)}
              <li><SessionEntry session={s} {announce} /></li>
            {/each}
          </ul>
        {:else}
          <div class="mt-4 rounded-2xl border border-dashed border-ws-line p-5">
            <p class="font-medium">No sessions match these filters.</p>
            <button type="button" class="{btn} mt-3" onclick={clearFilters}>Clear filters</button>
          </div>
        {/if}
      </section>

  </div>
{/if}
