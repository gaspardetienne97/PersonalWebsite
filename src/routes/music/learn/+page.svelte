<script lang="ts">
  import BookOpen from "lucide-svelte/icons/book-open";
  import Dumbbell from "lucide-svelte/icons/dumbbell";
  import Ear from "lucide-svelte/icons/ear";
  import Music from "lucide-svelte/icons/music";
  import Wind from "lucide-svelte/icons/wind";

  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
</script>

<svelte:head>
  <title>Learn | Musicianship OS</title>
  <meta
    name="description"
    content="Build practical music knowledge through ear training and an interactive theory library."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Learn"
    subtitle="Train what you hear, then connect it to the notes, intervals, and shapes behind the sound."
  />

  <section class="mb-4" aria-label="Guided path">
    <MusicToolCard
      href="/music/learn/path"
      title="Jazz Path"
      description="A guided, in-order path: intervals → chords → scales → voicings → the graded ii-V-I drill → improv. Tracked by your real skill progress and adapted to your instrument."
      eyebrow="Start here"
      meta="Guided"
      action="Open the path"
      icon={Music}
    />
  </section>

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
    <MusicToolCard
      href="/music/learn/aerophone"
      title="Aerophone"
      description="Study the Aerophone fingering chart, step through notes, and see incoming notes highlight the keys."
      eyebrow="Learn"
      meta="Wind"
      action="Open fingerings"
      icon={Wind}
    />
    <MusicToolCard
      href="/music/play/scales"
      title="Scales & Drills"
      description="Connect scale shapes to playable technique work with tempo targets and instrument-aware reference views."
      eyebrow="Learn"
      meta="Technique"
      action="Practice scales"
      icon={Dumbbell}
    />
    <MusicToolCard
      href="/music/learn/jazz"
      title="Jazz Piano"
      description="Chord symbols, chord-scale theory, rootless ii-V-I voicings, 29 licks, and standards."
      eyebrow="Learn"
      meta="Jazz"
      action="Open jazz path"
      icon={Music}
    />
  </section>
</PracticeScreen>
