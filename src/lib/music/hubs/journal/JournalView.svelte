<script lang="ts">
  // The journal: the session list first, then this week against last, the 12-week heatmap,
  // goals and focus areas. A note on today's session waits behind its button; filters show
  // once there are enough sessions to need them.
  import NotebookPen from "lucide-svelte/icons/notebook-pen";
  import Ear from "lucide-svelte/icons/ear";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import X from "lucide-svelte/icons/x";
  import { tick } from "svelte";
  import type { Instrument } from "@repo/music-core";
  import { skillName } from "@repo/music-core/progress/graph";
  import { addDays, dayKey, weekStart } from "@repo/music-core/progress/rewards";
  import { filterSessions, focusAreas, heatmap, weekRollups, weeklyGoals } from "@repo/music-core/progress/journal";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { btn, btnPrimary } from "../../components/ui";
  import { parseTags, plural } from "../progress/model";
  import WeekCompare from "../progress/WeekCompare.svelte";
  import Heatmap from "./Heatmap.svelte";
  import SessionEntry from "./SessionEntry.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import { instrumentOptions } from "$lib/music/components/instrument-icons";

  let { announce = () => {}, now = Date.now() }: { announce?: (msg: string) => void; now?: number } = $props();

  /** Below this many sessions the list is short enough to read, so the filters stay out of the way. */
  const FILTER_FROM = 6;

  const today = $derived(dayKey(now));
  const sessions = $derived(practice.sessions);
  const weeks = $derived(weekRollups(sessions, today));
  // The heatmap covers the weeks since the first session (four at least, twelve at most), so a new
  // journal is not a grid of empty cells.
  const heatWeeks = $derived.by(() => {
    const first = Math.min(...sessions.map((s) => s.startTime));
    if (!Number.isFinite(first)) return 4;
    const weeks = Math.ceil((Date.parse(weekStart(today)) - Date.parse(weekStart(dayKey(first)))) / (7 * 86_400_000)) + 1;
    return Math.min(12, Math.max(4, weeks));
  });
  const cells = $derived(heatmap(sessions, today, heatWeeks));
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
  let moreFilters = $state(false);
  const filtering = $derived(!!(skill || instrument || from || to));
  const showFilters = $derived(sessions.length >= FILTER_FROM);
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
  // Date presets; anything else is a custom range (or a day picked on the heatmap).
  const RANGES = $derived([
    { id: "all", label: "All", from: "", to: "" },
    { id: "week", label: "This week", from: weekStart(today), to: "" },
    { id: "month", label: "This month", from: `${today.slice(0, 8)}01`, to: "" },
    { id: "30", label: "Last 30 days", from: addDays(today, -29), to: "" },
  ]);
  const range = $derived(RANGES.find((r) => r.from === from && r.to === to)?.id ?? "custom");
  function pickRange(r: (typeof RANGES)[number]) {
    from = r.from;
    to = r.to;
    announce(r.id === "all" ? "Showing every session." : `Showing ${r.label.toLowerCase()}.`);
  }
  const longDay = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  // Tapping a practised day on the heatmap shows just that day; tapping it again shows all.
  const pickedDay = $derived(from && from === to ? from : undefined);
  function pickDay(day: string) {
    if (pickedDay === day) {
      from = to = "";
      announce("Showing every day.");
    } else {
      from = to = day;
      announce(`Showing ${longDay(day)}.`);
    }
    document.getElementById("sessions-title")?.scrollIntoView({ block: "nearest" });
  }
  function clearFilters() {
    skill = "";
    instrument = "";
    from = "";
    to = "";
    announce("Filters cleared.");
  }

  // A note for today's latest session, written from the top of the list.
  let composing = $state(false);
  let draftNote = $state("");
  let draftTags = $state("");
  let noteBox = $state<HTMLTextAreaElement>();
  async function openComposer() {
    composing = true;
    await tick();
    noteBox?.focus();
  }
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
    composing = false;
    announce("Added to today's session.");
  }

  // The sample card's date in the live cards' own format.
  const sampleWhen = $derived(
    new Date(now).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
  );

  const field = "min-h-11 w-full min-w-0 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
  const chip = (on: boolean) =>
    `min-h-11 rounded-full border px-4 text-sm ${on ? "border-transparent bg-ws-ink font-semibold text-ws-bg" : "border-ws-line bg-ws-surface hover:bg-ws-raised"}`;
</script>

