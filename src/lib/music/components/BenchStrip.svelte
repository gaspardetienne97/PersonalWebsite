<script lang="ts">
  // The practice controls: instrument, metronome, tempo, count-in, and the
  // live input source. Always visible and named, even on a phone.
  import * as Popover from "@repo/ui/popover";
  import Search from "lucide-svelte/icons/search";
  import Timer from "lucide-svelte/icons/timer";
  import Volume from "lucide-svelte/icons/volume-2";
  import { INSTRUMENT_ICON } from "./instrument-icons";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { bench, INSTRUMENT_LABEL } from "../bench.svelte";
  import { audio, input, midi, mic, settings } from "../runtime";
  import { palette } from "./palette.svelte";

  const TEMPOS = [60, 72, 80, 90, 100, 120, 140];
  let previewing = $state(false);
  let preview: { stop(): void } | null = null;

  const s = $derived(settings.value);
  const InstrumentIcon = $derived(INSTRUMENT_ICON[s.activeInstrument]);
  const sourceLabel = $derived.by(() => {
    const src = input.activeSource;
    if (src === "midi") return "MIDI";
    if (src === "audio") return "Microphone";
    if (src === "onscreen") return "On-screen";
    if (mic.state === "on") return "Microphone";
    return midi.enabled && midi.inputs.length ? "MIDI ready" : "On-screen";
  });

  function setTempo(v: number) {
    const bpm = Math.max(30, Math.min(240, Math.round(v || 0)));
    settings.update({ bpm });
    if (previewing) startPreview();
  }

  function startPreview() {
    preview?.stop();
    preview = audio.metronome.start({
      bpm: settings.value.bpm,
      beatsPerBar: bench.beatsPerBar,
      countInBars: 0,
      audible: true,
      onBeat: (beat) => (bench.beat = beat + 1),
    });
    previewing = true;
  }

  function toggleMetronome() {
    if (bench.locked) {
      bench.clickDuringRun = !bench.clickDuringRun;
      settings.update({ metronomeEnabled: bench.clickDuringRun });
      return;
    }
    if (previewing) {
      preview?.stop();
      preview = null;
      previewing = false;
      bench.beat = 0;
    } else {
      void audio.unlock().then(startPreview);
    }
  }

  $effect(() => {
    if (bench.locked && previewing) {
      preview?.stop();
      preview = null;
      previewing = false;
    }
  });

  $effect(() => {
    bench.clickDuringRun = settings.value.metronomeEnabled;
  });

  const metronomeOn = $derived(bench.locked ? bench.clickDuringRun : previewing);
  const pill =
    "flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-3 text-sm disabled:opacity-60";
</script>

<div class="sticky z-30 border-b border-ws-line bg-ws-bg/90 backdrop-blur {bench.running ? 'top-0' : 'top-12'}">
  <div class="flex items-center gap-2 overflow-x-auto overflow-y-hidden px-4 py-2 [scrollbar-width:thin] sm:px-6 lg:px-8" role="group" aria-label="Practice controls">
    <label class="{pill.replace('border-ws-line', 'border-instr border-2')} relative pr-2">
      <InstrumentIcon class="size-4 shrink-0 text-instr-ink" aria-hidden="true" />
      <span class="sr-only">Instrument</span>
      <select
        class="min-h-9 cursor-pointer appearance-none border-0 bg-transparent py-0 pl-0 pr-8 text-sm font-medium focus:ring-0 disabled:cursor-not-allowed"
        value={s.activeInstrument}
        disabled={bench.locked}
        onchange={(e) => settings.update({ activeInstrument: e.currentTarget.value as Instrument })}
      >
        {#each INSTRUMENTS as i (i)}
          <option value={i}>{INSTRUMENT_LABEL[i]}</option>
        {/each}
      </select>
    </label>

    <button type="button" class={pill} aria-pressed={metronomeOn} onclick={toggleMetronome}>
      <Timer class="size-4" aria-hidden="true" />
      <span>Metronome</span>
      <span
        class="size-2 rounded-full {metronomeOn ? 'bg-instr' : 'bg-ws-line'}"
        aria-hidden="true"
      ></span>
    </button>

    <Popover.Root>
      <Popover.Trigger class={pill} disabled={bench.locked} aria-label="Tempo {s.bpm} BPM">
        <span class="tnum font-display text-base font-semibold">{s.bpm}</span>
        <span class="text-ws-soft">BPM</span>
      </Popover.Trigger>
      <Popover.Content class="w-64">
        <label class="flex items-center justify-between gap-3 text-sm font-medium">
          Tempo
          <input
            type="number"
            min="30"
            max="240"
            value={s.bpm}
            class="h-11 w-24 rounded-md border border-input bg-background px-2 text-right tnum"
            onchange={(e) => setTempo(Number(e.currentTarget.value))}
          />
        </label>
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each TEMPOS as t (t)}
            <Popover.Close
              class="min-h-11 min-w-11 rounded-md border px-2 text-sm tnum {t === s.bpm ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
              onclick={() => setTempo(t)}>{t}</Popover.Close
            >
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>

    <Popover.Root>
      <Popover.Trigger class={pill} disabled={bench.locked}>
        <span>Count-in</span>
        <span class="font-semibold">{s.countInBars === 0 ? "Off" : `${s.countInBars} bar${s.countInBars > 1 ? "s" : ""}`}</span>
      </Popover.Trigger>
      <Popover.Content class="w-60">
        <p class="text-sm font-medium">Count-in before a run</p>
        <div class="mt-2 grid grid-cols-3 gap-1.5">
          {#each [0, 1, 2] as const as n (n)}
            <Popover.Close
              class="min-h-11 rounded-md border text-sm {n === s.countInBars ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
              onclick={() => settings.update({ countInBars: n })}>{n === 0 ? "Off" : `${n} bar${n > 1 ? "s" : ""}`}</Popover.Close
            >
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>

    <span class="flex min-h-11 shrink-0 items-center gap-1 px-1" aria-hidden="true" title="Beat">
      {#each Array.from({ length: bench.beatsPerBar }, (_, i) => i + 1) as b (b)}
        <span
          class="size-2.5 rounded-full transition-transform {bench.beat === b
            ? 'scale-125 ' + (bench.countingIn ? 'bg-warn' : 'bg-instr')
            : 'bg-ws-line'}"
        ></span>
      {/each}
    </span>
    {#if bench.beat > 0}
      <span class="sr-only">Beat {bench.beat} of {bench.beatsPerBar}</span>
    {/if}

    <span class="ml-auto"></span>

    {#if !audio.unlocked}
      <button type="button" class="{pill} border-instr text-instr-ink" onclick={() => audio.unlock()}>
        <Volume class="size-4" aria-hidden="true" />Enable sound
      </button>
    {/if}

    <a href="/music/connect" class={pill} aria-label="Input: {sourceLabel}. Open Connect">
      <span
        class="size-2 rounded-full {input.activeSource === 'midi' || input.activeSource === 'audio' ? 'bg-success' : 'bg-ws-soft'}"
        aria-hidden="true"
      ></span>
      {sourceLabel}
    </a>

    <button type="button" class={pill} onclick={() => palette.open()} aria-keyshortcuts="Meta+K Control+K">
      <Search class="size-4" aria-hidden="true" />
      <span class="hidden sm:inline">Search</span>
      <kbd class="hidden rounded border border-ws-line px-1 text-xs text-ws-soft sm:inline">⌘K</kbd>
    </button>
  </div>
</div>
