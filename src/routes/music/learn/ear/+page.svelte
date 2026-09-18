<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";

  import {
    EAR_TRAINING_DRILLS,
    EAR_TRAINING_LEARNING_PATH_DEFINITION,
    earTrainingDrillHref,
    legacyEarTrainingHref,
  } from "@repo/music-core/engines/ear-training";
  import { buildLearningPath } from "@repo/music-core/engines/learning-path";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import Ear from "lucide-svelte/icons/ear";

  import LearningPathScreen from "../../_components/LearningPathScreen.svelte";
  import MusicToolCard from "../../_components/MusicToolCard.svelte";

  // The Ear Training Path. Each step opens one ear drill with its setup; the
  // drills live at /music/learn/ear/<slug>. Old single-route links
  // (?drill=cadence&answer=listen, or ?routine=1 from the daily routine) are
  // redirected onto the matching drill.
  let { navigate = (href: string) => goto(href, { replaceState: true }) }: {
    navigate?: (href: string) => void | Promise<void>;
  } = $props();

  const legacyTarget = browser ? legacyEarTrainingHref(window.location.search) : undefined;
  // Redirect once, at mount; the initial `navigate` is the one we want.
  // svelte-ignore state_referenced_locally
  if (legacyTarget) void navigate(legacyTarget);

  const store = browser ? new PracticeStore() : undefined;
  let events = $state<import("@repo/music-core/domain").ScoringEvent[]>([]);
  void store?.scoringEvents.all().then((loaded) => (events = loaded));

  const path = $derived.by(() => {
    return buildLearningPath(EAR_TRAINING_LEARNING_PATH_DEFINITION.steps, {
      events,
    });
  });
</script>

<svelte:head>
  <title>Ear Training Path | Practice OS</title>
  <meta
    name="description"
    content="Tonic first, then every scale degree, then melodies: the ordered ear-training path, each step opening one drill."
  />
</svelte:head>

<LearningPathScreen
  title={EAR_TRAINING_LEARNING_PATH_DEFINITION.title}
  subtitle={EAR_TRAINING_LEARNING_PATH_DEFINITION.subtitle}
  {path}
  testId="ear-path"
>
  <section class="grid gap-3" aria-labelledby="ear-path-drills">
    <h2 id="ear-path-drills" class="text-xl font-semibold tracking-tight">Ear drills</h2>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {#each EAR_TRAINING_DRILLS as drill (drill.slug)}
        <MusicToolCard
          href={earTrainingDrillHref(drill.slug)}
          title={drill.title}
          description={drill.description}
          eyebrow="Ear"
          meta={drill.answerModes.length > 1 ? `${drill.answerModes.length} answer modes` : "Play-back"}
          action="Start"
          icon={Ear}
          hue="ear"
        />
      {/each}
    </div>
  </section>
</LearningPathScreen>
