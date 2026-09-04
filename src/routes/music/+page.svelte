<script lang="ts">
  import { browser } from "$app/environment";
  import FlaskConical from "lucide-svelte/icons/flask-conical";

  import { Button } from "@repo/ui/button";
  import { Empty } from "@repo/ui/empty";

  import MusicToolCard from "./_components/MusicToolCard.svelte";
  import PracticeScreen from "./_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "./_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "./_components/SegmentedControl.svelte";
  import TodayPlan from "./_components/TodayPlan.svelte";
  import { DRILLS, DRILL_SKILLS, PATHS, type DrillSkill, type Hue } from "./_components/musicCatalog";
  import { syncRouteQuery } from "./_components/route-state";

  // Card cover-band hue per skill (Play has no skill hue → piano identity).
  const SKILL_HUE: Record<DrillSkill, Hue> = {
    Ear: "ear",
    Reading: "reading",
    Rhythm: "rhythm",
    Harmony: "harmony",
    Technique: "technique",
    Play: "piano",
  };

  // Cover art per drill href (static/images/music/covers, runtime-served, not
  // precached). Cards without an entry keep the hue-gradient fallback band.
  const COVER_SLUG: Record<string, string> = {
    "/music/learn/ear": "ear",
    "/music/learn/reading": "reading",
    "/music/learn/rhythm": "rhythm",
    "/music/play/scales": "scales",
    "/music/play/spider": "spider",
    "/music/play/two-hand": "two-hand",
    "/music/play/mpc": "mpc",
    "/music/learn/aerophone": "aerophone",
    "/music/learn/aerophone?mode=articulation": "articulation",
    "/music/play/chord-perfect": "chord-perfect",
    "/music/play/chord-progression": "chord-progression",
    "/music/play/voicings": "voicings",
    "/music/play/licks": "licks",
    "/music/play/chord-scales": "chord-scales",
    "/music/play": "play",
    "/music/jam": "jam",
  };
  const coverSrc = (href: string) =>
    COVER_SLUG[href] ? `/images/music/covers/${COVER_SLUG[href]}.webp` : undefined;

  const TABS = ["today", "drills", "paths"] as const;
  // The tab lives in the URL (?tab=drills) so a bookmark or a back gesture lands
  // on the same view. String-typed so it binds to SegmentedControl's `value: string`.
  const initialTab = browser ? new URLSearchParams(window.location.search).get("tab") : null;
  let tab = $state<string>(
    TABS.includes(initialTab as (typeof TABS)[number]) ? (initialTab as string) : "today",
  );
  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "today") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    syncRouteQuery(`${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  });
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
  <title>Practice | Practice OS</title>
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
            hue={SKILL_HUE[drill.skill]}
            coverSrc={coverSrc(drill.href)}
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
          hue="reading"
        />
      {/each}
    </section>
  {/if}
</PracticeScreen>
