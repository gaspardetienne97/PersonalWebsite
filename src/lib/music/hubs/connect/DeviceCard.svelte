<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // One MIDI input: alias, instrument, channel, Ignore vs Remove, the latency
  // readout, and for MPC ports the pad map with a guided Learn pads capture.
  import { INSTRUMENTS, type DeviceProfile, type Instrument } from "@repo/music-core";
  import { PAD_PRESETS, detectInstrument, presetForMap, type PadPresetId } from "@repo/music-core/io/devices";
  import { INSTRUMENT_LABEL } from "#lib/music/bench.svelte.ts";
  import { btn } from "#lib/music/components/ui.ts";
  import { calibration, midi, type PortInfo } from "#lib/music/runtime/index.ts";
  import { MIDI_INPUT, deviceInput } from "@repo/music-core/io/calibration";
  import { padLabel } from "#lib/music/drills/pads/midi-status.ts";
  import { INSTRUMENT_ICON, instrumentOptions } from "#lib/music/components/instrument-icons.ts";
  import Cable from "@lucide/svelte/icons/cable";
  import Check from "@lucide/svelte/icons/check";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { noteName as letters } from "@repo/music-core";
  import { keyName } from "#lib/music/names.svelte.ts";
  /** A pitch's name as shown: letters or solfège (a device check names absolute pitches). */
  const noteName = (midi: number) => keyName(letters(midi));
  import Picker from "#lib/music/components/Picker.svelte";

  let { port, announce }: { port: PortInfo; announce: (text: string) => void } = $props();

  const profile = $derived(midi.profile(port.id));
  const detected = $derived(detectInstrument(port.name, port.manufacturer));
  const instrument = $derived(profile?.instrument ?? detected);
  const title = $derived(profile?.alias ?? port.name);
  const mapId = $derived(presetForMap(profile?.padNotes) ?? "none");
  const connected = $derived(port.state !== "disconnected");
  // Ignored or unplugged devices fold down to one quiet row until asked for.
  const inactive = $derived(!!profile?.ignored || !connected);
  let expanded = $state(false);
  const open = $derived(!inactive || expanded);
  const Icon = $derived(instrument ? INSTRUMENT_ICON[instrument] : Cable);

  function save(patch: Partial<DeviceProfile>) {
    return midi.saveProfile({ ...(profile ?? { id: port.id }), ...patch, id: port.id });
  }

  let confirmRemove = $state(false);
  let learning = $state<number[] | null>(null);
  let cancelLearn: (() => void) | null = null;

  async function learn() {
    const job = midi.learnPads(port.id, (notes) => (learning = notes));
    learning = [];
    cancelLearn = job.cancel;
    announce(m.music_hubs_dev_learning({ name: title }));
    try {
      const notes = await job.promise;
      await save({ padNotes: notes });
      announce(m.music_hubs_dev_learned({ name: title }));
    } catch {
      announce(m.music_hubs_dev_learn_cancelled());
    } finally {
      learning = null;
      cancelLearn = null;
    }
  }

  function setMap(id: string) {
    if (id === "learned") return;
    void save({ padNotes: id === "none" ? undefined : [...PAD_PRESETS[id as PadPresetId].notes] });
    announce(id === "none" ? m.music_hubs_dev_no_map({ name: title }) : m.music_hubs_dev_map_saved({ preset: PAD_PRESETS[id as PadPresetId].label, name: title }));
  }

  // MPC layout: top row pads 13-16 down to 1-4.
  const ROWS = [12, 8, 4, 0];
  const offset = $derived(calibration.offset(deviceInput(port.id)));
</script>

<article
  class="device flex min-w-0 scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] flex-col gap-4 rounded-2xl p-4 sm:p-5"
  data-inactive={inactive || undefined}
  style:--instr={instrument ? `var(--hue-${instrument})` : "var(--hue-create)"}
  data-testid="device-{port.id}"
