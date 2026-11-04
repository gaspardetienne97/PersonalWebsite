<script lang="ts" module>
  export type StripPill = "metronome" | "tempo" | "count-in";
  let unused = $state.raw<readonly StripPill[]>([]);
  /** Call from a page's script: the strip leaves out these pills while the page is open (Create has its own tempo). */
  export function stripUnused(...pills: StripPill[]) {
    $effect(() => {
      unused = pills;
      return () => {
        if (unused === pills) unused = [];
      };
    });
  }
</script>

<script lang="ts">
  // The practice controls: instrument, metronome, tempo, count-in, tuning and
  // the live input source. Only what the page uses: hubs get the compact strip
  // (instrument, sound and input, search), untimed pages leave out the clock
  // controls. One row at every width; on a phone the secondary controls sit
  // behind "More" on a second row, and a run keeps only the beat, the click,
  // the tempo and sound.
  import * as Popover from "@repo/ui/popover";
  import Search from "lucide-svelte/icons/search";
  import Timer from "lucide-svelte/icons/timer";
  import Volume from "lucide-svelte/icons/volume-2";
  import VolumeOff from "lucide-svelte/icons/volume-off";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import KeyboardMusic from "lucide-svelte/icons/keyboard-music";
  import Mic from "lucide-svelte/icons/mic";
  import Pointer from "lucide-svelte/icons/pointer";
  import InputPanel from "./InputPanel.svelte";
  import { instrumentOptions } from "./instrument-icons";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { bench, INSTRUMENT_LABEL } from "../bench.svelte";
  import { audio, input, midi, mic, settings } from "../runtime";
  import { palette } from "./palette.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import TuningPicker from "$lib/music/drills/guitar/TuningPicker.svelte";
  import { tunings } from "$lib/music/drills/guitar/instrument.svelte";
  import { AEROPHONE_READING_KEYS } from "@repo/music-core/theory/transposition";

  const TEMPOS = [60, 72, 80, 90, 100, 120, 140];
  let previewing = $state(false);
  let preview: { stop(): void } | null = null;
  let more = $state(false);

  const s = $derived(settings.value);
  const soundLabel = $derived(s.muted ? "Sound off" : !audio.unlocked ? "Enable sound" : "");
  const midiPort = $derived(midi.enabled ? midi.inputs.find((p) => p.state === "connected" && !midi.profile(p.id)?.ignored) : undefined);
  const midiLive = $derived(!!midiPort);
  /** The input in words: the one last played, else what is ready (mic, then MIDI), else the screen. */
  const source = $derived.by(() => {
    const src = input.activeSource;
    const midiWord = `MIDI: ${(midiPort && (midi.profile(midiPort.id)?.alias || midiPort.name)) || "on"}`;
    if (src === "audio" || (src !== "midi" && src !== "onscreen" && mic.state === "on")) return { kind: "mic", word: "Mic on" } as const;
    if (src === "midi" || (src !== "onscreen" && midiLive)) return { kind: "midi", word: midiWord } as const;
    return { kind: "screen", word: "On-screen keys" } as const;
  });
  const fretted = $derived(s.activeInstrument === "guitar" || s.activeInstrument === "ukulele" ? s.activeInstrument : null);
  const tuningId = $derived(fretted === "ukulele" ? s.ukuleleTuningId : s.guitarTuningId);
  const tuningName = $derived(fretted ? tunings.pick(tuningId, fretted).name : "");
  const aeroKey = $derived(AEROPHONE_READING_KEYS.find((k) => k.id === s.aerophoneKey) ?? AEROPHONE_READING_KEYS[0]);

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

  // What this page shows. Compact: hubs and tools; clock: Metronome, Tempo and Count-in.
  const compact = $derived(bench.compact);
  const clock = $derived(bench.timed && !compact);
  const locked = $derived(bench.locked);
  const showMetronome = $derived(clock && !unused.includes("metronome"));
  const showTempo = $derived(clock && !unused.includes("tempo"));
  const showCountIn = $derived(clock && !unused.includes("count-in"));
  const showTuning = $derived(!compact && !!fretted);
  const showReads = $derived(!compact && s.activeInstrument === "aerophone");
  // A phone row without the tempo pill has room for Search; More is only for what is left.
  const searchInline = $derived(compact || !showTempo);
  const hasMore = $derived(showMetronome || showCountIn || showTuning || showReads || !searchInline);
  // Without Tempo and More a phone row has room for the sound pill's words.
  const roomy = $derived(!showTempo && !hasMore);
  $effect(() => {
    if (locked) more = false;
  });
  // Popovers render inside the app's root, where its colours are defined (as Picker's do).
  let root = $state<HTMLElement>();
  const portalTo = $derived(root?.closest<HTMLElement>(".woodshed") ?? undefined);
  const pill =
    "flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-3 text-sm disabled:opacity-60";
  /** Secondary controls: on a phone, on a second row behind More. */
  const extra = $derived(more ? "max-sm:order-1" : "max-sm:hidden");
  /** Left out of a phone's slim strip while a run counts in or plays. */
  const idle = $derived(locked ? "max-sm:hidden" : "");
