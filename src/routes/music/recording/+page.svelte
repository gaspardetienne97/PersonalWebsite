<script lang="ts">
  import Circle from "lucide-svelte/icons/circle";
  import Square from "lucide-svelte/icons/square";

  import { RecordingSession, type Take } from "@repo/music-core/engines/recording";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import { onDestroy } from "svelte";

  import OnScreenKeyboard from "../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();
  const recorder = new RecordingSession();

  let recording = $state(false);
  let liveCount = $state(0);
  let takes = $state<Take[]>([]);
  let compareA = $state<string>("");
  let compareB = $state<string>("");

  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );
  const comparison = $derived(
    compareA && compareB && compareA !== compareB ? recorder.compare(compareA, compareB) : undefined,
  );

  const unsubscribe = runtime.router.subscribe((event) => {
    if (!recording) return;
    recorder.capture(event);
    if (event.type === "noteOn") liveCount = recorder.recording ? liveCount + 1 : liveCount;
  });

  // Transport Play plays the selected take (Take A).
  $effect(() => {
    const take = takes.find((candidate) => candidate.id === compareA) ?? takes[0];
    if (!take) {
      runtime.setPlaybackSource(undefined);
      return;
    }
    const steps = take.notes.map((note) => ({
      midiNotes: [note.midi],
      offsetSeconds: note.atMs / 1000,
      durationSeconds: 0.3,
    }));
    runtime.setPlaybackSource({
      label: take.name,
      durationSec: take.durationMs / 1000,
      play: () => runtime.sound.playPattern(steps),
    });
  });

  onDestroy(() => {
    unsubscribe();
    runtime.setPlaybackSource(undefined);
  });

  function toggleRecording(): void {
    if (recording) {
      recorder.stop(performance.now());
      recording = false;
      takes = recorder.takes();
      if (takes[0]) compareA = takes[0].id;
      if (takes[1]) compareB = takes[1].id;
    } else {
      recorder.start(performance.now());
      recording = true;
      liveCount = 0;
    }
  }

  function removeTake(id: string): void {
    recorder.remove(id);
    takes = recorder.takes();
  }

  function playTake(event: { type: string; midiNote: number; velocity: number }): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  function barHeights(take: Take): number[] {
    const slots = 48;
    if (take.notes.length === 0) return new Array(slots).fill(0.08);
    const span = Math.max(take.durationMs, 1);
    const bins = new Array<number>(slots).fill(0);
    for (const note of take.notes) {
      const slot = Math.min(slots - 1, Math.floor((note.atMs / span) * slots));
      bins[slot] = Math.max(bins[slot]!, 0.2 + note.velocity * 0.8);
    }
    return bins;
  }
</script>

<svelte:head>
  <title>Recording & Self-Review | Musicianship OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Recording & Self-Review"
    subtitle="Record any take, compare them, and let the numbers show what to fix."
  >
    {#snippet controls()}
      <SourceReadout label="Input" device={sourceLabel} live={runtime.activeSource === "midi"} />
      <Button type="button" variant={recording ? "destructive" : "default"} onclick={toggleRecording}>
        {#if recording}
          <Square class="size-4 fill-current" aria-hidden="true" />Stop · {liveCount}
        {:else}
          <Circle class="size-4 fill-current text-red-500" aria-hidden="true" />New recording
        {/if}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="grid gap-6">
      <!-- Takes -->
      <Card.Root>
        <Card.Header><Card.Description>Takes</Card.Description></Card.Header>
        <Card.Content class="grid gap-3">
          {#if takes.length === 0}
            <p class="py-6 text-center text-sm text-muted-foreground">
              No takes yet — hit <strong class="text-foreground">New recording</strong> and play.
            </p>
          {:else}
            {#each takes as take (take.id)}
              <div class="flex items-center gap-3 rounded-xl border p-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate text-sm font-semibold">{take.name}</span>
                    <span class="text-xs uppercase tracking-wide text-muted-foreground">{take.source}</span>
                  </div>
                  <div class="mt-2 flex h-10 items-end gap-px" aria-hidden="true">
                    {#each barHeights(take) as height}
                      <span class="flex-1 rounded-sm bg-primary/70" style="height:{Math.round(height * 100)}%"></span>
                    {/each}
                  </div>
                  <div class="mt-1 text-xs text-muted-foreground tabular-nums">
                    {take.notes.length} notes · {(take.durationMs / 1000).toFixed(1)}s
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onclick={() => removeTake(take.id)}>Delete</Button>
              </div>
            {/each}
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Live capture surface -->
      <Card.Root>
        <Card.Header><Card.Description>Play to record</Card.Description></Card.Header>
        <Card.Content>
          <OnScreenKeyboard router={runtime.router} onAccepted={playTake} />
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Compare -->
    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Compare takes</Card.Description>
          <Card.Title>Self-review</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3">
          {#if takes.length < 2}
            <p class="text-sm text-muted-foreground">Record at least two takes to compare them.</p>
          {:else}
            <label class="grid gap-1 text-sm">
              <span class="text-xs text-muted-foreground">Take A</span>
              <select class="h-9 rounded-md border border-input bg-background px-3 text-sm" bind:value={compareA} aria-label="Take A">
                {#each takes as take}<option value={take.id}>{take.name}</option>{/each}
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="text-xs text-muted-foreground">Take B</span>
              <select class="h-9 rounded-md border border-input bg-background px-3 text-sm" bind:value={compareB} aria-label="Take B">
                {#each takes as take}<option value={take.id}>{take.name}</option>{/each}
              </select>
            </label>
            {#if comparison}
              <div class="rounded-xl border p-4 text-center">
                <div class="text-3xl font-bold tabular-nums text-primary">
                  {Math.round(comparison.accuracy * 100)}%
                </div>
                <div class="text-xs text-muted-foreground">
                  {comparison.matched}/{comparison.total} notes aligned
                </div>
              </div>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
