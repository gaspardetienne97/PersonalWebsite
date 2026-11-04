<script lang="ts">
  import { detectInstrument } from "@repo/music-core/io/devices";
  import { TUNINGS } from "@repo/music-core/data/index";
  import type Cable from "lucide-svelte/icons/cable";
  import Usb from "lucide-svelte/icons/usb";
  import RouteIcon from "lucide-svelte/icons/route";
  import KeyboardMusic from "lucide-svelte/icons/keyboard-music";
  import ListChecks from "lucide-svelte/icons/list-checks";
  import Activity from "lucide-svelte/icons/activity";
  import { noteName } from "@repo/music-core";
  import { btn, btnPrimary, panel } from "$lib/music/components/ui";
  import { padLabel } from "$lib/music/drills/pads/midi-status";
  import { describeMidi } from "$lib/music/hubs/connect/rig";
  import Piano from "$lib/music/components/Piano.svelte";
  import Pads from "$lib/music/components/Pads.svelte";
  import Fretboard from "$lib/music/components/Fretboard.svelte";
  import { bench } from "$lib/music/bench.svelte";
  import { audio, mic, midi, settings } from "$lib/music/runtime";
  import { defaultSurface } from "@repo/music-core/io/devices";
  import DeviceCard from "$lib/music/hubs/connect/DeviceCard.svelte";
  import MpcPanel from "$lib/music/hubs/connect/MpcPanel.svelte";
  import RoutingTable from "$lib/music/hubs/connect/RoutingTable.svelte";
  import Rig from "$lib/music/hubs/connect/Rig.svelte";

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

  // Each step can carry the one thing to do about it; only the next unfinished step shows it.
  type Step = { done: boolean; label: string; hint: string; act?: { label: string; href?: string; run?: () => void } };
  const checklist = $derived<Step[]>([
    {
      done: midi.enabled,
      label: "MIDI is on",
      hint: midi.supported ? "For the keyboard, the MPC and the Aerophone." : "Not available in this browser. Use Chrome or Edge.",
      act: midi.supported ? { label: "Turn on MIDI", run: async () => announce((await midi.enable()) ? "MIDI is on." : midi.error) } : undefined,
    },
    { done: midi.enabled && midi.sysexEnabled, label: "Pad lights allowed", hint: "The browser's SysEx permission. Only the MPC's lights and link need it: turn MIDI off and on again and allow it." },
    { done: midi.inputs.length > 0, label: "A MIDI device is connected", hint: "Plug it in by USB. No reload needed." },
    ...(hasMpc
      ? [
          { done: mpcInputs.some((p) => midi.profile(p.id)?.padNotes), label: "MPC pad map saved", hint: "Pick the map for your drum program, or learn the pads.", act: { label: "Choose a pad map", href: "#devices-title" } },
          { done: midi.mpcLink.state === "linked", label: "MPC connected to the app", hint: "Without the link the MPC sends no pad notes.", act: { label: "Link the MPC", href: "#mpc-title" } },
        ]
      : []),
    { done: mic.state === "on", label: "Microphone tried", hint: "For guitar, ukulele and voice.", act: { label: "Go to the microphone", href: "#mic" } },
    { done: audio.unlocked, label: "Sound on", hint: "Any tap on the page turns it on.", act: { label: "Turn sound on", run: () => void audio.unlock().then((ok) => announce(ok ? "Sound is on." : "Sound is still blocked by the browser.")) } },
  ]);
  const readyCount = $derived(checklist.filter((c) => c.done).length);
  const nextStep = $derived(checklist.find((c) => !c.done && c.act));
  let showBytes = $state(false);
  /** A note as the device's player knows it: a pad on a mapped MPC, a name elsewhere. */
  function noteFor(portId: string) {
    const map = midi.profile(portId)?.padNotes;
    return (n: number) => {
      const i = map?.indexOf(n) ?? -1;
      return i >= 0 ? `Pad ${padLabel(36 + i)}` : noteName(n);
    };
  }

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
    <p class="mt-1 max-w-prose text-ws-soft">Plug in a keyboard, the MPC or the Aerophone, or use the microphone. What you set here applies on every page.</p>
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

    <aside class="flex min-w-0 flex-col gap-6 lg:sticky lg:top-[calc(var(--ws-strip-h,3.5rem)+1rem)]">
      <section class={panel} aria-labelledby="check-title">
        {@render heading("check-title", "Setup checklist", ListChecks, "reading")}
        <p class="mt-1 text-sm"><span class="tnum font-semibold">{readyCount} of {checklist.length}</span> <span class="text-ws-soft">ready</span></p>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ws-raised" aria-hidden="true"><div class="h-full rounded-full bg-success" style:width="{(readyCount / checklist.length) * 100}%"></div></div>
        <ul class="mt-3 flex flex-col gap-2">
          {#each checklist as c (c.label)}
            {@const next = c === nextStep}
            <li class="flex gap-2 text-sm {next ? '-mx-2 rounded-xl bg-ws-raised px-2 py-2' : ''}">
              <span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold {c.done ? 'bg-success text-white' : next ? 'border-2 border-instr-ink' : 'border border-dashed border-ws-soft text-ws-soft'}" aria-hidden="true">{c.done ? "✓" : ""}</span>
              <span class="min-w-0 flex-1">
                <span class="font-medium">{c.label}</span><span class="sr-only">: {c.done ? "ready" : next ? "do this next" : "not yet"}</span>
                {#if !c.done}<span class="block text-ws-soft">{c.hint}</span>{/if}
                {#if next && c.act}
                  {#if c.act.href}
                    <a class="{btnPrimary} mt-2" href={c.act.href}>{c.act.label}</a>
                  {:else}
                    <button type="button" class="{btnPrimary} mt-2" onclick={c.act.run}>{c.act.label}</button>
                  {/if}
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      </section>

      <section class={panel} aria-labelledby="activity-title">
        {@render heading("activity-title", "Live activity", Activity, "mpc")}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-ws-soft">What each device just sent, ignored ports included.</p>
          <label class="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" role="switch" class="size-4 accent-[var(--instr-ink)]" bind:checked={showBytes} />Show bytes
          </label>
        </div>
        {#if midi.rawLog.length}
          <ol class="mt-2 flex flex-col gap-1.5 text-sm" data-testid="activity">
            {#each midi.rawLog.slice(0, 14) as m, i (i + m.at)}
              {@const inst = midi.profile(m.portId)?.instrument ?? detectInstrument(m.port, "")}
              <li class="flex min-w-0 flex-wrap items-baseline gap-x-2 border-b border-ws-line pb-1.5">
                <span class="size-2 shrink-0 self-center rounded-full" style:background={inst ? `var(--hue-${inst})` : "var(--ws-soft)"} aria-hidden="true"></span>
                <span class="min-w-0 flex-1 font-medium">{describeMidi(m.hex, inst === "mpc" ? noteFor(m.portId) : undefined)}</span>
                <span class="tnum text-xs text-ws-soft">{Math.max(0, (m.at - t0) / 1000).toFixed(1)} s</span>
                <span class="w-full truncate pl-4 text-xs text-ws-soft">{midi.profile(m.portId)?.alias ?? m.port}{#if ignoredIds.has(m.portId)}<span class="ml-1.5 rounded bg-warn/20 px-1 text-ws-ink">ignored</span>{/if}</span>
                <span class="w-full pl-4 font-mono text-xs break-all text-ws-soft" class:hidden={!showBytes}>{m.hex}</span>
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
    <span class="grid size-9 shrink-0 place-items-center rounded-xl text-ws-stage" style:background="var(--hue-{hue})" aria-hidden="true"><Icon class="size-5" /></span>
    {label}
  </h2>
{/snippet}
