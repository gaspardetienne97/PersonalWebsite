<script lang="ts">
  import { detectInstrument } from "@repo/music-core/io/devices";
  import { TUNINGS } from "@repo/music-core/data/index";
  import type Cable from "@lucide/svelte/icons/cable";
  import Usb from "@lucide/svelte/icons/usb";
  import RouteIcon from "@lucide/svelte/icons/route";
  import KeyboardMusic from "@lucide/svelte/icons/keyboard-music";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Activity from "@lucide/svelte/icons/activity";
  import { btn, panel } from "#lib/music/components/ui.ts";
  import Piano from "#lib/music/components/Piano.svelte";
  import Pads from "#lib/music/components/Pads.svelte";
  import Fretboard from "#lib/music/components/Fretboard.svelte";
  import { bench } from "#lib/music/bench.svelte.ts";
  import { audio, mic, midi, settings } from "#lib/music/runtime/index.ts";
  import { defaultSurface } from "@repo/music-core/io/devices";
  import DeviceCard from "#lib/music/hubs/connect/DeviceCard.svelte";
  import MpcPanel from "#lib/music/hubs/connect/MpcPanel.svelte";
  import RoutingTable from "#lib/music/hubs/connect/RoutingTable.svelte";
  import Rig from "#lib/music/hubs/connect/Rig.svelte";

  let status = $state("");
  const announce = (t: string) => (status = t);

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

  const checklist = $derived([
    { done: midi.enabled, label: "MIDI is on", hint: midi.supported ? "Press Enable MIDI in Your rig." : "Not available in this browser." },
    { done: midi.enabled && midi.sysexEnabled, label: "SysEx granted", hint: "Needed for MPC pad lights and the controller link only." },
    { done: midi.inputs.length > 0, label: "A MIDI device is connected", hint: "Plug it in; hot-plugging is fine." },
    ...(hasMpc
      ? [
          { done: mpcInputs.some((p) => midi.profile(p.id)?.padNotes), label: "MPC pad map saved", hint: "Pick the preset for your drum program, or Learn pads." },
          { done: midi.mpcLink.state === "linked", label: "MPC controller link holding", hint: "Without it the MPC sends no pad notes." },
        ]
      : []),
    { done: mic.state === "on", label: "Microphone tried", hint: "For guitar, ukulele and voice." },
    { done: audio.unlocked, label: "Sound on", hint: "Any tap on the page turns it on." },
  ]);
  const readyCount = $derived(checklist.filter((c) => c.done).length);

  const t0 = performance.now();
  let showFallback = $state(false);
  const surface = $derived(settings.value.preferredSurface[settings.value.activeInstrument] ?? defaultSurface(settings.value.activeInstrument));
  const tuning = (kind: "guitar" | "ukulele") =>
    (TUNINGS[kind].find((t) => t.id === (kind === "guitar" ? settings.value.guitarTuningId : settings.value.ukuleleTuningId)) ?? TUNINGS[kind][0]).openStrings;
</script>

