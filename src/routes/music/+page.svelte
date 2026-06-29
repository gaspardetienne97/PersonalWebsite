<script lang="ts">
  import FlaskConical from "lucide-svelte/icons/flask-conical";

  import { Button } from "@repo/ui/button";
  import { Empty } from "@repo/ui/empty";

  import MusicToolCard from "./_components/MusicToolCard.svelte";
  import PracticeScreen from "./_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "./_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "./_components/SegmentedControl.svelte";
  import TodayPlan from "./_components/TodayPlan.svelte";
  import { DRILLS, DRILL_SKILLS, PATHS } from "./_components/musicCatalog";

  // String-typed so they bind to SegmentedControl's `value: string`.
  let tab = $state("today");
  let skillFilter = $state("All");
  let tagFilter = $state("All");

  const tabOptions = [
    { value: "today", label: "Today" },
    { value: "drills", label: "Drills" },
    { value: "paths", label: "Paths" },
  ];

  const skillOptions = [
    { value: "All", label: "All" },
    ...DRILL_SKILLS.map((skill) => ({ value: skill, label: skill })),
  ];

  // Style/genre tags present across the catalog → filter chips. "All" = no tag filter.
  const tagOptions = [
    { value: "All", label: "All styles" },
    ...[...new Set(DRILLS.flatMap((drill) => drill.tags ?? []))].map((t) => ({
      value: t,
      label: t[0].toUpperCase() + t.slice(1),
    })),
  ];

  const filteredDrills = $derived(
    DRILLS.filter(
      (drill) =>
        (skillFilter === "All" || drill.skill === skillFilter) &&
        (tagFilter === "All" || (drill.tags ?? []).includes(tagFilter)),
    ),
  );
</script>

<svelte:head>
  <title>Practice | Musicianship OS</title>
  <meta
    name="description"
    content="Your practice home — today's plan, every drill, and guided paths in one place."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Practice"
    subtitle="Your practice home — start today's plan, pick a drill, or follow a guided path."
  />

  <div class="mb-6">
    <SegmentedControl options={tabOptions} bind:value={tab} ariaLabel="Practice view" />
  </div>

  {#if tab === "today"}
    <div class="reveal-up"><TodayPlan /></div>
  {:else if tab === "drills"}
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <SegmentedControl
        options={skillOptions}
        bind:value={skillFilter}
        size="sm"
        ariaLabel="Filter drills by skill"
      />
      {#if tagOptions.length > 1}
        <SegmentedControl
          options={tagOptions}
          bind:value={tagFilter}
          size="sm"
          ariaLabel="Filter drills by style"
        />
      {/if}
    </div>
    {#if filteredDrills.length === 0}
      <Empty
        title="No drills match"
        description="No drills fit that skill and style combination yet. Try a different filter."
      >
        {#snippet icon()}<FlaskConical aria-hidden="true" />{/snippet}
        <Button variant="outline" onclick={() => ((skillFilter = "All"), (tagFilter = "All"))}>
          Clear filters
        </Button>
      </Empty>
    {:else}
      <section
        class="reveal-up grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Practice drills"
      >
        {#each filteredDrills as drill (drill.href)}
          <MusicToolCard
            href={drill.href}
            title={drill.title}
            description={drill.description}
            eyebrow={drill.skill}
            meta={drill.meta}
            action={drill.action}
            icon={drill.icon}
          />
        {/each}
      </section>
    {/if}
  {:else}
    <section class="reveal-up grid gap-4 md:grid-cols-2" aria-label="Guided paths">
      {#each PATHS as path (path.href)}
        <MusicToolCard
          href={path.href}
          title={path.title}
          description={path.description}
          eyebrow="Path"
          meta={path.meta}
          action={path.action}
          icon={path.icon}
        />
      {/each}
    </section>
  {/if}
</PracticeScreen>
