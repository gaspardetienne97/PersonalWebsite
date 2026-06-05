<script lang="ts">
  import Plug from "lucide-svelte/icons/plug";

  import * as Card from "@repo/ui/card";
</script>

<svelte:head>
  <title>Connect Instruments | Practice OS</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
  <header class="flex items-start gap-3">
    <div class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <Plug class="size-5" aria-hidden="true" />
    </div>
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Connect Instruments</h1>
      <p class="mt-1 text-muted-foreground">
        MIDI and the on-screen keyboard are available now on every exercise page. Device profiles
        and audio input arrive in a later phase.
      </p>
    </div>
  </header>

  <Card.Root>
    <Card.Content class="space-y-3 p-5 text-sm text-muted-foreground">
      <p>
        <strong class="text-foreground">Requires:</strong>
        <code class="rounded bg-muted px-1.5 py-0.5">DeviceProfileEngine</code> — not yet
        implemented. This screen will manage device aliases, per-instrument source preferences, MIDI
        channel labels, and persisted connection metadata.
      </p>
      <p>
        Until then, Web MIDI input flows through the shared runtime on every drill. Enable MIDI from
        the Instrument Hub on the
        <a href="/music" class="font-medium text-primary hover:underline">home dashboard</a>, or use
        the on-screen keyboard as a fallback.
      </p>
    </Card.Content>
  </Card.Root>
</main>
