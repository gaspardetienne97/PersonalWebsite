<script lang="ts">
  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { CREATE_ITEMS } from "../_components/musicCatalog";
</script>

<svelte:head>
  <title>Create | Musicianship OS</title>
  <meta
    name="description"
    content="Make music — the step sequencer, piano-roll editor, and recorder."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Create"
    subtitle="Make music — sketch a beat, sequence a part, and capture takes."
  />

  <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Create">
    {#each CREATE_ITEMS as item (item.href)}
      <MusicToolCard
        href={item.href}
        title={item.title}
        description={item.description}
        eyebrow="Create"
        meta={item.meta}
        action={item.action}
        icon={item.icon}
      />
    {/each}
  </section>
</PracticeScreen>
