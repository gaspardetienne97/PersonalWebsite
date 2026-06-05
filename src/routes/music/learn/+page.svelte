<script lang="ts">
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import BookOpen from "lucide-svelte/icons/book-open";
  import Ear from "lucide-svelte/icons/ear";
  import Music from "lucide-svelte/icons/music";

  import * as Card from "@repo/ui/card";
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
    <Card.Root class="overflow-hidden">
      <a
        href="/music/learn/ear"
        class="group grid h-full gap-6 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="flex items-start justify-between gap-4">
          <span class="rounded-md border bg-muted p-3 text-foreground">
            <Ear class="size-6" aria-hidden="true" />
          </span>
          <ArrowRight
            class="size-5 text-muted-foreground transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </div>
        <div class="space-y-2">
          <Card.Title>Ear Training</Card.Title>
          <Card.Description>
            Practice intervals, chord qualities, and functional scale degrees in focused or mixed
            sessions.
          </Card.Description>
        </div>
      </a>
    </Card.Root>

    <Card.Root class="overflow-hidden">
      <a
        href="/music/learn/reading"
        class="group grid h-full gap-6 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="flex items-start justify-between gap-4">
          <span class="rounded-md border bg-muted p-3 text-foreground">
            <Music class="size-6" aria-hidden="true" />
          </span>
          <ArrowRight
            class="size-5 text-muted-foreground transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </div>
        <div class="space-y-2">
          <Card.Title>Note Reading</Card.Title>
          <Card.Description>
            Read staff notation and connect it to piano keys, strings, and frets.
          </Card.Description>
        </div>
      </a>
    </Card.Root>

    <Card.Root class="overflow-hidden">
      <a
        href="/music/learn/rhythm"
        class="group grid h-full gap-6 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="flex items-start justify-between gap-4">
          <span class="rounded-md border bg-muted p-3 text-foreground">
            <Music class="size-6" aria-hidden="true" />
          </span>
          <ArrowRight
            class="size-5 text-muted-foreground transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </div>
        <div class="space-y-2">
          <Card.Title>Rhythm Trainer</Card.Title>
          <Card.Description>
            Lock quarter-note pulse to the metronome and review ahead/behind timing feedback.
          </Card.Description>
        </div>
      </a>
    </Card.Root>

    <Card.Root class="overflow-hidden">
      <a
        href="/music/learn/theory"
        class="group grid h-full gap-6 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="flex items-start justify-between gap-4">
          <span class="rounded-md border bg-muted p-3 text-foreground">
            <BookOpen class="size-6" aria-hidden="true" />
          </span>
          <ArrowRight
            class="size-5 text-muted-foreground transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </div>
        <div class="space-y-2">
          <Card.Title>Theory Library</Card.Title>
          <Card.Description>
            Explore and hear chords and scales across piano, guitar, and ukulele.
          </Card.Description>
        </div>
      </a>
    </Card.Root>
  </section>
</main>
