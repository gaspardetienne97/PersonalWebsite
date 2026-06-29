<script lang="ts">
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import ListChecks from "lucide-svelte/icons/list-checks";
  import WandSparkles from "lucide-svelte/icons/wand-sparkles";

  import { Badge } from "@repo/ui/badge";
  import * as Card from "@repo/ui/card";

  import MusicToolCard from "./_components/MusicToolCard.svelte";
  import PracticeScreen from "./_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "./_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "./_components/SegmentedControl.svelte";
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
    <section class="grid gap-4 md:grid-cols-2" aria-label="Today's plan">
      <Card.Root class="overflow-hidden md:col-span-2">
        <a
          href="/music/routine"
          class="group grid gap-4 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div class="flex items-center justify-between gap-4">
            <Badge variant="outline">Adaptive</Badge>
            <ArrowRight
              class="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
          <div class="flex items-start gap-4">
            <span class="rounded-md border bg-muted p-3 text-foreground">
              <ListChecks class="size-5" aria-hidden="true" />
            </span>
            <div class="min-w-0 space-y-2">
              <Card.Title>Start today's plan</Card.Title>
              <Card.Description>
                A focused ~20-minute pass through the drills that target your weakest spots, in
                order. Builds from your real progress.
              </Card.Description>
            </div>
          </div>
          <p class="text-sm font-medium text-muted-foreground group-hover:text-foreground">
            Begin daily routine
          </p>
        </a>
      </Card.Root>

      <MusicToolCard
        href="/music/coach"
        title="Practice Coach"
        description="See why this plan was chosen — your focus skill, streak, and what to work on next."
        eyebrow="Guidance"
        meta="Adaptive"
        action="Open coach"
        icon={WandSparkles}
      />
      <MusicToolCard
        href="/music/progress"
        title="Progress"
        description="Your skill tree, mastery rings, streak, and journal — the retrospective view."
        eyebrow="Review"
        meta="Analytics"
        action="View progress"
        icon={ListChecks}
      />
    </section>
  {:else if tab === "drills"}
    <div class="mb-4">
      <SegmentedControl
        options={skillOptions}
        bind:value={skillFilter}
        size="sm"
        ariaLabel="Filter drills by skill"
      />
    </div>
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Practice drills">
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
    <section class="grid gap-4 md:grid-cols-2" aria-label="Guided paths">
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
