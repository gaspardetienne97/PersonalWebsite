<script lang="ts">
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import { onDestroy, onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AEROPHONE_RANGE, aerophoneChart } from "@repo/music-core/engines/aerophone-fingering";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import AerophoneFingering from "../../_components/AerophoneFingering.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const chart = aerophoneChart();

  let selected = $state(67); // G4
  let live = $state(false);

  function select(midi: number, fromInput = false): void {
    selected = midi;
    live = fromInput;
  }

  function step(delta: number): void {
    const next = selected + delta;
    if (next >= AEROPHONE_RANGE.lowestMidi && next <= AEROPHONE_RANGE.highestMidi) {
      select(next);
      if (runtime.audioEnabled) runtime.sound.playNote(next, 0.4);
    }
  }

  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    runtime.setActiveInstrument("aerophone");
    unsubscribe = runtime.router.subscribe((event: NoteEvent) => {
      if (event.type === "noteOn") select(event.midiNote, true);
    });
  });

  onDestroy(() => unsubscribe?.());
</script>

<svelte:head>
  <title>Aerophone Fingering | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Aerophone Fingering"
    subtitle="Sax-mode fingerings for the Roland Aerophone. Play a note (MIDI or on-screen) or pick one below to see which keys to press."
  />

  <section class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <!-- Selected note, large -->
    <Card.Root>
      <Card.Content class="flex flex-col items-center gap-4 py-6">
        <div class="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous note"
            disabled={selected <= AEROPHONE_RANGE.lowestMidi}
            onclick={() => step(-1)}
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </Button>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold {live
              ? 'bg-success/15 text-success'
              : 'bg-muted text-muted-foreground'}"
          >
            <span class="size-1.5 rounded-full {live ? 'bg-success' : 'bg-muted-foreground/50'}"></span>
            {live ? "Live" : "Preview"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next note"
            disabled={selected >= AEROPHONE_RANGE.highestMidi}
            onclick={() => step(1)}
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </Button>
        </div>
        <AerophoneFingering midi={selected} size={170} />
      </Card.Content>
    </Card.Root>

    <!-- Full chart -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Fingering chart</Card.Title>
        <Card.Description>{midiToNote(AEROPHONE_RANGE.lowestMidi)} – {midiToNote(AEROPHONE_RANGE.highestMidi)}. Tap a note to focus it.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
          {#each chart as fingering (fingering.midi)}
            <button
              type="button"
              aria-label={`${midiToNote(fingering.midi)} fingering`}
              aria-pressed={fingering.midi === selected}
              onclick={() => {
                select(fingering.midi);
                if (runtime.audioEnabled) runtime.sound.playNote(fingering.midi, 0.4);
              }}
              class="flex flex-col items-center rounded-xl border p-1.5 transition-colors hover:bg-muted/60 {fingering.midi ===
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border'}"
            >
              <AerophoneFingering midi={fingering.midi} size={84} />
            </button>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