<svelte:head><title>Connect | Woodshed</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header>
    <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Connect</h1>
    <p class="mt-1 max-w-prose text-ws-soft">Plug in the keyboard, the MPC and the Aerophone, or use the microphone. This is the one place to choose devices; what you set here applies on every page.</p>
  </header>
  <p role="status" class="-mt-3 min-h-6 text-sm font-medium">{status}</p>

  <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div class="flex min-w-0 flex-col gap-6">
      <Rig {announce}>
        {#snippet fallback(anyLit: boolean)}
          <div class="flex flex-col gap-3 border-t border-ws-line pt-4">
            {#if !anyLit}
              <p class="text-sm">
                <span class="font-semibold">Nothing connected yet.</span>
                Plug the keyboard, the MPC or the Aerophone in by USB{midi.enabled ? "" : " and press Enable MIDI"}, or start the microphone for guitar, ukulele and voice. No hardware is fine too: every drill has on-screen keys, frets or pads, and ear drills take tap answers.
              </p>
            {/if}
            <button type="button" class="{btn} self-start" aria-expanded={showFallback} aria-controls="fallback" onclick={() => (showFallback = !showFallback)}>
              <KeyboardMusic class="size-4" aria-hidden="true" />{showFallback ? "Hide the on-screen surface" : "Try the on-screen surface"}
            </button>
            {#if showFallback}
              <div id="fallback" class="stage rounded-2xl p-3 sm:p-5">
                {#if surface === "mpc"}
                  <Pads />
                {:else if surface === "guitar" || surface === "ukulele"}
                  <Fretboard openStrings={tuning(surface)} from={0} to={5} label="{surface === 'guitar' ? 'Guitar' : 'Ukulele'} neck, frets 0 to 5" />
                {:else}
                  <Piano low={48} high={72} label="Piano keyboard, C3 to C5" />
                {/if}
                <p class="mt-3 text-sm text-ws-stage-soft">This is the {surface === "keyboard" ? "keyboard" : surface === "mpc" ? "pad grid" : `${surface} neck`} your drills fall back to. Change it in Routing.</p>
              </div>
            {/if}
          </div>
        {/snippet}
      </Rig>

      {#if midi.enabled}
        <section class="flex flex-col gap-3" aria-labelledby="devices-title">
          {@render heading("devices-title", "Device settings", Usb, "piano")}
          {#if !midi.inputs.length && !offline.length}
            <p class="text-sm text-ws-soft">No MIDI inputs yet. Plug a device in; it appears here without a reload.</p>
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
        {@render heading("routing-title", "Routing", RouteIcon, "rhythm")}
        <p class="mb-3 text-sm text-ws-soft">What each instrument listens to first, and the on-screen surface it falls back to.</p>
        <RoutingTable {announce} />
      </section>
    </div>

    <aside class="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4">
      <section class={panel} aria-labelledby="check-title">
        {@render heading("check-title", "Setup checklist", ListChecks, "reading")}
        <p class="text-sm text-ws-soft">{readyCount} of {checklist.length} ready</p>
        <ul class="mt-3 flex flex-col gap-2">
          {#each checklist as c (c.label)}
            <li class="flex gap-2 text-sm">
              <span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold {c.done ? 'bg-success text-white' : 'border border-dashed border-ws-soft text-ws-soft'}" aria-hidden="true">{c.done ? "✓" : ""}</span>
              <span class="min-w-0"><span class="font-medium">{c.label}</span><span class="sr-only">: {c.done ? "ready" : "not yet"}</span>{#if !c.done}<span class="block text-ws-soft">{c.hint}</span>{/if}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section class={panel} aria-labelledby="activity-title">
        {@render heading("activity-title", "Live activity", Activity, "mpc")}
        <p class="text-sm text-ws-soft">The last messages as bytes, from every port, ignored ones included.</p>
        {#if midi.rawLog.length}
          <ol class="mt-3 flex flex-col gap-1.5 text-xs" data-testid="activity">
            {#each midi.rawLog.slice(0, 14) as m, i (i + m.at)}
              {@const inst = midi.profile(m.portId)?.instrument ?? detectInstrument(m.port, "")}
              <li class="flex min-w-0 flex-wrap items-baseline gap-x-2 border-b border-ws-line pb-1">
                <span class="tnum text-ws-soft">{Math.max(0, (m.at - t0) / 1000).toFixed(1)} s</span>
                <span class="size-2 shrink-0 self-center rounded-full" style:background={inst ? `var(--hue-${inst})` : "var(--ws-soft)"} aria-hidden="true"></span>
                <span class="min-w-0 truncate font-medium">{midi.profile(m.portId)?.alias ?? m.port}</span>
                {#if ignoredIds.has(m.portId)}<span class="rounded bg-warn/20 px-1">ignored</span>{/if}
                <span class="w-full font-mono break-all">{m.hex}</span>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="mt-3 text-sm text-ws-soft">{midi.enabled ? "Nothing received yet. Press a key or a pad." : "MIDI is off."}</p>
        {/if}
      </section>
    </aside>
  </div>

</div>

{#snippet heading(id: string, label: string, Icon: typeof Cable, hue: string)}
  <h2 {id} class="flex items-center gap-2.5 font-display text-xl font-semibold">
    <span class="grid size-9 shrink-0 place-items-center rounded-xl text-[oklch(0.2_0.04_288)]" style:background="var(--hue-{hue})" aria-hidden="true"><Icon class="size-5" /></span>
    {label}
  </h2>
{/snippet}
