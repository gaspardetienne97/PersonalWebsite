<script lang="ts">
  import type { InstrumentId } from "@repo/music-core/domain";
  import type { JamProgression, TargetTone, ToneRole } from "@repo/music-core/engines/jam";
  import { cn } from "@repo/ui/utils";

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

  const WHITE = [
    { pc: 0, label: "C" },
    { pc: 2, label: "D" },
    { pc: 4, label: "E" },
    { pc: 5, label: "F" },
    { pc: 7, label: "G" },
    { pc: 9, label: "A" },
    { pc: 11, label: "B" },
  ];
  const BLACK = [
    { pc: 1, left: 10 },
    { pc: 3, left: 24 },
    { pc: 6, left: 52 },
    { pc: 8, left: 66 },
    { pc: 10, left: 80 },
  ];

  const current = $derived(progression.chords[currentIndex] ?? progression.chords[0]!);
  const nextIndex = $derived((currentIndex + 1) % progression.chords.length);
  const next = $derived(progression.chords[nextIndex] ?? progression.chords[0]!);

  function roleFor(pc: number): ToneRole {
    return tones.find((tone) => tone.pitchClass === pc)?.role ?? "avoid";
  }

  function keyClasses(role: ToneRole, black = false): string {
    if (role === "chord") {
      return black
        ? "border-primary bg-primary text-primary-foreground"
        : "border-primary bg-primary text-primary-foreground";
    }
    if (role === "scale") {
      return black
        ? "border-primary/40 bg-primary/55 text-primary-foreground"
        : "border-primary/40 bg-primary/20 text-primary";
    }
    return black
      ? "border-foreground/20 bg-foreground"
      : "border-stage-line bg-background text-muted-foreground";
  }

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
        <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-primary/30"></span>Scale tones</span>
        <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-muted"></span>Avoid</span>
      </div>
    </div>

    <div class="relative mx-auto h-32 w-full max-w-md select-none" aria-label="Target-tone keyboard">
      <div class="flex h-full gap-1">
        {#each WHITE as key (key.pc)}
          {@const role = roleFor(key.pc)}
          <div
            data-tone-role={role}
            class={cn(
              "flex flex-1 items-end justify-center rounded-b-md border pb-2 text-xs font-semibold",
              keyClasses(role),
            )}
          >
            {key.label}
          </div>
        {/each}
      </div>
      {#each BLACK as key (key.pc)}
        {@const role = roleFor(key.pc)}
        <div
          data-tone-role={role}
          class={cn("absolute top-0 h-20 w-[9%] rounded-b-md border", keyClasses(role, true))}
          style:left={`${key.left}%`}
          aria-hidden="true"
        ></div>
      {/each}
    </div>
  </div>
</PracticeStage>
