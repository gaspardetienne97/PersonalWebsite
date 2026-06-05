<script lang="ts">
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";

  import MusicToolCard from "../_components/MusicToolCard.svelte";
</script>

<svelte:head>
  <title>Play | Musicianship OS</title>
  <meta
    name="description"
    content="Run performance-focused practice tools for scales, metronome work, and instrument technique."
  />
</svelte:head>

<main class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-8">
  <header class="space-y-2">
    <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Music</p>
    <h1 class="text-4xl font-bold tracking-tight">Play</h1>
    <p class="max-w-2xl text-muted-foreground">
      Performance tools for building clean timing, instrument control, and repeatable technique.
    </p>
  </header>

  <section class="grid gap-4 md:grid-cols-2" aria-label="Play tools">
    <MusicToolCard
      href="/music/play/scales"
      title="Scales & Technique"
      description="Play scale patterns with MIDI or on-screen input and unlock the next tempo when the run is clean."
      eyebrow="Play"
      meta="Technique"
      action="Start scale practice"
      icon={SlidersHorizontal}
    />
  </section>
</main>
