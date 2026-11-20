<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { detectInstrument } from "@repo/music-core/io/devices";
  import { TUNINGS } from "@repo/music-core/data/index";
  import type Cable from "@lucide/svelte/icons/cable";
  import Usb from "@lucide/svelte/icons/usb";
  import RouteIcon from "@lucide/svelte/icons/route";
  import KeyboardMusic from "@lucide/svelte/icons/keyboard-music";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Activity from "@lucide/svelte/icons/activity";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import X from "@lucide/svelte/icons/x";
  import { noteName } from "@repo/music-core";
  import { formatNumber } from "@repo/i18n/format";
  import { btn, panel } from "#lib/music/components/ui.ts";
  import { padLabel } from "#lib/music/drills/pads/midi-status.ts";
  import { describeMidi, isDetail, velocityOf } from "#lib/music/hubs/connect/rig.ts";
  import Piano from "#lib/music/components/Piano.svelte";
  import Pads from "#lib/music/components/Pads.svelte";
  import Fretboard from "#lib/music/components/Fretboard.svelte";
  import { bench } from "#lib/music/bench.svelte.ts";
  import { audio, input, mic, midi, settings } from "#lib/music/runtime/index.ts";
  import { defaultSurface } from "@repo/music-core/io/devices";
  import DeviceCard from "#lib/music/hubs/connect/DeviceCard.svelte";
  import MpcPanel from "#lib/music/hubs/connect/MpcPanel.svelte";
  import RoutingTable from "#lib/music/hubs/connect/RoutingTable.svelte";
  import Rig from "#lib/music/hubs/connect/Rig.svelte";

  let status = $state("");
  const announce = (t: string) => (status = t);
  // Pad notes arriving from an MPC prove it is connected, link or not.
  let padsHeard = $state(false);
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind === "noteon" && e.source === "midi" && e.instrument === "mpc") padsHeard = true;
    }),
  );

  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });

  const instrumentOf = (p: { id: string; name: string; manufacturer: string }) => midi.profile(p.id)?.instrument ?? detectInstrument(p.name, p.manufacturer);
  const mpcInputs = $derived(midi.inputs.filter((p) => instrumentOf(p) === "mpc"));
  const hasMpc = $derived(mpcInputs.length > 0 || midi.outputs.some((o) => /mpc|akai/i.test(`${o.name} ${o.manufacturer}`)));
  const ignoredIds = $derived(new Set(midi.profiles.filter((p) => p.ignored).map((p) => p.id)));
  // Saved profiles for ports not plugged in right now (so Remove stays reachable).
  const offline = $derived(
    midi.profiles
      .filter((p) => !p.controllerLink && !midi.inputs.some((i) => i.id === p.id) && !midi.outputs.some((o) => o.id === p.id))
      .map((p) => ({ id: p.id, name: p.alias ?? p.id, manufacturer: "", state: "disconnected" })),
  );

  // Each step can carry the one thing to do about it; only the next unfinished step shows it.
  type Step = { done: boolean; label: string; hint: string; act?: { label: string; href?: string; run?: () => void } };
  const checklist = $derived<Step[]>([
    {
      done: midi.enabled,
      label: m.music_hubs_conn_midi_on_step(),
      hint: midi.supported ? m.music_hubs_conn_midi_hint() : m.music_hubs_conn_midi_unavailable(),
      act: midi.supported ? { label: m.music_hubs_rig_turn_on(), run: async () => announce((await midi.enable()) ? m.music_hubs_rig_midi_on() : midi.error) } : undefined,
    },
    { done: midi.enabled && midi.sysexEnabled, label: m.music_hubs_conn_lights_step(), hint: m.music_hubs_conn_lights_hint() },
    { done: midi.inputs.length > 0, label: m.music_hubs_conn_device_step(), hint: m.music_hubs_conn_device_hint() },
    ...(hasMpc
      ? [
          { done: mpcInputs.some((p) => midi.profile(p.id)?.padNotes), label: m.music_hubs_conn_map_step(), hint: m.music_hubs_conn_map_hint(), act: { label: m.music_hubs_conn_map_act(), href: "#devices-title" } },
          {
            done: midi.mpcLink.state === "linked" || padsHeard,
            label: m.music_hubs_conn_sends_step(),
            hint: m.music_hubs_conn_sends_hint(),
            act: { label: m.music_hubs_conn_link_act(), href: "#mpc-title" },
          },
        ]
      : []),
    { done: mic.state === "on", label: m.music_hubs_conn_mic_step(), hint: m.music_hubs_conn_mic_hint(), act: { label: m.music_hubs_conn_mic_act(), href: "#mic" } },
    { done: audio.unlocked, label: m.music_hubs_conn_sound_step(), hint: m.music_hubs_conn_sound_hint(), act: { label: m.music_hubs_conn_sound_act(), run: () => void audio.unlock().then((ok) => announce(ok ? m.music_hubs_conn_sound_on() : m.music_hubs_conn_sound_blocked())) } },
  ]);
  const readyCount = $derived(checklist.filter((c) => c.done).length);
  const nextStep = $derived(checklist.find((c) => !c.done && c.act));
  let showDetails = $state(false);
  const shownLog = $derived(midi.rawLog.filter((msg) => showDetails || !isDetail(msg.hex)).slice(0, 14));
  /** A note as the device's player knows it: a pad on a mapped MPC, a name elsewhere. */
  function noteFor(portId: string) {
    const map = midi.profile(portId)?.padNotes;
    return (n: number) => {
      const i = map?.indexOf(n) ?? -1;
      return i >= 0 ? m.music_hubs_conn_pad({ pad: padLabel(36 + i) }) : noteName(n);
    };
  }

  const t0 = performance.now();
  let showFallback = $state(false);
  const surface = $derived(settings.value.preferredSurface[settings.value.activeInstrument] ?? defaultSurface(settings.value.activeInstrument));
  const tuning = (kind: "guitar" | "ukulele") =>
    (TUNINGS[kind].find((t) => t.id === (kind === "guitar" ? settings.value.guitarTuningId : settings.value.ukuleleTuningId)) ?? TUNINGS[kind][0]).openStrings;
