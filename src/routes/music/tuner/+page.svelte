<script lang="ts">
  import { onDestroy } from "svelte";

  import {
    AudioPitchSource,
    tunerReading,
    type AudioPitchState,
    type TunerReading,
  } from "@repo/music-core/engines/audio-in";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import CentsMeter from "../_components/CentsMeter.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";

  const A4_OPTIONS = [438, 439, 440, 441, 442] as const;
  const TOLERANCE_CENTS = 5;

  // SSR-safe: the constructor touches no Web Audio APIs (those are gated behind
  // start()), so this is fine to create at module scope on the client.
  const source = new AudioPitchSource();
  const supported = AudioPitchSource.supported;

  let state = $state<AudioPitchState>({ status: "idle" });
  let reading = $state<TunerReading | null>(null);
  let a4 = $state(440);

  const running = $derived(state.status === "running");
  const active = $derived(running && reading !== null);

  const unsubscribeState = source.subscribeState((next) => {
    state = next;
    if (next.status !== "running") reading = null;
  });

  // Recompute the reading from the raw event each frame so the A4 reference and
  // tolerance apply live without restarting the audio graph.
  const unsubscribeEvents = source.subscribeEvents((event) => {
    if (event.frequencyHz === undefined) return;
    const next = tunerReading(
      { frequency: event.frequencyHz, clarity: event.confidence ?? 0 },
      { a4, toleranceCents: TOLERANCE_CENTS },
    );
    if (next) reading = next;
  });

  onDestroy(() => {
    unsubscribeState();
    unsubscribeEvents();
    void source.stop();
  });

  function toggle() {
    if (running || state.status === "requesting") {
      void source.stop();
    } else {
      void source.start();
    }
  }

  const centsLabel = $derived(
    reading ? `${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢` : "—",
  );
</script>

<svelte:head>
  <title>Tuner | Musicianship OS</title>
  <meta
    name="description"
    content="Tune by ear with a live microphone tuner: nearest note, cents deviation, and a flat / in-tune / sharp meter."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Tuner"
    subtitle="Play or sing a single note — the tuner shows the nearest pitch and how many cents you are flat or sharp."
  >
    {#snippet controls()}
      <Button variant={running ? "secondary" : "default"} onclick={toggle} disabled={!supported}>
        {#if state.status === "requesting"}
          Starting…
        {:else if running}
          Stop
        {:else}
          Start tuner
        {/if}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  {#if !supported}
    <Card.Root>
      <Card.Content class="py-8 text-center text-muted-foreground">
        Microphone audio input isn't available in this browser. Try a recent Chrome, Edge, or
        Safari over HTTPS.
      </Card.Content>
    </Card.Root>
  {:else}
    <Card.Root>
      <Card.Content class="flex flex-col items-center gap-6 py-10">
        <div class="flex flex-col items-center gap-1">
          <span
            class="text-7xl font-bold tabular-nums tracking-tight transition-colors {active
              ? reading?.zone === 'in-tune'
                ? 'text-success'
                : 'text-foreground'
              : 'text-muted-foreground/40'}"
          >
            {reading ? reading.note : "—"}
          </span>
          <span class="text-sm text-muted-foreground">
            {#if reading && active}
              {reading.name} · {reading.frequency.toFixed(1)} Hz
            {:else if running}
              Listening…
            {:else}
              Press start and play a note
            {/if}
          </span>
        </div>

        <div class="w-full max-w-md">
          <CentsMeter
            cents={reading?.cents ?? 0}
            zone={reading?.zone ?? "in-tune"}
            toleranceCents={TOLERANCE_CENTS}
            {active}
          />
          <div class="mt-2 text-center text-sm font-medium tabular-nums">
            <span
              class={active
                ? reading?.zone === "in-tune"
                  ? "text-success"
                  : "text-primary"
                : "text-muted-foreground"}
            >
              {centsLabel}
            </span>
            {#if active && reading}
              <span class="ml-2 text-muted-foreground">
                {reading.zone === "in-tune" ? "in tune" : reading.zone}
              </span>
            {/if}
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Reference A4</span>
        <div class="flex overflow-hidden rounded-md border">
          {#each A4_OPTIONS as hz (hz)}
            <button
              type="button"
              class="px-2.5 py-1 text-sm tabular-nums transition-colors {a4 === hz
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'}"
              onclick={() => (a4 = hz)}
            >
              {hz}
            </button>
          {/each}
        </div>
      </div>
      {#if state.status === "denied" || state.status === "error"}
        <p class="text-sm text-destructive">{state.message}</p>
      {/if}
    </div>
  {/if}
</PracticeScreen>
