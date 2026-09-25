<script lang="ts">
  // One MIDI input: alias, instrument, channel, Ignore vs Remove, the latency
  // readout, and for MPC ports the pad map with a guided Learn pads capture.
  import { INSTRUMENTS, type DeviceProfile, type Instrument } from "@repo/music-core";
  import { PAD_PRESETS, detectInstrument, presetForMap, type PadPresetId } from "@repo/music-core/io/devices";
  import { INSTRUMENT_LABEL } from "$lib/music/bench.svelte";
  import { btn } from "$lib/music/components/ui";
  import { midi, settings, type PortInfo } from "$lib/music/runtime";
  import { padLabel } from "$lib/music/drills/pads/midi-status";

  let { port, announce }: { port: PortInfo; announce: (text: string) => void } = $props();

  const profile = $derived(midi.profile(port.id));
  const detected = $derived(detectInstrument(port.name, port.manufacturer));
  const instrument = $derived(profile?.instrument ?? detected);
  const title = $derived(profile?.alias ?? port.name);
  const mapId = $derived(presetForMap(profile?.padNotes) ?? "none");
  const connected = $derived(port.state !== "disconnected");

  function save(patch: Partial<DeviceProfile>) {
    return midi.saveProfile({ ...(profile ?? { id: port.id }), ...patch, id: port.id });
  }

  let learning = $state<number[] | null>(null);
  let cancelLearn: (() => void) | null = null;

  async function learn() {
    const job = midi.learnPads(port.id, (notes) => (learning = notes));
    learning = [];
    cancelLearn = job.cancel;
    announce(`Learning pads on ${title}: hit pad A01 first, then each pad in order.`);
    try {
      const notes = await job.promise;
      await save({ padNotes: notes });
      announce(`Learned all 16 pads on ${title}. Hardware notes are now read as bank A.`);
    } catch {
      announce("Pad learning cancelled. The saved map is unchanged.");
    } finally {
      learning = null;
      cancelLearn = null;
    }
  }

  function setMap(id: string) {
    if (id === "learned") return;
    void save({ padNotes: id === "none" ? undefined : [...PAD_PRESETS[id as PadPresetId].notes] });
    announce(id === "none" ? `No pad map on ${title}: notes pass through unchanged.` : `${PAD_PRESETS[id as PadPresetId].label} saved for ${title}.`);
  }

  // MPC layout: top row pads 13-16 down to 1-4.
  const ROWS = [12, 8, 4, 0];
  const offset = $derived(profile?.inputOffsetMs);
</script>

