<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The rig at a glance: one tile per input the app knows, lit while it is
  // connected and flashing with each note it sends, so "play a note" is the
  // test. Notes are read after the router, so an ignored port or the wrong
  // channel stays dark here exactly as it would in a drill.
  import type { Snippet } from "svelte";
  import { detectInstrument } from "@repo/music-core/io/devices";
  import Cable from "@lucide/svelte/icons/cable";
  import Check from "@lucide/svelte/icons/check";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";
  import { INSTRUMENT_ICON } from "#lib/music/components/instrument-icons.ts";
  import { input, midi, mic, settings } from "#lib/music/runtime/index.ts";
  import { hitLabel, inputName, tileFor, type RigTile } from "./rig";
  import { noteName } from "@repo/music-core";
  import MicCheck from "./MicCheck.svelte";

  type Next = { label: string; hint: string; act?: { label: string; href?: string; run?: () => void } };
  let {
    announce,
    fallback,
    next,
  }: { announce: (text: string) => void; fallback?: Snippet<[boolean]>; next?: Next } = $props();
  let moreOpen = $state(false);
  const micNext = $derived(!!next && next.act?.href === "#mic");

  const TILES = [
    { id: "keyboard", label: m.music_hubs_rig_keyboard(), hue: "piano", prompt: m.music_hubs_rig_play_key() },
    { id: "mpc", label: m.music_hubs_rig_mpc(), hue: "mpc", prompt: m.music_hubs_rig_hit_pad() },
    { id: "aerophone", label: "Aerophone", hue: "aerophone", prompt: m.music_hubs_rig_play_note() },
  ] as const;

  const live = $derived(
    midi.inputs.filter((p) => p.state !== "disconnected" && !midi.profile(p.id)?.ignored),
  );
  const portsOn = (t: RigTile) =>
    live.filter((p) => tileFor(midi.profile(p.id)?.instrument ?? detectInstrument(p.name, p.manufacturer)) === t);
  const litCount = $derived(TILES.filter((t) => portsOn(t.id).length).length + (mic.state === "on" ? 1 : 0));

  // The last note each tile received; `n` replays the flash on every hit.
  let last = $state<Partial<Record<RigTile, { label: string; port: string; n: number; midi: number }>>>({});
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind !== "noteon" || e.source !== "midi") return;
      const t = tileFor(e.instrument);
      const port = live.find((p) => p.id === e.deviceId);
      last[t] = { label: hitLabel(t, e.midi), port: port ? (midi.profile(port.id)?.alias ?? port.name) : "", n: (last[t]?.n ?? 0) + 1, midi: e.midi };
    }),
  );

  function status(t: RigTile) {
    if (!midi.supported) return m.music_hubs_rig_no_midi();
    if (!midi.enabled) return m.music_hubs_rig_midi_off();
    const on = portsOn(t);
    if (!on.length) return m.music_hubs_rig_plug_in();
    const name = midi.profile(on[0].id)?.alias ?? on[0].name;
    return on.length > 1 ? m.music_hubs_rig_and_more({ name, count: on.length - 1 }) : name;
  }
  const micName = $derived(inputName(settings.value.audioInputDeviceId, settings.value.audioInputLabel));
</script>

