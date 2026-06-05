<script lang="ts">
  import BookOpen from "lucide-svelte/icons/book-open";
  import Ear from "lucide-svelte/icons/ear";
  import Music from "lucide-svelte/icons/music";

  import MusicToolCard from "../_components/MusicToolCard.svelte";
</script>

<svelte:head>
  <title>Learn | Musicianship OS</title>
  <meta
    name="description"
    content="Build practical music knowledge through ear training and an interactive theory library."
  />
</svelte:head>

<main class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:px-8">
  <header class="space-y-2">
    <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Musicianship OS</p>
    <h1 class="text-4xl font-bold tracking-tight">Learn</h1>
    <p class="max-w-2xl text-muted-foreground">
      Train what you hear, then connect it to the notes, intervals, and shapes behind the sound.
    </p>
  </header>

  <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Learning tools">
    <MusicToolCard
      href="/music/learn/ear"
      title="Ear Training"
      description="Practice intervals, chord qualities, and functional scale degrees in focused or mixed sessions."
      eyebrow="Learn"
      meta="Listening"
      action="Start ear practice"
      icon={Ear}
    />
    <MusicToolCard
      href="/music/learn/reading"
      title="Note Reading"
      description="Read staff notation and connect it to piano keys, strings, and frets."
      eyebrow="Learn"
      meta="Notation"
      action="Open reading trainer"
      icon={Music}
    />
    <MusicToolCard
      href="/music/learn/rhythm"
      title="Rhythm Trainer"
      description="Lock quarter-note pulse to the metronome and review ahead/behind timing feedback."
      eyebrow="Learn"
      meta="Timing"
      action="Start rhythm practice"
      icon={Music}
    />
    <MusicToolCard
      href="/music/learn/theory"
      title="Theory Library"
      description="Explore and hear chords and scales across piano, guitar, and ukulele."
      eyebrow="Learn"
      meta="Reference"
      action="Browse theory"
      icon={BookOpen}
    />
  </section>
</main>
