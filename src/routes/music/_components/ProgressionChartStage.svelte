<script lang="ts">
  import type { InstrumentId } from "@repo/music-core/domain";
  import type { JamProgression, TargetTone, ToneRole } from "@repo/music-core/engines/jam";
  import { cn } from "@repo/ui/utils";

  import PianoSurface from "./piano/PianoSurface.svelte";
  import PracticeStage from "./PracticeStage.svelte";

  let {
    progression,
    currentIndex = 0,
    tones,
    instrument = "piano",
  }: {
    progression: JamProgression;
    currentIndex?: number;
    tones: TargetTone[];
    instrument?: InstrumentId;
  } = $props();

  /** The strip is a pitch-class reference, so one octave from C4 stands in. */
  const STRIP_LOW_MIDI = 60;

  const current = $derived(progression.chords[currentIndex] ?? progression.chords[0]!);
  const nextIndex = $derived((currentIndex + 1) % progression.chords.length);
  const next = $derived(progression.chords[nextIndex] ?? progression.chords[0]!);

  function roleFor(pc: number): ToneRole {
    return tones.find((tone) => tone.pitchClass === pc)?.role ?? "avoid";
  }

  const toneRoles = $derived(
    Object.fromEntries(
      Array.from({ length: 12 }, (_, pc) => [STRIP_LOW_MIDI + pc, roleFor(pc)] as const),
    ),
  );

  function cellState(index: number): "current" | "next" | "upcoming" {
    if (index === currentIndex) return "current";
    if (index === nextIndex) return "next";
    return "upcoming";
  }
</script>

<PracticeStage {instrument} class="min-w-0 space-y-5 overflow-x-auto p-4">
  <div class="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(18rem,1.1fr)] lg:items-center">
    <div class="grid gap-2 text-center lg:text-left">
      <span class="eyebrow">Now playing · {current.roman} in {progression.key}</span>
      <span
        class="text-5xl font-bold tracking-tight text-practice-accent sm:text-6xl"
        data-testid="progression-current-symbol"
      >
        {current.symbol}
      </span>
      <span class="text-sm text-stage-muted">{current.scale}</span>
      <span class="text-xs text-muted-foreground" data-testid="progression-next-symbol">
        Next: {next.symbol} · {next.roman}
      </span>
    </div>

    <div class="grid gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="eyebrow">Progression · {progression.name}</p>
        <span class="rounded-full bg-stage-2 px-2.5 py-0.5 text-xs font-semibold text-stage-foreground">
          {current.bars} bars each
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`${progression.name} chord chart`}>
        {#each progression.chords as chord, index (`${chord.symbol}-${index}`)}
          {@const state = cellState(index)}
          <div
            data-testid={`progression-cell-${index}`}
            data-state={state}
            class={cn(
              "rounded-lg border p-3 text-center",
              state === "current" &&
                "border-practice-accent bg-practice-accent/15 text-stage-foreground ring-1 ring-practice-accent/30",
              state === "next" && "border-info/50 bg-info/15 text-stage-foreground",
              state === "upcoming" && "border-stage-line bg-stage-2 text-stage-foreground",
            )}
          >
            <div class="text-lg font-bold">{chord.symbol}</div>
            <div class="text-xs text-stage-muted">
              {chord.roman}{state === "current" ? " · now" : state === "next" ? " · next" : ""}
            </div>
            <div class="mt-1 text-[0.6875rem] font-medium text-stage-muted">{chord.scale}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="grid gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="eyebrow">Target tones · {current.symbol} / {current.scale}</p>
      <div class="flex flex-wrap items-center gap-3 text-xs text-stage-muted">
        <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-primary"></span>Chord tones</span>
        <span class="flex items-center gap-1.5"
          ><span class="size-3 rounded-full bg-primary/25 ring-1 ring-inset ring-primary"></span>Scale tones</span
        >
        <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-muted"></span>Avoid</span>
      </div>
    </div>

    <div class="mx-auto w-full max-w-md">
      <PianoSurface
        lowMidi={STRIP_LOW_MIDI}
        highMidi={STRIP_LOW_MIDI + 11}
        {toneRoles}
        noteNames="all"
        interactive={false}
        label={`Target-tone keyboard · ${current.symbol}`}
      />
    </div>
  </div>
</PracticeStage>