<section class="flex flex-col gap-4 rounded-2xl border border-ws-line bg-ws-surface p-4 sm:p-5" aria-labelledby="rig-title">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <h2 id="rig-title" class="flex items-center gap-2.5 font-display text-xl font-semibold">
        <span class="grid size-9 shrink-0 place-items-center rounded-xl text-ws-stage" style:background="var(--hue-create)" aria-hidden="true"><Cable class="size-5" /></span>
        {m.music_hubs_rig_title()}
      </h2>
      <!-- One status line: how many are live and what to do next. -->
      <p class="mt-1 text-sm" data-testid="rig-count">
        <span class="tnum font-semibold">{m.music_hubs_rig_count({ n: litCount })}</span>
        <span class="text-ws-soft"
          >{m.music_hubs_rig_inputs()}{midi.enabled && !midi.sysexEnabled ? m.music_hubs_rig_lights_off() : ""}. {!midi.supported
            ? ""
            : !midi.enabled
              ? m.music_hubs_rig_turn_on_hint()
              : micNext
                ? m.music_hubs_rig_next_mic()
                : m.music_hubs_rig_play_something()}</span
        >
      </p>
    </div>
    {#if midi.supported}
      {#if midi.enabled}
        <!-- Rarely needed, so it waits behind a small overflow button. -->
        <div class="flex items-center gap-2">
          {#if moreOpen}
            <button type="button" class={btn} onclick={() => (midi.disable(), (moreOpen = false), announce(m.music_hubs_rig_midi_off_page()))}>{m.music_hubs_rig_turn_off()}</button>
          {/if}
          <button
            type="button"
            class="grid size-11 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
            aria-label={m.music_hubs_rig_more_midi()}
            aria-expanded={moreOpen}
            onclick={() => (moreOpen = !moreOpen)}><Ellipsis class="size-5" aria-hidden="true" /></button
          >
        </div>
      {:else}
        <button type="button" class="{btnPrimary} min-h-12 px-6 text-base max-sm:w-full" onclick={async () => announce((await midi.enable()) ? m.music_hubs_rig_midi_on() : midi.error)}>{m.music_hubs_rig_turn_on()}</button>
      {/if}
    {/if}
  </div>
  {#if !midi.supported}<p class="text-sm">{m.music_hubs_rig_unsupported()}</p>{/if}
  {#if midi.error}<p class="text-sm font-medium text-destructive">{midi.error}</p>{/if}

  {@render tiles()}

  {#if midi.supported && !midi.enabled}
    <details class="group -my-2 text-sm">
      <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-instr-ink [&::-webkit-details-marker]:hidden">
        {m.music_hubs_rig_why_twice()}<ChevronDown class="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <p class="text-ws-soft">{m.music_hubs_rig_why_twice_body()}</p>
    </details>
  {/if}

  <!-- The one setup step still to do, as this card's main action (the checklist mirrors it). -->
  {#if next && midi.enabled && !micNext}
    <div class="flex flex-wrap items-center gap-3 rounded-xl bg-instr-wash p-3">
      <div class="min-w-0 flex-1 basis-48">
        <p class="font-semibold">{m.music_hubs_rig_next_step()}</p>
        <p class="text-sm">{next.hint}</p>
      </div>
      {#if next.act}
        {#if next.act.href}
          <a class={btnPrimary} href={next.act.href}>{next.act.label}</a>
        {:else}
          <button type="button" class={btnPrimary} onclick={next.act.run}>{next.act.label}</button>
        {/if}
      {/if}
    </div>
  {/if}

  {@render micPanel()}

  {@render fallback?.(litCount > 0)}
</section>

<!-- The four inputs in one row under the heading, each with what it last heard: the proof sits in the first screen. -->
{#snippet tiles()}
  <ul class="grid gap-2 sm:grid-cols-4 sm:gap-3 {midi.enabled ? '' : 'max-sm:grid-cols-2'}">
    {#each TILES as t (t.id)}
      {@const lit = portsOn(t.id).length > 0}
      {@const hit = last[t.id]}
      {@const Icon = INSTRUMENT_ICON[t.hue]}
      <li class="tile flex min-w-0 items-center gap-3 rounded-2xl p-3 sm:flex-col sm:gap-1 sm:text-center {midi.enabled ? '' : 'max-sm:p-2'}" data-lit={lit || undefined} style:--instr="var(--hue-{t.hue})" data-testid="rig-{t.id}">
        <span class="chip relative grid size-11 shrink-0 place-items-center rounded-xl" aria-hidden="true">
          <Icon class="size-5" />
          {#if hit}{#key hit.n}<span class="bloom absolute inset-0 rounded-xl"></span>{/key}{/if}
        </span>
        <div class="min-w-0 flex-1 sm:w-full sm:flex-none">
          <h3 class="font-semibold sm:text-base {midi.enabled ? '' : 'max-sm:text-sm'}">{t.label}</h3>
          <p class="w-full text-[13px] text-ws-soft {midi.enabled ? '' : 'max-sm:sr-only'}">{status(t.id)}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end sm:items-center" aria-live="polite">
          {#if hit && lit}
            <span class="flex items-center gap-1 text-[13px] font-medium text-success"><Check class="size-3.5" aria-hidden="true" />{m.music_hubs_rig_heard()}</span>
            <span class="tnum font-display text-2xl leading-none font-semibold sm:text-3xl">{hit.label}</span>
            {#if t.id !== "mpc"}{@render octave(hit.midi)}{/if}
          {:else if lit}
            <span class="text-sm text-ws-soft">{t.prompt}</span>
          {/if}
        </div>
      </li>
    {/each}
    <!-- The microphone is the fourth input: same tile, lit while it listens, with the note it hears. -->
    <li class="tile flex min-w-0 items-center gap-3 rounded-2xl p-3 sm:flex-col sm:gap-1 sm:text-center {midi.enabled ? '' : 'max-sm:p-2'}" data-lit={mic.state === "on" || undefined} style:--instr="var(--hue-guitar)" data-testid="rig-mic-tile">
      <span class="chip grid size-11 shrink-0 place-items-center rounded-xl" aria-hidden="true"><INSTRUMENT_ICON.voice class="size-5" /></span>
      <div class="min-w-0 flex-1 sm:w-full sm:flex-none">
        <p class="font-semibold sm:text-base {midi.enabled ? '' : 'max-sm:text-sm'}">{m.music_hubs_input_audio()}</p>
        <p class="w-full text-[13px] text-ws-soft {midi.enabled ? '' : 'max-sm:sr-only'}">{mic.state === "on" ? micName : m.music_hubs_rig_mic_off()}</p>
      </div>
      <div class="flex shrink-0 flex-col items-end sm:items-center">
        {#if mic.state === "on" && mic.pitch}
          <span class="flex items-center gap-1 text-[13px] font-medium text-success"><Check class="size-3.5" aria-hidden="true" />{m.music_hubs_rig_heard()}</span>
          <span class="tnum font-display text-2xl leading-none font-semibold sm:text-3xl">{noteName(mic.pitch.midi)}</span>
          {@render octave(mic.pitch.midi)}
        {:else if mic.state === "on"}
          <span class="text-sm text-ws-soft">{m.music_hubs_rig_play_or_sing()}</span>
        {/if}
      </div>
    </li>
  </ul>
{/snippet}

{#snippet micPanel()}
  <section id="mic" class="mic flex scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] flex-col gap-3 rounded-2xl p-3 sm:p-4" data-next={micNext || undefined} aria-labelledby="mic-title" data-testid="rig-mic">
    <div class="min-w-0">
      <h3 id="mic-title" class="font-semibold">{m.music_hubs_input_audio()}</h3>
      <p class="text-[13px] text-ws-soft">
        {mic.state === "on" ? m.music_hubs_rig_listening_on({ name: micName }) : m.music_hubs_rig_mic_for({ name: micName })}
      </p>
      {#if micNext}<p class="mt-0.5 text-sm font-semibold text-instr-ink">{m.music_hubs_rig_mic_next()}</p>{/if}
    </div>
    <MicCheck {announce} primary={micNext} />
  </section>
{/snippet}

<!-- One octave from C, the key just played lit and marked: the note is seen on a keyboard, not only named. -->
{#snippet octave(note: number)}
  {@const pc = ((note % 12) + 12) % 12}
  {@const WHITE = [0, 2, 4, 5, 7, 9, 11]}
  {@const BLACK = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]]}
  <svg viewBox="0 0 70 26" class="mt-1.5 h-7 w-[4.5rem]" aria-hidden="true">
    {#each WHITE as w, i (w)}
      <rect x={i * 10 + 0.5} y="0.5" width="9" height="25" rx="1.5" class={w === pc ? "k-on" : "k-white"} />
    {/each}
    {#each BLACK as [b, at] (b)}
      <rect x={at * 10 - 3} y="0.5" width="6" height="15" rx="1" class={b === pc ? "k-on" : "k-black"} />
    {/each}
  </svg>
{/snippet}

<style>
  .k-white {
    fill: var(--ws-surface);
    stroke: var(--ws-line);
  }
  .k-black {
    fill: var(--ws-ink);
  }
  .k-on {
    fill: var(--instr);
    stroke: var(--ws-ink);
    stroke-width: 1;
  }
  /* Solid lines: a dashed card read as disabled, or as a drop zone. Unlit tiles are quiet, not broken. */
  .tile {
    border: 2px solid var(--ws-line);
    transition:
      border-color 0.3s,
      background-color 0.3s;
  }
  .mic {
    border: 1px solid var(--ws-line);
  }
  /* The next step: an outline in the page's ink colour. */
  .mic[data-next] {
    border: 2px solid var(--instr-ink);
  }
  .tile .chip {
    background: var(--ws-raised);
    color: var(--ws-soft);
  }
  .tile[data-lit] {
    border: 2px solid color-mix(in oklch, var(--instr) 60%, transparent);
    background: linear-gradient(180deg, color-mix(in oklch, var(--instr) 16%, transparent), transparent 6rem);
  }
  .tile[data-lit] .chip {
    background: var(--instr);
    color: var(--ws-stage);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--instr) 25%, transparent);
  }
  .bloom {
    border: 2px solid var(--instr);
    animation: ws-bloom 0.6s ease-out forwards;
    pointer-events: none;
  }
</style>