>
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-3">
      <span class="chip grid size-11 shrink-0 place-items-center rounded-xl" aria-hidden="true"><Icon class="size-5" /></span>
      <div class="min-w-0">
        <h3 class="font-display text-lg font-semibold">{title}</h3>
        <p class="text-sm text-ws-soft">
          {port.manufacturer ? `${port.manufacturer}. ` : ""}{connected ? m.music_hubs_dev_connected() : m.music_hubs_dev_not_connected()}{profile?.ignored ? m.music_hubs_dev_hidden() : ""}.
        </p>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if instrument}<span class="badge rounded-full px-3 py-1 text-sm font-semibold">{INSTRUMENT_LABEL[instrument]}</span>{/if}
      {#if profile?.ignored}
        <button
          type="button"
          class={btn}
          onclick={() => {
            void save({ ignored: undefined });
            announce(m.music_hubs_dev_back({ name: title }));
          }}>{m.music_hubs_dev_show()}</button
        >
      {/if}
      {#if inactive}
        <button type="button" class={btn} aria-expanded={expanded} onclick={() => (expanded = !expanded)}>{expanded ? m.music_hubs_dev_hide_settings() : m.music_hubs_dev_show_settings()}</button>
      {/if}
    </div>
  </header>

  {#if open}
  <div class="max-w-sm">
    <div class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">{m.music_hubs_instrument()}</span>
      <Picker
        label={m.music_hubs_instrument()}
        value={profile?.instrument ?? "auto"}
        options={[{ value: "auto", label: detected ? m.music_hubs_dev_auto({ instrument: INSTRUMENT_LABEL[detected] }) : m.music_hubs_dev_auto_unknown() }, ...instrumentOptions((i) => INSTRUMENT_LABEL[i])]}
        onchange={(v) => {
          void save({ instrument: v === "auto" ? undefined : (v as Instrument) });
          announce(v === "auto" ? m.music_hubs_dev_plays_auto({ name: title }) : m.music_hubs_dev_plays({ name: title, instrument: INSTRUMENT_LABEL[v as Instrument] }));
        }}
      />
    </div>
  </div>

  <details class="group text-sm">
    <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
      <ChevronRight class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />{m.music_hubs_dev_advanced()}
      <span class="font-normal text-ws-soft">{m.music_hubs_dev_advanced_hint()}</span>
    </summary>
    <div class="mt-2 grid gap-3 pl-6 sm:grid-cols-2">
    <p class="text-sm sm:col-span-2"><span class="font-medium">{m.music_hubs_dev_port_name()}</span> {port.name}{port.manufacturer ? `, ${port.manufacturer}` : ""}</p>
    <label class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">{m.music_hubs_dev_alias()}</span>
      <input
        class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3"
        value={profile?.alias ?? ""}
        placeholder={port.name}
        onchange={(e) => {
          void save({ alias: e.currentTarget.value });
          announce(m.music_hubs_dev_alias_saved({ name: port.name }));
        }}
      />
    </label>
    <div class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">{m.music_hubs_dev_channel_label()}</span>
      <Picker
        label={m.music_hubs_dev_channel_label()}
        value={String(profile?.channel ?? 0)}
        options={[{ value: "0", label: m.music_hubs_dev_any_channel() }, ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: m.music_hubs_dev_channel({ n: i + 1 }) }))]}
        onchange={(raw) => {
          const v = Number(raw);
          void save({ channel: v || undefined });
          announce(v ? m.music_hubs_dev_listens_on({ name: title, n: v }) : m.music_hubs_dev_listens_all({ name: title }));
        }}
      />
    </div>
    <p class="text-sm sm:col-span-2">
      <span class="font-medium">{m.music_hubs_dev_latency()}</span>
      {#if offset !== undefined}
        <span class="tnum">{offset > 0 ? "+" : ""}{offset} ms</span> {m.music_hubs_dev_for_device()}
      {:else}
        {@html m.music_hubs_dev_latency_default({ ms: `<span class="tnum">${calibration.offset(MIDI_INPUT) ?? 0} ms</span>` })}
      {/if}
      <a href="/music/settings" class="font-medium text-instr-ink underline underline-offset-4">{m.music_hubs_dev_calibrate()}</a>
    </p>
    </div>
  </details>

  {#if instrument === "mpc"}
    <section class="flex flex-col gap-3 rounded-xl bg-ws-raised/60 p-3" aria-label={m.music_hubs_dev_pad_notes_for({ name: title })}>
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
          <span class="font-medium">{m.music_hubs_dev_pad_notes()}</span>
          <Picker label={m.music_hubs_dev_pad_notes()} value={mapId} options={[{ value: "none", label: m.music_hubs_dev_map_none() }, ...Object.entries(PAD_PRESETS).map(([id, p]) => ({ value: id, label: p.label })), ...(mapId === "learned" ? [{ value: "learned", label: m.music_hubs_dev_map_learned() }] : [])]} onchange={setMap} />
        </div>
        {#if learning}
          <button type="button" class={btn} onclick={() => cancelLearn?.()}>{m.music_hubs_dev_cancel_learning()}</button>
        {:else}
          <button type="button" class={btn} onclick={learn} disabled={!midi.enabled || !connected}>{m.music_hubs_dev_learn()}</button>
        {/if}
      </div>
      {#if learning}
        <div>
          <p class="font-display text-lg font-semibold">{m.music_hubs_dev_hit_next({ pad: padLabel(36 + learning.length) })}</p>
          <p class="text-sm text-ws-soft"><span class="tnum">{m.music_hubs_dev_captured_of({ n: learning.length })}</span> {m.music_hubs_dev_captured()}</p>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ws-line" aria-hidden="true"><div class="h-full rounded-full bg-instr" style:width="{(learning.length / 16) * 100}%"></div></div>
        </div>
      {/if}
      <ol class="grid max-w-xl grid-cols-4 gap-1.5 sm:gap-2" aria-label={learning ? m.music_hubs_dev_captured_label() : m.music_hubs_dev_saved_map()}>
        {#each ROWS as row (row)}
          {#each [0, 1, 2, 3] as col (col)}
            {@const i = row + col}
            {@const note = learning ? learning[i] : profile?.padNotes?.[i]}
            <li
              title={note !== undefined ? m.music_hubs_dev_pad_hears({ pad: padLabel(36 + i), note }) : undefined}
              class="flex min-h-16 flex-col items-center justify-center rounded-xl border text-sm {learning && i === learning.length
                ? 'target border-2 border-ws-ink bg-instr font-semibold text-ws-stage'
                : note !== undefined
                  ? 'border-transparent bg-instr-wash'
                  : 'border-ws-line bg-ws-surface'}"
              aria-current={learning && i === learning.length ? "step" : undefined}
            >
              <span class="flex items-center gap-0.5 font-display text-base font-semibold">{#if note !== undefined}<Check class="size-3.5" aria-hidden="true" />{/if}{padLabel(36 + i)}</span>
              <span class="tnum text-[13px] {learning && i === learning.length ? '' : 'text-ws-soft'}">{note !== undefined ? m.music_hubs_dev_sends({ note: noteName(note) }) : learning ? (i === learning.length ? m.music_hubs_dev_hit_now() : m.music_hubs_dev_waiting()) : profile?.padNotes ? "" : m.music_hubs_dev_sends({ note: noteName(36 + i) })}</span>
            </li>
          {/each}
        {/each}
      </ol>
      <p class="text-[13px] text-ws-soft">{m.music_hubs_dev_pads_hint()}</p>
    </section>
  {/if}

  <div class="flex flex-col gap-2 border-t border-ws-line pt-3 text-sm">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class={btn}
        aria-pressed={!!profile?.ignored}
        onclick={() => {
          const next = !profile?.ignored;
          void save({ ignored: next || undefined });
          announce(next ? m.music_hubs_dev_hidden_status({ name: title }) : m.music_hubs_dev_back({ name: title }));
        }}>{profile?.ignored ? m.music_hubs_dev_show() : m.music_hubs_dev_hide()}</button
      >
      {#if confirmRemove}
        <button
          type="button"
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-semibold text-white hover:brightness-110"
          onclick={() => {
            confirmRemove = false;
            void midi.removeProfile(port.id);
            announce(m.music_hubs_dev_forgot({ name: port.name }));
          }}>{m.music_hubs_dev_forget_it()}</button
        >
        <button type="button" class={btn} onclick={() => (confirmRemove = false)}>{m.music_hubs_dev_keep_them()}</button>
      {:else}
        <button type="button" class="ml-auto inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-ws-soft underline underline-offset-4 hover:text-destructive disabled:opacity-50 disabled:no-underline" disabled={!profile} onclick={() => (confirmRemove = true)}>{m.music_hubs_dev_forget()}</button>
      {/if}
    </div>
    <p class="text-ws-soft">
      {#if confirmRemove}{m.music_hubs_dev_forget_confirm()}{:else}{m.music_hubs_dev_hide_forget_hint()}{/if}
    </p>
  </div>
  {/if}
</article>

<style>
  .device {
    border: 2px solid color-mix(in oklch, var(--instr) 55%, transparent);
    background:
      linear-gradient(180deg, color-mix(in oklch, var(--instr) 14%, transparent), transparent 7rem),
      var(--ws-surface);
  }
  .chip {
    background: var(--instr);
    color: var(--ws-stage);
  }
  .badge {
    background: color-mix(in oklch, var(--instr) 28%, transparent);
  }
  /* Ignored or unplugged: dashed, desaturated, clearly not in use. */
  .device[data-inactive] {
    border: 2px dashed var(--ws-line);
    background: transparent;
    filter: grayscale(1);
    opacity: 0.7;
  }
  .device[data-inactive]:focus-within {
    opacity: 1;
  }
  .target {
    animation: target-pulse 1.4s ease-in-out infinite;
  }
  @keyframes target-pulse {
    50% {
      box-shadow: 0 0 0 4px color-mix(in oklch, var(--instr) 40%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .target {
      animation: none;
    }
  }
</style>