{#if sessions.length === 0}
  <!-- Empty: what a saved session will look like, and the one way to make one. -->
  <section aria-labelledby="journal-empty" class="grid items-center gap-6 rounded-3xl border border-ws-line bg-ws-surface p-5 sm:p-8 lg:grid-cols-2">
    <div class="flex flex-col items-start gap-3">
      <h2 id="journal-empty" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your journal is empty</h2>
      <p class="max-w-prose text-ws-soft">Finish any drill and it lands here: the score, every answer, the time it took, and room for a note.</p>
      <a class="{btnPrimary} min-h-12 px-6 text-base" href="/music">Start today's set</a>
    </div>
    <!-- A sample, drawn as a real card would be but faded and marked, so it never reads as an entry. -->
    <figure class="relative min-w-0">
      <span class="absolute -top-3 right-4 z-10 rounded-full border border-ws-line bg-ws-bg px-3 py-0.5 text-sm font-semibold">Sample</span>
      <div class="rounded-2xl border border-dashed border-ws-line bg-ws-surface p-4 opacity-60" aria-hidden="true">
        <div class="flex items-start gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--hue-ear)] text-ws-stage"><Ear class="size-5" /></span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold">Scale degrees</p>
            <p class="text-sm text-ws-soft">{sampleWhen}. Drill on {INSTRUMENT_LABEL[settings.value.activeInstrument]}</p>
          </div>
          <p class="tnum font-display text-2xl font-semibold leading-none">80%</p>
        </div>
        <p class="mt-3 max-w-prose border-l-2 border-[color:var(--hue-ear)] pl-3">Degree 6 still slips. Sing it before answering.</p>
        <div class="mt-3 flex flex-wrap gap-1">
          {#each [1, 1, 1, 0, 1, 1, 1, 1, 0, 1] as ok, i (i)}
            <span class="grid size-8 place-items-center rounded-full text-sm font-bold {ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}">{ok ? "✓" : "✗"}</span>
          {/each}
        </div>
        <p class="tnum mt-2 flex gap-5 text-sm"><span><span class="text-ws-soft">Answers</span> <b>10</b></span><span><span class="text-ws-soft">Time</span> <b>6 min</b></span></p>
      </div>
      <figcaption class="mt-2 text-sm text-ws-soft">What a saved session looks like.</figcaption>
    </figure>
  </section>
{:else}
  <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section aria-labelledby="sessions-title" class="min-w-0">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="sessions-title" class="font-display text-xl font-semibold">Sessions</h2>
          <p class="tnum text-sm text-ws-soft">
            {filtering ? `${shown.length} of ${plural(sessions.length, "session")}` : plural(sessions.length, "session")}, newest first
          </p>
        </div>
        {#if latestToday && !composing}
          <button type="button" class={btn} onclick={openComposer}><NotebookPen class="size-4" aria-hidden="true" />Note on today's session</button>
        {/if}
      </div>

      {#if composing && latestToday}
        <form id="journal-composer" class="mt-3 flex flex-col gap-3 rounded-2xl bg-instr-wash p-4" aria-label="Note on today's session" onsubmit={addToToday}>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">What went well, what to fix</span>
            <textarea class="min-h-20 rounded-lg border border-ws-line bg-ws-surface p-2" bind:this={noteBox} bind:value={draftNote}></textarea>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Tags, separated by commas</span>
            <input class={field} bind:value={draftTags} placeholder="scales, left hand" />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <button type="submit" class={btnPrimary} disabled={!draftNote.trim() && !draftTags.trim()}>Add to today's session</button>
            <button type="button" class={btn} onclick={() => (composing = false)}>Cancel</button>
          </div>
        </form>
      {/if}

      {#if showFilters}
        <div class="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="When">
          {#each RANGES as r (r.id)}
            <button type="button" class={chip(range === r.id)} aria-pressed={range === r.id} onclick={() => pickRange(r)}>{r.label}</button>
          {/each}
          <button type="button" class="{btn} border-dashed" aria-expanded={moreFilters} aria-controls="journal-filters" onclick={() => (moreFilters = !moreFilters)}>
            More filters<ChevronDown class="size-4 motion-safe:transition-transform {moreFilters ? 'rotate-180' : ''}" aria-hidden="true" />
          </button>
        </div>
        {#if moreFilters}
          <form id="journal-filters" class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filter sessions" onsubmit={(e) => e.preventDefault()}>
            <div class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="font-medium">Skill</span>
              <Picker label="Skill" value={skill} options={[{ value: "", label: "Any skill" }, ...skillOptions.map((o) => ({ value: o.id, label: o.name }))]} onchange={(v) => (skill = v)} />
            </div>
            <div class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="font-medium">Instrument</span>
              <Picker label="Instrument" value={instrument} options={[{ value: "", label: "Any instrument" }, ...instrumentOptions((i) => INSTRUMENT_LABEL[i])]} onchange={(v) => (instrument = v as typeof instrument)} />
            </div>
            <label class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="font-medium">From</span>
              <input type="date" class={field} bind:value={from} max={to || undefined} />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="font-medium">To</span>
              <input type="date" class={field} bind:value={to} min={from || undefined} />
            </label>
          </form>
        {/if}
      {/if}
      {#if pickedDay}
        <p class="mt-3 flex flex-wrap items-center gap-2 text-sm">
          Showing {longDay(pickedDay)}.
          <button type="button" class={btn} onclick={() => pickDay(pickedDay)}><X class="size-4" aria-hidden="true" />Show every day</button>
        </p>
      {:else if filtering && shown.length}
        <button type="button" class="{btn} mt-3" onclick={clearFilters}>Clear filters</button>
      {/if}

      {#if shown.length}
        <ul class="mt-3 flex flex-col gap-3">
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

    <aside class="flex min-w-0 flex-col gap-8">
      <section aria-labelledby="rollup-title">
        <h2 id="rollup-title" class="font-display text-xl font-semibold">This week and last</h2>
        <WeekCompare {weeks} />
      </section>

      <section aria-labelledby="heat-title">
        <h2 id="heat-title" class="font-display text-xl font-semibold">Last {heatWeeks} weeks</h2>
        <p class="text-sm text-ws-soft">Tap a practised day to see its sessions.</p>
        <div class="mt-3"><Heatmap {cells} selected={pickedDay} onpick={pickDay} /></div>
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
          {#if latestToday}
            <button type="button" class="{btn} mt-2" onclick={openComposer}>Tag today's session</button>
          {/if}
        {/if}
      </section>
    </aside>
  </div>
{/if}