<article class="flex min-w-0 flex-col gap-4 rounded-2xl border border-ws-line bg-ws-surface p-4 sm:p-5" data-testid="device-{port.id}">
  <header class="flex flex-wrap items-start justify-between gap-2">
    <div class="min-w-0">
      <h3 class="font-display text-lg font-semibold">{title}</h3>
      <p class="text-sm text-ws-soft">
        {port.name}{port.manufacturer ? `, ${port.manufacturer}` : ""}.
        {connected ? "Connected" : "Not connected"}{profile?.ignored ? ", ignored" : ""}.
      </p>
    </div>
    {#if instrument}<span class="rounded-full px-3 py-1 text-sm font-medium" style="background: color-mix(in oklch, var(--hue-{instrument}) 22%, transparent)">{INSTRUMENT_LABEL[instrument]}</span>{/if}
  </header>

  <div class="grid gap-3 sm:grid-cols-3">
    <label class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">Alias</span>
      <input
        class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3"
        value={profile?.alias ?? ""}
        placeholder={port.name}
        onchange={(e) => {
          void save({ alias: e.currentTarget.value });
          announce(`Alias saved for ${port.name}.`);
        }}
      />
    </label>
    <label class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">Instrument</span>
      <select
        class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3"
        onchange={(e) => {
          const v = e.currentTarget.value;
          void save({ instrument: v === "auto" ? undefined : (v as Instrument) });
          announce(`${title} plays ${v === "auto" ? "whatever its name suggests" : INSTRUMENT_LABEL[v as Instrument]}.`);
        }}
      >
        <option value="auto" selected={!profile?.instrument}>Auto{detected ? ` (${INSTRUMENT_LABEL[detected]})` : ", not recognised"}</option>
        {#each INSTRUMENTS as i (i)}<option value={i} selected={profile?.instrument === i}>{INSTRUMENT_LABEL[i]}</option>{/each}
      </select>
    </label>
    <label class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">MIDI channel</span>
      <select
        class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3"
        onchange={(e) => {
          const v = Number(e.currentTarget.value);
          void save({ channel: v || undefined });
          announce(v ? `${title} listens on channel ${v} only.` : `${title} listens on every channel.`);
        }}
      >
        <option value="0" selected={!profile?.channel}>Any channel</option>
        {#each Array.from({ length: 16 }, (_, i) => i + 1) as c (c)}<option value={c} selected={profile?.channel === c}>Channel {c}</option>{/each}
      </select>
    </label>
  </div>

  <p class="text-sm">
    <span class="text-ws-soft">Latency offset:</span>
    {#if offset !== undefined}
      <span class="tnum font-medium">{offset > 0 ? "+" : ""}{offset} ms</span> for this device ({offset >= 0 ? "notes arrive late and are pulled earlier" : "notes arrive early"}).
    {:else}
      none for this device, so the global MIDI offset of <span class="tnum font-medium">{settings.value.midiOffsetMs} ms</span> applies.
    {/if}
    <a href="/music/settings" class="font-medium text-instr-ink underline underline-offset-4">Calibrate in Settings</a>
  </p>

  {#if instrument === "mpc"}
    <section class="flex flex-col gap-3 rounded-xl bg-ws-raised/60 p-3" aria-label="Pad notes for {title}">
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
          <span class="font-medium">Pad notes (what your drum program sends)</span>
          <select class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" onchange={(e) => setMap(e.currentTarget.value)} data-testid="pad-map">
            <option value="none" selected={mapId === "none"}>No map: notes pass through</option>
            {#each Object.entries(PAD_PRESETS) as [id, p] (id)}<option value={id} selected={mapId === id}>{p.label}</option>{/each}
            {#if mapId === "learned"}<option value="learned" selected>Learned from this device</option>{/if}
          </select>
        </label>
        {#if learning}
          <button type="button" class={btn} onclick={() => cancelLearn?.()}>Cancel learning</button>
        {:else}
          <button type="button" class={btn} onclick={learn} disabled={!midi.enabled || !connected}>Learn pads</button>
        {/if}
      </div>
      {#if learning}
        <p class="text-sm font-medium">Hit pad {padLabel(36 + learning.length)} next ({learning.length} of 16 captured).</p>
      {/if}
      <ol class="grid max-w-80 grid-cols-4 gap-1" aria-label={learning ? "Pads captured so far" : "Saved pad map"}>
        {#each ROWS as row (row)}
          {#each [0, 1, 2, 3] as col (col)}
            {@const i = row + col}
            {@const note = learning ? learning[i] : profile?.padNotes?.[i]}
            <li
              class="flex min-h-11 flex-col items-center justify-center rounded-md border text-xs {learning && i === learning.length
                ? 'border-instr-ink border-2 font-semibold'
                : note !== undefined
                  ? 'border-transparent bg-instr-wash'
                  : 'border-dashed border-ws-line text-ws-soft'}"
            >
              <span>{padLabel(36 + i)}</span>
              <span class="tnum font-semibold">{note ?? (profile?.padNotes || learning ? "" : 36 + i)}</span>
            </li>
          {/each}
        {/each}
      </ol>
      <p class="text-xs text-ws-soft">Each hardware note is rewritten to its bank A pad once, as it enters the app, so every drill reads A01 to A16.</p>
    </section>
  {/if}

  <div class="grid gap-3 sm:grid-cols-2">
    <div class="flex flex-col gap-1 text-sm">
      <button
        type="button"
        class={btn}
        aria-pressed={!!profile?.ignored}
        onclick={() => {
          const next = !profile?.ignored;
          void save({ ignored: next || undefined });
          announce(next ? `${title} ignored: its notes no longer reach drills.` : `${title} is back: its notes reach drills again.`);
        }}>{profile?.ignored ? "Stop ignoring" : "Ignore this port"}</button
      >
      <span class="text-ws-soft">Ignore keeps the port and its settings, and still shows its bytes in Live activity, but its notes never reach a drill. Use it for the MPC's control port.</span>
    </div>
    <div class="flex flex-col gap-1 text-sm">
      <button
        type="button"
        class={btn}
        disabled={!profile}
        onclick={() => {
          void midi.removeProfile(port.id);
          announce(`Forgot everything saved for ${port.name}. It now behaves like a new device.`);
        }}>Remove saved settings</button
      >
      <span class="text-ws-soft">Remove deletes the alias, instrument, channel, pad map and offset. The port keeps working as an unknown device.</span>
    </div>
  </div>
</article>
