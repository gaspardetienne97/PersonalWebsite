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
  // controls. One row at every width, never wrapping: on a phone the secondary
  // controls open from "More" as a panel under the strip, and a run keeps only
  // the beat, the click, the tempo and sound. A drill session leaves the strip
  // out (its HUD carries the beat and the click).
  import * as Popover from "@repo/ui/popover";
  import Search from "lucide-svelte/icons/search";
  import Timer from "lucide-svelte/icons/timer";
  import Volume from "lucide-svelte/icons/volume-2";
  import VolumeOff from "lucide-svelte/icons/volume-off";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import KeyboardMusic from "lucide-svelte/icons/keyboard-music";
  import Mic from "lucide-svelte/icons/mic";
  import Pointer from "lucide-svelte/icons/pointer";
  import Ellipsis from "lucide-svelte/icons/ellipsis";
  import InputPanel from "./InputPanel.svelte";
  import { instrumentOptions } from "./instrument-icons";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { bench, INSTRUMENT_LABEL } from "../bench.svelte";
  import { audio, input, midi, mic, settings } from "../runtime";
  import { palette } from "./palette.svelte";
  import { onDestroy } from "svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import TuningPicker from "$lib/music/drills/guitar/TuningPicker.svelte";
  import { tunings } from "$lib/music/drills/guitar/instrument.svelte";
  import { AEROPHONE_READING_KEYS } from "@repo/music-core/theory/transposition";
  import { page } from "$app/state";

  const TEMPOS = [60, 72, 80, 90, 100, 120, 140];
  let previewing = $state(false);
  let preview: { stop(): void } | null = null;
  let more = $state(false);

  const s = $derived(settings.value);
  // Sound starts on the first tap or key anywhere, so nothing is flagged until a sound was actually held back.
  const soundLabel = $derived(s.muted ? "Sound off" : audio.blocked && !audio.unlocked ? "Tap for sound" : "");
  const soundOff = $derived(s.muted || (audio.blocked && !audio.unlocked));
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
  // A session takes the strip off screen: the preview click goes with it.
  onDestroy(() => {
    if (previewing) stopPreview();
  });

  // Pages that play nothing (the journal, progress, settings, the guide) leave out the instrument and input pills
  // (the sound pill stays while sound is off, so the way back on is one tap anywhere).
  const QUIET = ["/music/journal", "/music/progress", "/music/settings", "/music/guide"];
  const quiet = $derived(QUIET.some((r) => page.url.pathname === r || page.url.pathname.startsWith(r + "/")));
  /** The input in one short word for a phone's icon pill. */
  const inputWord = $derived(source.kind === "mic" ? "Mic" : source.kind === "midi" ? "MIDI" : midi.enabled ? "No MIDI" : "MIDI off");
  // What this page shows. Compact: hubs and tools; clock: Metronome, Tempo and Count-in.
  const compact = $derived(bench.compact);
  // A drill says itself whether it runs a clock; other pages follow the layout's route list.
  const clock = $derived((bench.clocked ?? bench.timed) && !compact);
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
  /** Left out of a phone's slim strip while a run counts in or plays. */
  const idle = $derived(locked ? "max-sm:hidden" : "");
  /** The secondary controls: inline from sm up; on a phone a panel under the strip that More opens (the row
   *  never wraps, so the strip keeps its height). While a run is live a phone keeps only the click inline. */
  const extras = $derived(
    locked
      ? "max-sm:contents"
      : more
        ? "max-sm:absolute max-sm:inset-x-0 max-sm:top-full max-sm:flex max-sm:flex-wrap max-sm:gap-2 max-sm:border-b max-sm:border-ws-line max-sm:bg-ws-bg max-sm:px-4 max-sm:py-2"
        : "max-sm:hidden",
  );
</script>

