<script lang="ts">
  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { LIBRARY_ITEMS } from "../_components/musicCatalog";
</script>

<svelte:head>
  <title>Library | Musicianship OS</title>
  <meta
    name="description"
    content="Your repertoire and reference — saved songs, the chord/scale library, import, and transcribe."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Library"
    subtitle="Your repertoire and reference — saved songs, the chord and scale library, and ways to bring in new material."
  />

  <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Library">
    {#each LIBRARY_ITEMS as item (item.href)}
      <MusicToolCard
        href={item.href}
        title={item.title}
        description={item.description}
        eyebrow="Library"
        meta={item.meta}
        action={item.action}
        icon={item.icon}
      />
    {/each}
  </section>
</PracticeScreen>