</script>

<svelte:head><title>{m.music_hubs_conn_head()}</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header>
    <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{m.music_hubs_conn_title()}</h1>
    <p class="mt-1 max-w-prose text-ws-soft">{m.music_hubs_conn_intro()} <span class="max-sm:hidden">{m.music_hubs_conn_intro_more()}</span></p>
  </header>
  <!-- What the last action did, as a banner you can dismiss. The live region stays mounted. -->
  <div role="status" class="-mt-3 {status ? '' : 'sr-only'}">
    {#if status}
      <p class="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 py-1 pr-1 pl-3 text-sm font-medium">
        <CircleCheck class="size-5 shrink-0 text-success" aria-hidden="true" />
        <span class="min-w-0 flex-1">{status}</span>
        <button type="button" class="grid size-11 shrink-0 place-items-center rounded-full hover:bg-ws-raised" aria-label={m.music_hubs_conn_dismiss()} onclick={() => (status = "")}><X class="size-4" aria-hidden="true" /></button>
      </p>
    {/if}
  </div>

  <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div class="flex min-w-0 flex-col gap-6">
      <Rig {announce} next={nextStep}>
        {#snippet fallback(anyLit: boolean)}
          <div class="flex flex-col gap-3 border-t border-ws-line pt-4">
            {#if !anyLit}
              <p class="text-sm">
                <span class="font-semibold">{m.music_hubs_conn_nothing()}</span>
                {midi.enabled ? m.music_hubs_conn_nothing_hint_on() : m.music_hubs_conn_nothing_hint_off()}
              </p>
            {/if}
            <button type="button" class="{btn} self-start" aria-expanded={showFallback} aria-controls="fallback" onclick={() => (showFallback = !showFallback)}>
              <KeyboardMusic class="size-4" aria-hidden="true" />{showFallback ? m.music_hubs_conn_hide_surface() : m.music_hubs_conn_try_surface()}
            </button>
            {#if showFallback}
              <div id="fallback" class="stage rounded-2xl p-3 sm:p-5">
                {#if surface === "mpc"}
                  <Pads />
                {:else if surface === "guitar" || surface === "ukulele"}
                  <Fretboard openStrings={tuning(surface)} from={0} to={5} label={surface === "guitar" ? m.music_hubs_conn_guitar_neck() : m.music_hubs_conn_ukulele_neck()} />
                {:else}
                  <Piano low={48} high={72} label={m.music_hubs_conn_piano()} />
                {/if}
                <p class="mt-3 text-sm text-ws-stage-soft">{surface === "keyboard" ? m.music_hubs_conn_fallback_keyboard() : surface === "mpc" ? m.music_hubs_conn_fallback_pads() : surface === "guitar" ? m.music_hubs_conn_fallback_guitar() : m.music_hubs_conn_fallback_ukulele()}</p>
              </div>
            {/if}
          </div>
        {/snippet}
      </Rig>

      {#if midi.enabled}
        <section class="flex scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] flex-col gap-3" aria-labelledby="devices-title">
          {@render heading("devices-title", m.music_hubs_conn_devices(), Usb, "piano")}
          {#if !midi.inputs.length && !offline.length}
            <p class="text-sm text-ws-soft">{m.music_hubs_conn_no_inputs()}</p>
          {/if}
          {#each [...midi.inputs, ...offline] as port (port.id)}
            <DeviceCard {port} {announce} />
          {/each}
        </section>
      {/if}

      {#if hasMpc || midi.profiles.some((p) => p.controllerLink)}
        <MpcPanel {announce} />
      {/if}

      <section class={panel} aria-labelledby="routing-title">
        {@render heading("routing-title", m.music_hubs_conn_routing(), RouteIcon, "rhythm")}
        <p class="mb-3 text-sm text-ws-soft">{m.music_hubs_conn_routing_intro()}</p>
        <RoutingTable {announce} />
      </section>
    </div>

    <aside class="flex min-w-0 flex-col gap-6 lg:sticky lg:top-[calc(var(--ws-strip-h,3.5rem)+1rem)]">
      <section class={panel} aria-labelledby="check-title">
        {@render heading("check-title", m.music_hubs_conn_steps(), ListChecks, "reading")}
        <!-- Steps, not devices: Your rig counts the inputs that are live, this counts what is set up. -->
        <p class="mt-1 text-sm"><span class="tnum font-semibold">{m.music_hubs_n_of_total({ n: readyCount, total: checklist.length })}</span> <span class="text-ws-soft">{m.music_hubs_conn_steps_done()}</span></p>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ws-raised" aria-hidden="true"><div class="h-full rounded-full bg-success" style:width="{(readyCount / checklist.length) * 100}%"></div></div>
        <!-- Steps still to do in full; the finished ones fold into one line. The next step's one action lives in Your rig. -->
        <ul class="mt-3 flex flex-col gap-2">
          {#each checklist.filter((c) => !c.done) as c (c.label)}
            {@const next = c === nextStep}
            <li class="flex gap-2 text-sm {next ? '-mx-2 rounded-xl bg-ws-raised px-2 py-2' : ''}">
              <span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full {next ? 'border-2 border-instr-ink' : 'border border-dashed border-ws-soft'}" aria-hidden="true"></span>
              <span class="min-w-0 flex-1">
                <span class="font-medium">{c.label}</span>{#if next}<span class="ml-1.5 rounded-full bg-instr-wash px-2 py-0.5 text-[13px] font-semibold text-instr-ink">{m.music_hubs_conn_next()}</span>{:else}<span class="sr-only">{m.music_hubs_conn_not_yet_sr()}</span>{/if}
                <span class="block text-ws-soft">{c.hint}</span>
              </span>
            </li>
          {/each}
        </ul>
        {#if readyCount}
          <details class="group mt-2 text-sm">
            <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-success text-[13px] font-bold text-white" aria-hidden="true">✓</span>
              <span>{m.music_hubs_conn_done_count({ count: readyCount })}<span class="font-normal text-ws-soft group-open:hidden">{m.music_hubs_conn_show_them()}</span></span>
            </summary>
            <ul class="flex flex-col gap-1.5 pl-7">
              {#each checklist.filter((c) => c.done) as c (c.label)}<li>{c.label}<span class="sr-only">{m.music_hubs_conn_ready_sr()}</span></li>{/each}
            </ul>
          </details>
        {/if}
      </section>

      <section class={panel} aria-labelledby="activity-title">
        {@render heading("activity-title", m.music_hubs_conn_recent(), Activity, "mpc")}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-ws-soft">{m.music_hubs_conn_recent_intro()}</p>
          <label class="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" role="switch" class="size-4 accent-[var(--instr-ink)]" bind:checked={showDetails} />{m.music_hubs_conn_show_details()}
          </label>
        </div>
        {#if shownLog.length}
          <ol class="mt-2 flex flex-col gap-1.5 text-sm" data-testid="activity">
            {#each shownLog as msg, i (i + msg.at)}
              {@const inst = midi.profile(msg.portId)?.instrument ?? detectInstrument(msg.port, "")}
              {@const vel = velocityOf(msg.hex)}
              <li class="flex min-w-0 flex-wrap items-baseline gap-x-2 border-b border-ws-line pb-1.5">
                <span class="size-2 shrink-0 self-center rounded-full" style:background={inst ? `var(--hue-${inst})` : "var(--ws-soft)"} aria-hidden="true"></span>
                <span class="min-w-0 flex-1 font-medium">{describeMidi(msg.hex, inst === "mpc" ? noteFor(msg.portId) : undefined)}{#if vel !== null && showDetails}<span class="tnum font-normal text-ws-soft"> ({vel})</span>{/if}</span>
                <!-- How hard, drawn: a short bar beside the word. -->
                {#if vel !== null}<span class="h-1.5 w-8 shrink-0 self-center overflow-hidden rounded-full bg-ws-raised" aria-hidden="true"><span class="block h-full rounded-full bg-ws-ink/60" style:width="{(vel / 127) * 100}%"></span></span>{/if}
                <span class="tnum text-[13px] text-ws-soft">{m.music_hubs_conn_seconds({ s: formatNumber(Math.max(0, (msg.at - t0) / 1000), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }) })}</span>
                <span class="w-full pl-4 text-[13px] text-ws-soft">{midi.profile(msg.portId)?.alias ?? msg.port}{#if ignoredIds.has(msg.portId)}<span class="ml-1.5 rounded bg-warn/20 px-1 text-ws-ink">{m.music_hubs_conn_hidden()}</span>{/if}</span>
                <span class="w-full pl-4 font-mono text-[13px] break-all text-ws-soft" class:hidden={!showDetails}>{msg.hex}</span>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="mt-3 text-sm text-ws-soft">{midi.enabled ? m.music_hubs_conn_nothing_received() : m.music_hubs_conn_midi_off()}</p>
        {/if}
      </section>
    </aside>
  </div>

</div>

{#snippet heading(id: string, label: string, Icon: typeof Cable, hue: string)}
  <h2 {id} class="flex scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] items-center gap-2.5 font-display text-xl font-semibold">
    <span class="grid size-9 shrink-0 place-items-center rounded-xl text-ws-stage" style:background="var(--hue-{hue})" aria-hidden="true"><Icon class="size-5" /></span>
    {label}
  </h2>
{/snippet}
