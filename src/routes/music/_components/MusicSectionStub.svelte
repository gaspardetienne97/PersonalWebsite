<script lang="ts">
  import * as Card from "@repo/ui/card";

  let {
    title,
    description,
    next,
  }: {
    title: string;
    description: string;
    next: string;
  } = $props();
</script>

<svelte:head>
  <title>{title} | Musicianship OS</title>
</svelte:head>

<section class="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:px-8">
  <header class="space-y-2">
    <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Musicianship OS</p>
    <h1 class="text-4xl font-bold tracking-tight">{title}</h1>
    <p class="max-w-2xl text-muted-foreground">{description}</p>
  </header>

  <Card.Root>
    <Card.Header>
      <Card.Description>Phase 1 route</Card.Description>
      <Card.Title>{next}</Card.Title>
    </Card.Header>
    <Card.Content>
      <p class="text-sm text-muted-foreground">
        This route is ready for its focused workflow while the shared music shell keeps navigation,
        audio, and input services available.
      </p>
    </Card.Content>
  </Card.Root>
</section>