</script>

<div bind:this={root} bind:offsetHeight={bench.stripH} class="sticky top-0 z-30 border-b border-ws-line bg-ws-bg/90 backdrop-blur">
  <!-- One row from sm up (scrolling only if it must), so pills that come and go never change the strip's height mid-click. -->
  <div class="flex flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap sm:overflow-x-auto sm:px-6 sm:[scrollbar-width:thin] lg:px-8" role="group" aria-label="Practice controls">
    {#if bench.instrumentFree}
      <span class="{pill} {idle} text-ws-soft" title="This page draws no instrument, so any one can play it. The picker comes back on the next page.">Any instrument</span>
    {:else}<div class="{pill.replace('border-ws-line bg-ws-surface', 'border-instr bg-instr-wash')} {idle} relative min-w-0 pr-2">
      <Picker
        class="-my-px min-h-11 w-auto min-w-0 pr-1 sm:min-w-28"
        tone="bare"
        label="Instrument"
        value={s.activeInstrument}
        disabled={locked}
        options={instrumentOptions((i) => INSTRUMENT_LABEL[i])}
        onchange={(v) => settings.update({ activeInstrument: v as Instrument })}
      />
    </div>{/if}

    {#if showMetronome}<button
      type="button"
      class="{pill} {locked ? '' : extra}"
      aria-pressed={bench.clickDuringRun}
      aria-label="Metronome click in runs"
      title={bench.clickDuringRun ? "Runs click. Tap to mute the click." : "Runs are silent. Tap to hear the click."}
      onclick={() => settings.update({ metronomeEnabled: !bench.clickDuringRun })}
    >
      <Timer class="size-4 {bench.clickDuringRun ? 'text-instr-ink' : 'text-ws-soft'}" aria-hidden="true" />
      <span class="whitespace-nowrap">{bench.clickDuringRun ? "Click on" : "Click off"}</span>
    </button>{/if}

    {#if showTempo}<Popover.Root>
      <Popover.Trigger class={pill} disabled={locked} aria-label="Tempo {s.bpm} BPM">
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
    </Popover.Root>{/if}

    {#if showCountIn}<Popover.Root>
      <Popover.Trigger class="{pill} {extra}" disabled={locked}>
        <span>Count-in</span>
        <span class="font-semibold">{s.countInBars === 0 ? "Off" : `${s.countInBars} bar${s.countInBars > 1 ? "s" : ""}`}</span>
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
    </Popover.Root>{/if}

    {#if showTuning && fretted}
      <Popover.Root>
        <Popover.Trigger class="{pill} {extra}" disabled={locked} aria-label="Tuning: {tuningName}">
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

    {#if showReads}
      <Popover.Root>
        <Popover.Trigger class="{pill} {extra}" disabled={locked} aria-label="Aerophone reads in {aeroKey.label}">
          <span>Reads in</span>
          <span class="font-semibold">{aeroKey.label}</span>
        </Popover.Trigger>
        <Popover.Content portalProps={{ to: portalTo }} class="w-72 border-ws-line bg-ws-surface text-ws-ink">
          <p class="text-sm font-medium">The Aerophone's reading key</p>
          <p class="mt-1 text-xs text-ws-soft">Set it to match the AE-20. Staffs and fingerings show the written note; it sends concert pitch either way.</p>
          <div class="mt-2 grid grid-cols-3 gap-1.5">
            {#each AEROPHONE_READING_KEYS as k (k.id)}
              <Popover.Close
                class="min-h-11 rounded-md border text-sm {k.id === aeroKey.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
                onclick={() => settings.update({ aerophoneKey: k.id })}>{k.label}</Popover.Close
              >
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
    {/if}

    <!-- The beat: the current one numbered inside its dot, so the count reads without colour. -->
    <span
      class="min-h-11 shrink-0 items-center gap-1 px-1 {locked && clock ? 'flex' : 'hidden'}"
      role="img"
      aria-label="{bench.countingIn ? 'Count-in, beat' : 'Beat'} {bench.beat || 1} of {bench.beatsPerBar}"
    >
      <!-- A phone row has no room for the word; the stage's count-in says it there, and the dots turn amber. -->
      {#if bench.countingIn}<span class="mr-1 text-sm font-medium text-ws-soft max-sm:hidden" aria-hidden="true">Count-in</span>{/if}
      {#each Array.from({ length: bench.beatsPerBar }, (_, i) => i + 1) as b (b)}
        <span class="grid size-5 place-items-center" aria-hidden="true">
          {#if bench.beat === b}
            <span
              class="ws-pulse grid size-5 place-items-center rounded-full text-[0.6875rem] leading-none font-bold text-ws-stage tnum {bench.countingIn ? 'bg-warn' : 'bg-instr'}"
              data-beat={b}>{b}</span
            >
          {:else}
            <span class="size-2 rounded-full bg-ws-line"></span>
          {/if}
        </span>
      {/each}
    </span>

    <span class="ml-auto max-sm:hidden"></span>

    <!-- Sound, MIDI and the microphone in one pill. Muted is flagged; sound waiting for a first tap only says so.
         A full phone row shows the speaker alone (slashed when silent): the words and devices are in the pop-up. -->
    <Popover.Root>
      <Popover.Trigger
        class="{pill} {s.muted ? 'border-warn' : ''} max-sm:ml-auto {roomy ? '' : 'max-sm:w-11 max-sm:justify-center max-sm:px-0'}"
        aria-label="Sound and input: {soundLabel ? soundLabel.toLowerCase() : 'sound on'}, MIDI {midiLive ? 'on' : midi.enabled ? 'on, no device' : 'off'}, microphone {mic.state === 'on' ? 'on' : 'off'}, playing from {source.word}"
      >
        <!-- Children stay mounted: the first tap unlocks sound, and swapping nodes mid-click would swallow the click that opens the pop-up. -->
        <VolumeOff class="size-4 {s.muted || !audio.unlocked ? '' : 'hidden'}" aria-hidden="true" /><Volume class="size-4 {s.muted || !audio.unlocked ? 'hidden' : ''}" aria-hidden="true" />
        <span class="whitespace-nowrap {soundLabel ? '' : 'hidden'} {roomy ? '' : 'max-sm:hidden'}">{soundLabel}</span>
        <!-- The input in words. A live device (MIDI, the mic) sits in a filled disc, the screen in an outlined one. -->
        <span class="items-center gap-1.5 {roomy && !soundLabel ? 'flex' : 'hidden sm:flex'} {soundLabel ? 'max-lg:hidden' : ''}">
          <span class="grid size-6 shrink-0 place-items-center rounded-full {source.kind === 'screen' ? 'border border-ws-line text-ws-soft' : 'bg-instr text-ws-stage'}" aria-hidden="true">
            {#if source.kind === "mic"}<Mic class="size-3.5" />{:else if source.kind === "midi"}<KeyboardMusic class="size-3.5" />{:else}<Pointer class="size-3.5" />{/if}
          </span>
          <span class="max-w-40 truncate whitespace-nowrap">{source.word}</span>
        </span>
        <ChevronDown class="hidden size-4 text-ws-soft sm:block" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content portalProps={{ to: portalTo }} class="max-h-[80vh] w-80 overflow-y-auto border-ws-line bg-ws-surface text-ws-ink">
        <InputPanel />
      </Popover.Content>
    </Popover.Root>

    <!-- Words only on the widest screens, so the row never clips beside the sidebar. -->
    <button type="button" class="{pill} {searchInline ? idle : extra} max-2xl:w-11 max-2xl:justify-center max-2xl:px-0" onclick={() => palette.open()} aria-label="Search" title="Search (⌘K)" aria-keyshortcuts="Meta+K Control+K">
      <Search class="size-4" aria-hidden="true" />
      <span class="hidden 2xl:inline">Search</span>
      <kbd class="hidden rounded border border-ws-line px-1 text-xs text-ws-soft 2xl:inline">⌘K</kbd>
    </button>

    {#if hasMore && !locked}
      <button type="button" class="{pill} sm:hidden" aria-expanded={more} onclick={() => (more = !more)}>
        {more ? "Less" : "More"}
      </button>
    {/if}
  </div>
</div>
