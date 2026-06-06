<script lang="ts">
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";

  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
</script>

<svelte:head>
  <title>Play | Musicianship OS</title>
  <meta
    name="description"
    content="Run performance-focused practice tools for scales, metronome work, and instrument technique."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Play"
    subtitle="Performance tools for building clean timing, instrument control, and repeatable technique."
  />

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
</PracticeScreen>
