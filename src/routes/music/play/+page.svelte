<script lang="ts">
  import * as Card from "@repo/ui/card";
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
    <Card.Root class="overflow-hidden">
      <a
        href="/music/play/scales"
        class="group grid h-full gap-6 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="space-y-2">
          <Card.Title>Scales & Technique</Card.Title>
          <Card.Description>
            Play scale patterns with MIDI or on-screen input and unlock the next tempo when the
            run is clean.
          </Card.Description>
        </div>
        <p class="text-sm font-medium text-muted-foreground group-hover:text-foreground">
          Start scale practice
        </p>
      </a>
    </Card.Root>
  </section>
</main>
