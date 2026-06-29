<script lang="ts">
  import MusicToolCard from "./_components/MusicToolCard.svelte";
  import PracticeScreen from "./_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "./_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "./_components/SegmentedControl.svelte";
  import TodayPlan from "./_components/TodayPlan.svelte";
  import { DRILLS, DRILL_SKILLS, PATHS } from "./_components/musicCatalog";

  // String-typed so they bind to SegmentedControl's `value: string`.
  let tab = $state("today");
  let skillFilter = $state("All");

  const tabOptions = [
    { value: "today", label: "Today" },
    { value: "drills", label: "Drills" },
    { value: "paths", label: "Paths" },
  ];

  const skillOptions = [
    { value: "All", label: "All" },
    ...DRILL_SKILLS.map((skill) => ({ value: skill, label: skill })),
  ];

  const filteredDrills = $derived(
    skillFilter === "All" ? DRILLS : DRILLS.filter((drill) => drill.skill === skillFilter),
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
    <div class="mb-4">
      <SegmentedControl
        options={skillOptions}
        bind:value={skillFilter}
        size="sm"
        ariaLabel="Filter drills by skill"
      />
    </div>
    <section class="reveal-up grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Practice drills">
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