<div bind:this={root} bind:offsetHeight={bench.stripH} class="ws-bar sticky top-0 z-30 border-b">
  <!-- One row at every width (scrolling from sm up only if it must), so pills that come and go never change the strip's height mid-click. -->
  <div class="flex flex-nowrap items-center gap-1.5 px-4 py-2 sm:gap-2 sm:overflow-x-auto sm:px-6 sm:[scrollbar-width:thin] lg:px-8" role="group" aria-label="Practice controls">
    <!-- A drill that draws no instrument (answer buttons, taps) leaves the picker out. -->
    {#if !bench.instrumentFree && !quiet}<!-- The row never wraps: on a narrow phone the input's name gives way (whole in its pop-up); without it, the
         instrument's does (whole in its picker), so nothing spills over the page. -->
    <div class="{pill.replace('border-ws-line bg-ws-surface', 'border-instr bg-instr-wash').replace('shrink-0', roomy ? 'shrink-0' : 'shrink')} {idle} relative min-w-0 pr-2">
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

    <!-- Secondary controls: inline from sm up, a panel under the strip on a phone (More). -->
    <div id="strip-more" class="{extras} sm:contents">
      {#if showMetronome}<button
        type="button"
        class={pill}
        aria-pressed={bench.clickDuringRun}
        aria-label="Metronome click in runs"
        title={bench.clickDuringRun ? "Runs click. Tap to mute the click." : "Runs are silent. Tap to hear the click."}
        onclick={() => settings.update({ metronomeEnabled: !bench.clickDuringRun })}
      >
        <Timer class="size-4 {bench.clickDuringRun ? 'text-instr-ink' : 'text-ws-soft'}" aria-hidden="true" />
        <span class="whitespace-nowrap">Metronome: <span class="font-semibold">{bench.clickDuringRun ? "on" : "off"}</span></span>
      </button>{/if}

      {#if showCountIn}<Popover.Root>
        <Popover.Trigger class="{pill} {idle}" disabled={locked}>
          <span class="whitespace-nowrap">Count-in: <span class="font-semibold">{s.countInBars === 0 ? "off" : `${s.countInBars} bar${s.countInBars > 1 ? "s" : ""}`}</span></span>
          <ChevronDown class="size-4 text-ws-soft" aria-hidden="true" />
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
          <Popover.Trigger class="{pill} {idle}" disabled={locked} aria-label="Tuning: {tuningName}">
            <span>Tuning</span>
            <span class="font-semibold">{tuningName}</span>
            <ChevronDown class="size-4 text-ws-soft" aria-hidden="true" />
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
          <Popover.Trigger class="{pill} {idle}" disabled={locked} aria-label="Aerophone written in {aeroKey.label}" title="The written key; the Aerophone sends concert pitch">
            <span>Written in</span>
            <span class="font-semibold">{aeroKey.label}</span>
            <ChevronDown class="size-4 text-ws-soft" aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Content portalProps={{ to: portalTo }} class="w-72 border-ws-line bg-ws-surface text-ws-ink">
            <p class="text-sm font-medium">The Aerophone's reading key</p>
            <p class="mt-1 text-[13px] text-ws-soft">Set it to match the AE-20. Staffs and fingerings show the written note; it sends concert pitch either way.</p>
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
      {#if !searchInline}{@render search("sm:order-last")}{/if}
    </div>

    <!-- The beat: the current one numbered inside its dot, so the count reads without colour. -->
    <span
      class="min-h-11 shrink-0 items-center gap-1 px-1 {locked && clock ? 'flex' : 'hidden'}"
      role="img"
      aria-label="{bench.countingIn ? 'Count-in, beat' : 'Beat'} {bench.beat || 1} of {bench.beatsPerBar}"
    >
      <!-- A phone row has no room for the word; the stage's count-in says it there, and the dots turn amber. -->
      <span class="mr-1 text-sm font-medium text-ws-soft max-sm:hidden" aria-hidden="true">{bench.countingIn ? "Count-in" : "Beat"}</span>
      {#each Array.from({ length: bench.beatsPerBar }, (_, i) => i + 1) as b (b)}
        <span class="grid size-6 place-items-center" aria-hidden="true">
          {#if bench.beat === b}
            <span
              class="ws-pulse grid size-6 place-items-center rounded-full text-[13px] leading-none font-bold text-ws-stage tnum {bench.countingIn ? 'bg-warn' : 'bg-instr'}"
              data-beat={b}>{b}</span
            >
          {:else}
            <span class="size-3 rounded-full bg-ws-soft"></span>
          {/if}
        </span>
      {/each}
    </span>

    <span class="ml-auto max-sm:hidden"></span>

    <!-- Sound, MIDI and the microphone in one pill. Muted is flagged; sound waiting for a first tap only says so.
         A full phone row shows the speaker alone (slashed when silent): the words and devices are in the pop-up. -->
    {#if quiet && !soundOff}<span class="ml-auto"></span>{:else}<Popover.Root>
      <Popover.Trigger
        class="{roomy ? pill.replace('shrink-0', 'min-w-0 shrink-[20]') : pill} {s.muted ? 'border-warn' : ''} max-sm:ml-auto {roomy ? '' : 'max-sm:px-2.5'}"
        aria-label="Sound and input: {soundLabel ? soundLabel.toLowerCase() : 'sound on'}, MIDI {midiLive ? 'on' : midi.enabled ? 'on, no device' : 'off'}, microphone {mic.state === 'on' ? 'on' : 'off'}, playing from {source.word}"
      >
        <!-- Children stay mounted: the first tap unlocks sound, and swapping nodes mid-click would swallow the click that opens the pop-up. -->
        <VolumeOff class="size-4 {soundOff ? '' : 'hidden'}" aria-hidden="true" /><Volume class="size-4 {soundOff ? 'hidden' : ''}" aria-hidden="true" />
        <span class="whitespace-nowrap {soundLabel ? '' : 'hidden'} {roomy ? '' : 'max-sm:hidden'}">{soundLabel}</span>
        <!-- The input in words. A live device (MIDI, the mic) sits in a filled disc, the screen in an outlined one. -->
        <span class="min-w-0 items-center gap-1.5 {roomy && !soundLabel ? 'flex' : 'hidden sm:flex'} {soundLabel ? 'max-lg:hidden' : ''}">
          <span class="grid size-6 shrink-0 place-items-center rounded-full {source.kind === 'screen' ? 'border border-ws-line text-ws-soft' : 'bg-instr text-ws-stage'}" aria-hidden="true">
            {#if source.kind === "mic"}<Mic class="size-3.5" />{:else if source.kind === "midi"}<KeyboardMusic class="size-3.5" />{:else}<Pointer class="size-3.5" />{/if}
          </span>
          <span class="whitespace-nowrap max-sm:sr-only">{source.word}</span>
        </span>
        <!-- A phone's slim pill: the input's state in one word beside the speaker. -->
        <span class="whitespace-nowrap sm:hidden" aria-hidden="true">{inputWord}</span>
        <ChevronDown class="hidden size-4 text-ws-soft sm:block" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content portalProps={{ to: portalTo }} class="max-h-[80vh] w-80 overflow-y-auto border-ws-line bg-ws-surface text-ws-ink">
        <InputPanel />
      </Popover.Content>
    </Popover.Root>{/if}

    {#if searchInline}{@render search("")}{/if}

    {#if hasMore && !locked}
      <!-- A round icon button like Search, so a phone row keeps the instrument's whole name beside a three-digit tempo. -->
      <button type="button" class="{pill} w-11 justify-center px-0 aria-expanded:border-instr aria-expanded:bg-instr-wash sm:hidden" aria-label={more ? "Less" : "More"} title={more ? "Fewer controls" : "More controls"} aria-expanded={more} aria-controls="strip-more" onclick={() => (more = !more)}>
        <Ellipsis class="size-4" aria-hidden="true" />
      </button>
    {/if}
  </div>
</div>

<!-- Words only on the widest screens, so the row never clips beside the sidebar. -->
{#snippet search(cls: string)}
  <button type="button" class="{pill} {idle} {cls} max-2xl:w-11 max-2xl:justify-center max-2xl:px-0" onclick={() => palette.open()} aria-label="Search" title="Search (⌘K)" aria-keyshortcuts="Meta+K Control+K">
    <Search class="size-4" aria-hidden="true" />
    <span class="hidden 2xl:inline">Search</span>
    <kbd class="hidden rounded border border-ws-line px-1 text-[13px] text-ws-soft 2xl:inline">⌘K</kbd>
  </button>
{/snippet}
