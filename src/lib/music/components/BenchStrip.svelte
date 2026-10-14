<script lang="ts">
  // The practice controls: instrument, metronome, tempo, count-in, tuning and
  // the live input source. One row that wraps; on a phone the secondary
  // controls sit behind "More" so nothing is off-screen.
  import * as Popover from "@repo/ui/popover";
  import Search from "lucide-svelte/icons/search";
  import Timer from "lucide-svelte/icons/timer";
  import Volume from "lucide-svelte/icons/volume-2";
  import VolumeOff from "lucide-svelte/icons/volume-off";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import { instrumentOptions } from "./instrument-icons";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { bench, INSTRUMENT_LABEL } from "../bench.svelte";
  import { audio, input, midi, mic, settings } from "../runtime";
  import { palette } from "./palette.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import TuningPicker from "$lib/music/drills/guitar/TuningPicker.svelte";
  import { tunings } from "$lib/music/drills/guitar/instrument.svelte";

  const TEMPOS = [60, 72, 80, 90, 100, 120, 140];
  let previewing = $state(false);
  let preview: { stop(): void } | null = null;
  let more = $state(false);

  const s = $derived(settings.value);
  const sourceLabel = $derived.by(() => {
    const src = input.activeSource;
    if (src === "midi") return "MIDI";
    if (src === "audio") return "Microphone";
    if (src === "onscreen") return "On-screen";
    if (mic.state === "on") return "Microphone";
    return midi.enabled && midi.inputs.length ? "MIDI ready" : "On-screen";
  });
  const fretted = $derived(s.activeInstrument === "guitar" || s.activeInstrument === "ukulele" ? s.activeInstrument : null);
  const tuningId = $derived(fretted === "ukulele" ? s.ukuleleTuningId : s.guitarTuningId);
  const tuningName = $derived(fretted ? tunings.pick(tuningId, fretted).name : "");

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
      audible: () => true,
      onBeat: (beat) => (bench.beat = beat + 1),
    });
    previewing = true;
  }

  function stopPreview() {
    preview?.stop();
    preview = null;
    previewing = false;
    bench.beat = 0;
  }

  function togglePreview() {
    if (previewing) stopPreview();
    else void audio.unlock().then(startPreview);
  }

  $effect(() => {
    if (bench.locked && previewing) stopPreview();
  });

  // One state: whether runs click. The strip's pill flips the saved setting
  // and the metronome reads bench.clickDuringRun on every beat.
  $effect(() => {
    bench.clickDuringRun = settings.value.metronomeEnabled;
  });

  const untimed = $derived(!bench.timed);
  // Popovers render inside the app's root, where its colours are defined (as Picker's do).
  let root = $state<HTMLElement>();
  const portalTo = $derived(root?.closest<HTMLElement>(".woodshed") ?? undefined);
  const pill =
    "flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-3 text-sm disabled:opacity-60";
  /** Secondary controls: behind More on a phone, inline from sm up. */
  const extra = $derived(more ? "" : "max-sm:hidden");
</script>

