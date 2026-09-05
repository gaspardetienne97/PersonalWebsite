<script lang="ts">
  import SegmentedControl from "./SegmentedControl.svelte";

  // Days practised, as a real month or as a 12-week heatmap (the user's
  // toggle). Filled cells use the success token; today carries a ring; the
  // summary sentence carries the count for assistive tech.
  let {
    practised,
    today = new Date(),
    class: cls = "",
  }: {
    /** ISO day strings (YYYY-MM-DD) with at least one session. */
    practised: ReadonlySet<string>;
    today?: Date;
    class?: string;
  } = $props();

  let view = $state<"month" | "weeks">("month");

  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const todayIso = $derived(iso(today));
  const monthName = $derived(today.toLocaleDateString("en", { month: "long", year: "numeric" }));

  // Month grid, Monday first; leading blanks so the 1st lands on its weekday.
  const monthCells = $derived.by(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => undefined),
      ...Array.from({ length: count }, (_, i) => new Date(today.getFullYear(), today.getMonth(), i + 1)),
    ];
  });
  // 84 days ending today, column per week, row per weekday (Monday first).
  const weekCells = $derived.by(() => {
    const end = new Date(today);
    const endWeekday = (end.getDay() + 6) % 7;
    const start = new Date(end);
    start.setDate(end.getDate() - endWeekday - 7 * 11);
    return Array.from({ length: 84 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date > end ? undefined : date;
    });
  });
  const cells = $derived(view === "month" ? monthCells : weekCells);
  const practisedInView = $derived(
    cells.filter((date) => date && practised.has(iso(date))).length,
  );
  const shown = $derived(cells.filter((date) => date && date <= today).length);
</script>

<div class="grid gap-3 {cls}" data-testid="streak-calendar">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-muted-foreground" aria-live="off">
      Practised {practisedInView} of {shown} days · {view === "month" ? monthName : "last 12 weeks"}
    </p>
    <SegmentedControl
      size="sm"
      ariaLabel="Calendar view"
      options={[
        { value: "month", label: "Month" },
        { value: "weeks", label: "12 weeks" },
      ]}
      value={view}
      onChange={(value) => (view = value as "month" | "weeks")}
    />
  </div>
  <div
    role="img"
    aria-label={`Practised ${practisedInView} of ${shown} days`}
    class="grid gap-1 {view === 'month' ? 'grid-cols-7' : 'grid-flow-col grid-rows-7 grid-cols-12'}"
  >
    {#if view === "month"}
      {#each ["M", "T", "W", "T", "F", "S", "S"] as label, i (i)}
        <span class="text-center text-[10px] font-semibold text-muted-foreground">{label}</span>
      {/each}
    {/if}
    {#each cells as date, i (i)}
      {@const day = date ? iso(date) : undefined}
      {@const done = day !== undefined && practised.has(day)}
      <span
        data-day={day}
        data-practised={done ? "true" : undefined}
        class={[
          "grid aspect-square place-items-center rounded-md font-mono text-[10px]",
          view === "weeks" && "text-transparent",
          !date && "invisible",
          done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
          day === todayIso && "ring-2 ring-practice-accent ring-inset",
        ]}
      >
        {view === "month" && date ? date.getDate() : ""}
      </span>
    {/each}
  </div>
</div>
