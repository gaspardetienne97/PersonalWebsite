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
  import { m } from "@repo/i18n/messages.js";
  // The practice controls: instrument, metronome, tempo, count-in, tuning and
  // the live input source. Only what the page uses: hubs get the compact strip
  // (instrument, sound and input, search), untimed pages leave out the clock
  // controls. One row at every width, never wrapping: on a phone the secondary
  // controls open from "More" as a panel under the strip, and a run keeps only
  // the beat, the click, the tempo and sound. A drill session leaves the strip
  // out (its HUD carries the beat and the click).
  import * as Popover from "@repo/ui/popover";
  import Search from "@lucide/svelte/icons/search";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Cable from "@lucide/svelte/icons/cable";
  import Timer from "@lucide/svelte/icons/timer";
  import Volume from "@lucide/svelte/icons/volume-2";
  import VolumeOff from "@lucide/svelte/icons/volume-off";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import KeyboardMusic from "@lucide/svelte/icons/keyboard-music";
  import Mic from "@lucide/svelte/icons/mic";
  import Pointer from "@lucide/svelte/icons/pointer";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import InputPanel from "./InputPanel.svelte";
  import { instrumentOptions } from "./instrument-icons";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { bench, INSTRUMENT_LABEL } from "../bench.svelte";
  import { audio, input, midi, mic, settings } from "../runtime";
  import { palette } from "./palette.svelte";
  import { onDestroy } from "svelte";
  import Picker from "#lib/music/components/Picker.svelte";
  import TuningPicker from "#lib/music/drills/guitar/TuningPicker.svelte";
  import { tunings } from "#lib/music/drills/guitar/instrument.svelte.ts";
  import { AEROPHONE_READING_KEYS } from "@repo/music-core/theory/transposition";
  import { keyName } from "#lib/music/names.svelte.ts";
  import { page } from "$app/state";

  const TEMPOS = [60, 72, 80, 90, 100, 120, 140];
  let previewing = $state(false);
  let preview: { stop(): void } | null = null;
  let more = $state(false);

  const s = $derived(settings.value);
  // Sound starts on the first tap or key anywhere, so nothing is flagged until a sound was actually held back.
  const soundLabel = $derived(s.muted ? m.music_shell_strip_sound_off() : audio.blocked && !audio.unlocked ? m.music_shell_strip_tap_for_sound() : "");
  const soundOff = $derived(s.muted || (audio.blocked && !audio.unlocked));
  const midiPort = $derived(midi.enabled ? midi.inputs.find((p) => p.state === "connected" && !midi.profile(p.id)?.ignored) : undefined);
  const midiLive = $derived(!!midiPort);
  /** The input in words: the one last played, else what is ready (mic, then MIDI), else the screen. */
  const source = $derived.by(() => {
    const src = input.activeSource;
    const midiWord = m.music_shell_strip_midi_name({ name: (midiPort && (midi.profile(midiPort.id)?.alias || midiPort.name)) || m.music_shell_input_state_on() });
    if (src === "audio" || (src !== "midi" && src !== "onscreen" && mic.state === "on")) return { kind: "mic", word: m.music_shell_strip_mic_on() } as const;
    if (src === "midi" || (src !== "onscreen" && midiLive)) return { kind: "midi", word: midiWord } as const;
    return { kind: "screen", word: m.music_shell_strip_onscreen() } as const;
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
  const inputWord = $derived(source.kind === "mic" ? m.music_shell_strip_word_mic() : source.kind === "midi" ? "MIDI" : midi.enabled ? m.music_shell_strip_word_no_midi() : m.music_shell_strip_word_midi_off());
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
  // Tuner and Connect took the room a phone row had for the sound pill's words: the instrument's name gives way first.
  const roomy = false;
  $effect(() => {
    if (locked) more = false;
  });
  // Popovers render inside the app's root, where its colours are defined (as Picker's do).
  let root = $state<HTMLElement>();
  const portalTo = $derived(root?.closest<HTMLElement>(".woodshed") ?? undefined);
  const pill =
    "flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-3 text-sm disabled:opacity-60";
  /** A label word that steps aside (still read out) where a clocked strip is narrower than its pills. */
  const terse = "sm:@max-[76rem]:sr-only";
  /** The same on a narrower strip still (a 1024 px tablet beside the sidebar): the tempo's unit and the count-in's label. */
  const terser = "sm:@max-[52rem]:sr-only";
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

<div bind:this={root} bind:offsetHeight={bench.stripH} class="ws-bar @container sticky top-0 z-30 border-b">
  <!-- One row at every width (scrolling from sm up only if it must), so pills that come and go never change the strip's height mid-click.
       From sm up no pill shrinks (a squeezed pill let its name spill over the next one): where the strip is narrow
       (a laptop or tablet beside the sidebar) the pills drop their label words instead and keep the value. -->
  <div class="flex flex-nowrap items-center gap-1.5 px-4 py-2 sm:gap-2 sm:overflow-x-auto sm:px-6 sm:[scrollbar-width:thin] lg:px-8" role="group" aria-label={m.music_shell_strip_controls()}>
    <!-- A drill that draws no instrument (answer buttons, taps) leaves the picker out. -->
    {#if !bench.instrumentFree && !quiet}<!-- The row never wraps: on a narrow phone the input's name gives way (whole in its pop-up); without it, the
         instrument's does (whole in its picker), so nothing spills over the page. -->
    <div class="{pill.replace('border-ws-line bg-ws-surface', 'border-instr bg-instr-wash').replace('shrink-0', roomy ? 'shrink-0' : 'shrink sm:shrink-0')} {idle} relative min-w-0 pr-2">
      <Picker
        class="-my-px min-h-11 w-auto min-w-0 pr-1 sm:min-w-28"
        tone="bare"
        label={m.music_shell_strip_instrument()}
        value={s.activeInstrument}
        disabled={locked}
        options={instrumentOptions((i) => INSTRUMENT_LABEL[i])}
        onchange={(v) => settings.update({ activeInstrument: v as Instrument })}
      />
    </div>{/if}

    {#if showTempo}<Popover.Root>
      <Popover.Trigger class={pill} disabled={locked} aria-label={m.music_shell_strip_tempo_label({ bpm: s.bpm })}>
        <span class="tnum font-display text-base font-semibold">{s.bpm}</span>
        <span class="text-ws-soft {terser}">BPM</span>
      </Popover.Trigger>
      <Popover.Content portalProps={{ to: portalTo }} class="w-64 border-ws-line bg-ws-surface text-ws-ink">
        <label class="flex items-center justify-between gap-3 text-sm font-medium">
          {m.music_shell_strip_tempo()}
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
          <Timer class="size-4" aria-hidden="true" />{previewing ? m.music_shell_strip_stop_click() : m.music_shell_strip_hear_click()}
        </button>
      </Popover.Content>
    </Popover.Root>{/if}

    <!-- Secondary controls: inline from sm up, a panel under the strip on a phone (More). -->
    <div id="strip-more" class="{extras} sm:contents">
      {#if showMetronome}<button
        type="button"
        class={pill}
        aria-pressed={bench.clickDuringRun}
        aria-label={m.music_shell_shell_click_label()}
        title={bench.clickDuringRun ? m.music_shell_shell_click_on() : m.music_shell_shell_click_off()}
        onclick={() => settings.update({ metronomeEnabled: !bench.clickDuringRun })}
      >
        <Timer class="size-4 {bench.clickDuringRun ? 'text-instr-ink' : 'text-ws-soft'}" aria-hidden="true" />
        <span class="whitespace-nowrap"><span class={terse}>{m.music_shell_strip_metronome()}</span> <span class="font-semibold">{bench.clickDuringRun ? m.music_shell_input_state_on() : m.music_shell_input_state_off()}</span></span>
      </button>{/if}

      {#if showCountIn}<Popover.Root>
        <Popover.Trigger class="{pill} {idle}" disabled={locked} title={m.music_shell_strip_countin_title()}>
          <span class="whitespace-nowrap"><span class={terser}>{m.music_shell_strip_countin()}</span> <span class="font-semibold">{s.countInBars === 0 ? m.music_shell_strip_countin_off() : m.music_shell_strip_bars({ count: s.countInBars })}</span></span>
          <ChevronDown class="size-4 text-ws-soft" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Content portalProps={{ to: portalTo }} class="w-60 border-ws-line bg-ws-surface text-ws-ink">
          <p class="text-sm font-medium">{m.music_shell_strip_countin_title()}</p>
          <div class="mt-2 grid grid-cols-3 gap-1.5">
            {#each [0, 1, 2] as const as n (n)}
              <Popover.Close
                class="min-h-11 rounded-md border text-sm {n === s.countInBars ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
                onclick={() => settings.update({ countInBars: n })}>{n === 0 ? m.music_shell_strip_countin_off_option() : m.music_shell_strip_bars({ count: n })}</Popover.Close
              >
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>{/if}

      {#if showTuning && fretted}
        <Popover.Root>
          <Popover.Trigger class="{pill} {idle}" disabled={locked} aria-label={m.music_shell_strip_tuning_label({ name: tuningName })}>
            <span class={terse}>{m.music_shell_strip_tuning()}</span>
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
          <Popover.Trigger class="{pill} {idle}" disabled={locked} aria-label={m.music_shell_strip_aero_label({ key: keyName(aeroKey.label) })} title={m.music_shell_strip_aero_title()}>
            <span class={terse}>{m.music_shell_strip_written_in()}</span>
            <span class="font-semibold">{keyName(aeroKey.label)}</span>
            <ChevronDown class="size-4 text-ws-soft" aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Content portalProps={{ to: portalTo }} class="w-72 border-ws-line bg-ws-surface text-ws-ink">
            <p class="text-sm font-medium">{m.music_shell_strip_aero_heading()}</p>
            <p class="mt-1 text-[13px] text-ws-soft">{m.music_shell_strip_aero_help()}</p>
            <div class="mt-2 grid grid-cols-3 gap-1.5">
              {#each AEROPHONE_READING_KEYS as k (k.id)}
                <Popover.Close
                  class="min-h-11 rounded-md border text-sm {k.id === aeroKey.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
                  onclick={() => settings.update({ aerophoneKey: k.id })}>{keyName(k.label)}</Popover.Close
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
      aria-label={(bench.countingIn ? m.music_shell_shell_countin_beat_label : m.music_shell_shell_beat_label)({ beat: bench.beat || 1, total: bench.beatsPerBar })}
    >
      <!-- A phone row has no room for the word; the stage's count-in says it there, and the dots turn amber. -->
      <span class="mr-1 text-sm font-medium text-ws-soft max-sm:hidden" aria-hidden="true">{bench.countingIn ? m.music_shell_shell_countin() : m.music_shell_strip_beat()}</span>
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
        aria-label={m.music_shell_strip_sound_input({
          sound: soundLabel ? soundLabel.toLowerCase() : m.music_shell_strip_sound_on(),
          midi: midiLive ? m.music_shell_input_state_on() : midi.enabled ? m.music_shell_strip_on_no_device() : m.music_shell_input_state_off(),
          mic: mic.state === "on" ? m.music_shell_input_state_on() : m.music_shell_input_state_off(),
          source: source.word,
        })}
      >
        <!-- Children stay mounted: the first tap unlocks sound, and swapping nodes mid-click would swallow the click that opens the pop-up. -->
        <VolumeOff class="size-4 {soundOff ? '' : 'hidden'}" aria-hidden="true" /><Volume class="size-4 {soundOff ? 'hidden' : ''}" aria-hidden="true" />
        <span class="whitespace-nowrap {soundLabel ? '' : 'hidden'} {roomy ? '' : 'max-sm:hidden'}">{soundLabel}</span>
        <!-- The input in words. A live device (MIDI, the mic) sits in a filled disc, the screen in an outlined one. -->
        <span class="min-w-0 items-center gap-1.5 {roomy && !soundLabel ? 'flex' : 'hidden sm:flex'} {soundLabel ? 'max-lg:hidden' : ''}">
          <span class="grid size-6 shrink-0 place-items-center rounded-full {source.kind === 'screen' ? 'border border-ws-line text-ws-soft' : 'bg-instr text-ws-stage'}" aria-hidden="true">
            {#if source.kind === "mic"}<Mic class="size-3.5" />{:else if source.kind === "midi"}<KeyboardMusic class="size-3.5" />{:else}<Pointer class="size-3.5" />{/if}
          </span>
          <span class="whitespace-nowrap max-sm:sr-only {clock ? terse : ''}">{source.word}</span>
        </span>
        <!-- A phone's slim pill: the input's state in one word beside the speaker. A hub plays nothing, so there the
             speaker stands alone and the instrument keeps its whole name beside Tuner, Connect and Search. -->
        <span class="whitespace-nowrap {compact ? 'hidden' : 'sm:hidden'}" aria-hidden="true">{inputWord}</span>
        <ChevronDown class="hidden size-4 text-ws-soft sm:block" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content portalProps={{ to: portalTo }} class="max-h-[80vh] w-80 overflow-y-auto border-ws-line bg-ws-surface text-ws-ink">
        <InputPanel />
      </Popover.Content>
    </Popover.Root>{/if}

    {#if searchInline}{@render search("")}{/if}

    {#if hasMore && !locked}
      <!-- A round icon button like Search, so a phone row keeps the instrument's whole name beside a three-digit tempo. -->
      <button type="button" class="{pill} w-11 justify-center px-0 aria-expanded:border-instr aria-expanded:bg-instr-wash sm:hidden" aria-label={more ? m.music_shell_strip_less() : m.music_shell_nav_more()} title={more ? m.music_shell_strip_fewer_controls() : m.music_shell_strip_more_controls()} aria-expanded={more} aria-controls="strip-more" onclick={() => (more = !more)}>
        <Ellipsis class="size-4" aria-hidden="true" />
      </button>
    {/if}
  </div>
</div>

<!-- Words only on the widest screens, so the row never clips beside the sidebar. -->
{#snippet search(cls: string)}
  <!-- Tuner and Connect: two tools wanted from any page, so they ride beside Search. -->
  {#each [{ href: "/music/tuner", label: m.music_shell_search_tuner(), Icon: Gauge }, { href: "/music/connect", label: m.music_shell_nav_connect(), Icon: Cable }] as tool (tool.href)}
    <a href={tool.href} class="{pill} {idle} {cls} w-11 justify-center px-0 aria-[current=page]:border-instr aria-[current=page]:bg-instr-wash" aria-label={tool.label} title={tool.label} aria-current={page.url.pathname.startsWith(tool.href) ? "page" : undefined}>
      <tool.Icon class="size-4" aria-hidden="true" />
    </a>
  {/each}
  <button type="button" class="{pill} {idle} {cls} max-2xl:w-11 max-2xl:justify-center max-2xl:px-0" onclick={() => palette.open()} aria-label={m.music_shell_catalog_search()} title={m.music_shell_strip_search_title()} aria-keyshortcuts="Meta+K Control+K">
    <Search class="size-4" aria-hidden="true" />
    <span class="hidden 2xl:inline">{m.music_shell_catalog_search()}</span>
    <kbd class="hidden rounded border border-ws-line px-1 text-[13px] text-ws-soft 2xl:inline">⌘K</kbd>
  </button>
{/snippet}