<div bind:this={root} class="sticky z-30 border-b border-ws-line bg-ws-bg/90 backdrop-blur {bench.running ? 'top-0' : 'top-12'}">
  <!-- One row from sm up (scrolling only if it must), so pills that come and go never change the strip's height mid-click. -->
  <div class="flex flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap sm:overflow-x-auto sm:px-6 sm:[scrollbar-width:thin] lg:px-8" role="group" aria-label="Practice controls">
    <div class="{pill.replace('border-ws-line', 'border-instr border-2')} relative pr-2">
      <Picker
        class="w-auto min-w-28 pr-1"
        tone="bare"
        label="Instrument"
        value={s.activeInstrument}
        disabled={bench.locked}
        options={instrumentOptions((i) => INSTRUMENT_LABEL[i])}
        onchange={(v) => settings.update({ activeInstrument: v as Instrument })}
      />
    </div>

    <button
      type="button"
      class={pill}
      aria-pressed={bench.clickDuringRun}
      aria-label="Metronome click in runs"
      title={bench.clickDuringRun ? "Runs click. Tap to mute the click." : "Runs are silent. Tap to hear the click."}
      onclick={() => settings.update({ metronomeEnabled: !bench.clickDuringRun })}
    >
      <Timer class="size-4" aria-hidden="true" />
      <span class="hidden sm:inline">Metronome</span>
      <span class="text-ws-soft">{bench.clickDuringRun ? "On" : "Off"}</span>
      <span class="size-2 rounded-full {bench.clickDuringRun ? 'bg-instr' : 'bg-ws-line'}" aria-hidden="true"></span>
    </button>

    <Popover.Root>
      <Popover.Trigger
        class={pill}
        disabled={bench.locked || untimed}
        title={untimed ? "Not used here" : undefined}
        aria-label="Tempo {s.bpm} BPM{untimed ? ', not used here' : ''}"
      >
        <span class="tnum font-display text-base font-semibold">{s.bpm}</span>
        <span class="text-ws-soft">BPM</span>
      </Popover.Trigger>
      <Popover.Content portalProps={{ to: portalTo }} class="w-64 border-ws-line bg-ws-surface text-ws-ink">
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
        <button type="button" class="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border text-sm hover:bg-accent" aria-pressed={previewing} onclick={togglePreview}>
          <Timer class="size-4" aria-hidden="true" />{previewing ? "Stop the click" : "Hear the click"}
        </button>
      </Popover.Content>
    </Popover.Root>

    <Popover.Root>
      <Popover.Trigger class="{pill} {extra}" disabled={bench.locked || untimed} title={untimed ? "Not used here" : undefined}>
        <span>Count-in</span>
        <span class="font-semibold">{s.countInBars === 0 ? "Off" : `${s.countInBars} bar${s.countInBars > 1 ? "s" : ""}`}</span>
        {#if untimed}<span class="sr-only">, not used here</span>{/if}
      </Popover.Trigger>
      <Popover.Content portalProps={{ to: portalTo }} class="w-60 border-ws-line bg-ws-surface text-ws-ink">
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

    {#if fretted}
      <Popover.Root>
        <Popover.Trigger class="{pill} {extra}" disabled={bench.locked} aria-label="Tuning: {tuningName}">
          <span>Tuning</span>
          <span class="font-semibold">{tuningName}</span>
        </Popover.Trigger>
        <Popover.Content portalProps={{ to: portalTo }} class="w-80 border-ws-line bg-ws-surface text-ws-ink">
          <TuningPicker
            instrument={fretted}
            value={tuningId}
            onchange={(id) => settings.update(fretted === "ukulele" ? { ukuleleTuningId: id } : { guitarTuningId: id })}
          />
        </Popover.Content>
      </Popover.Root>
    {/if}

    <span class="min-h-11 shrink-0 items-center gap-1 px-1 {bench.running || bench.countingIn ? 'flex' : 'hidden'} {extra}" aria-hidden="true" title="Beat">
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

    {#if s.muted}
      <button type="button" class="{pill} border-warn text-ws-ink" onclick={() => settings.update({ muted: false })} aria-label="Sound is off. Turn it on">
        <VolumeOff class="size-4" aria-hidden="true" />Sound off
      </button>
    {:else if !audio.unlocked}
      <button type="button" class="{pill} border-instr text-instr-ink" onclick={() => audio.unlock()}>
        <Volume class="size-4" aria-hidden="true" />Enable sound
      </button>
    {/if}

    <a href="/music/connect" class="{pill} {extra}" aria-label="Input: {sourceLabel}. Open Connect">
      <span
        class="size-2 rounded-full {input.activeSource === 'midi' || input.activeSource === 'audio' ? 'bg-success' : 'bg-ws-soft'}"
        aria-hidden="true"
      ></span>
      {sourceLabel}
    </a>

    <button type="button" class="{pill} {extra}" onclick={() => palette.open()} aria-label="Search" aria-keyshortcuts="Meta+K Control+K">
      <Search class="size-4" aria-hidden="true" />
      <span class="hidden xl:inline">Search</span>
      <kbd class="hidden rounded border border-ws-line px-1 text-xs text-ws-soft xl:inline">⌘K</kbd>
    </button>

    <button type="button" class="{pill} sm:hidden" aria-expanded={more} onclick={() => (more = !more)}>
      {more ? "Less" : "More"}<ChevronDown class="size-4 transition-transform {more ? 'rotate-180' : ''}" aria-hidden="true" />
    </button>
  </div>
</div>
