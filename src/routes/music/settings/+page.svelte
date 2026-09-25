<script lang="ts">
  // Settings (catalog 5.15): grouped rows, labels left, controls right. Every
  // control here is read by something: the audio graph, getUserMedia, the
  // router offsets, the root attributes for motion and hue.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Mic from "lucide-svelte/icons/mic";
  import Timer from "lucide-svelte/icons/timer";
  import Palette from "lucide-svelte/icons/palette";
  import Target from "lucide-svelte/icons/target";
  import Database from "lucide-svelte/icons/database";
  import type { PlaybackSound } from "@repo/music-core";
  import CalibrationPanel from "$lib/music/hubs/tools/settings/CalibrationPanel.svelte";
  import DataSection from "$lib/music/hubs/tools/settings/DataSection.svelte";
  import { btn } from "$lib/music/components/ui";
  import { audio, mic, midi, settings } from "$lib/music/runtime";

  const s = $derived(settings.value);
  let status = $state("");
  const announce = (msg: string) => (status = msg);

  const SOUNDS: { value: PlaybackSound; label: string }[] = [
    { value: "salamander-piano", label: "Sampled Piano" },
    { value: "warm-synth", label: "Warm Synth" },
    { value: "synth", label: "Synth" },
    { value: "e-piano", label: "E-Piano" },
    { value: "square", label: "Square" },
    { value: "saw", label: "Saw" },
  ];
  const LEVELS = [
    { key: "playbackLevel", label: "Playback and drills" },
    { key: "metronomeLevel", label: "Metronome" },
    { key: "masterLevel", label: "Master" },
  ] as const;
  const SECTIONS = [
    { id: "audio", label: "Audio", icon: Volume2 },
    { id: "input", label: "Input", icon: Mic },
    { id: "latency", label: "Latency", icon: Timer },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "goals", label: "Goals", icon: Target },
    { id: "data", label: "Your data", icon: Database },
  ];
  const rowCls = "flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3";
  const listCls = "divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface";

  let latency = $state(audio.latencyInfo());
  const ms = (v: number | null) => (v === null ? "not reported" : `${v} ms`);

  onMount(() => {
    mic.refreshDevices().catch(() => {});
    const restored = page.url.searchParams.get("restored");
    if (restored !== null) {
      const files = Number(page.url.searchParams.get("files") ?? 0);
      status = `Restored ${restored} rows from the backup${files ? ` and ${files} media file${files === 1 ? "" : "s"}` : ""}.`;
    } else if (page.url.searchParams.has("reset")) status = "Local data deleted. Woodshed is back to a fresh start.";
  });

  async function enableAudio() {
    await audio.unlock();
    latency = audio.latencyInfo();
    if (audio.unlocked) {
      audio.playChord([60, 64, 67], 1);
      status = "Audio is on. You should hear a C major chord.";
    } else status = "Audio did not start. Click again; browsers only allow sound after a tap.";
  }

  function pickDevice(id: string) {
    const d = mic.devices.find((x) => x.deviceId === id);
    settings.update({ audioInputDeviceId: id || undefined, audioInputLabel: d?.label ?? "Default input" });
    status = `Input set to ${d?.label ?? "the default input"}. It applies the next time the microphone starts.`;
  }

  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ms`;
  const sampleNote = $derived(
    s.preferredPlaybackSound !== "salamander-piano"
      ? ""
      : audio.sampleState === "loading"
        ? "Loading the piano samples. Warm Synth plays until they arrive."
        : audio.sampleState === "error"
          ? audio.sampleError
          : audio.sampleState === "ready"
            ? "Piano samples loaded."
            : "The samples load once audio is on.",
  );
</script>

<svelte:head><title>Settings | Woodshed</title></svelte:head>

<div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
  <header class="lg:col-span-2">
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Settings</h1>
    <p class="mt-1 max-w-prose text-ws-soft">Sound, input, timing and your data. Everything is saved in this browser as you change it.</p>
  </header>

  <nav aria-label="Settings sections" class="hidden lg:block">
    <ul class="sticky top-20 flex flex-col gap-1">
      {#each SECTIONS as sec (sec.id)}
        <li>
          <a href="#{sec.id}" class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-ws-soft hover:bg-ws-raised hover:text-ws-ink">
            <sec.icon class="size-4" aria-hidden="true" />{sec.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-10">
    <section id="audio" aria-labelledby="audio-h" class="scroll-mt-20">
      {@render heading("audio-h", "Audio", Volume2)}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium">Sound engine</p>
            <p class="text-sm text-ws-soft">{audio.unlocked ? "On for this visit." : "Browsers only play sound after a tap, once per visit."}</p>
          </div>
          <button type="button" class={btn} onclick={enableAudio}>{audio.unlocked ? "Play a test sound" : "Enable audio"}</button>
        </li>
        <li class={rowCls}>
          <label for="sound" class="min-w-0 flex-1 basis-48">
            <span class="block font-medium">Playback sound</span>
            {#if sampleNote}<span class="block text-sm {audio.sampleState === 'error' ? 'text-warn' : 'text-ws-soft'}">{sampleNote}</span>{/if}
          </label>
          <select
            id="sound"
            class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm"
            value={s.preferredPlaybackSound}
            onchange={(e) => settings.update({ preferredPlaybackSound: e.currentTarget.value as PlaybackSound })}
          >
            {#each SOUNDS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </li>
        {#each LEVELS as l (l.key)}
          <li class={rowCls}>
            <label for={l.key} class="min-w-0 flex-1 basis-40 font-medium">{l.label}</label>
            <div class="flex w-full items-center gap-3 sm:w-64">
              <input
                id={l.key}
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="h-11 min-w-0 flex-1 accent-[var(--instr-ink)]"
                value={s[l.key]}
                oninput={(e) => settings.update({ [l.key]: Number(e.currentTarget.value) })}
              />
              <span class="tnum w-12 text-right text-sm">{Math.round(s[l.key] * 100)}%</span>
            </div>
          </li>
        {/each}
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="mute-l" class="font-medium">Mute all</p>
            <p class="text-sm text-ws-soft">Silences everything and keeps your levels for when you unmute.</p>
          </div>
          {@render toggle("mute-l", s.muted, (v) => settings.update({ muted: v }))}
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="onscreen-l" class="font-medium">On-screen instruments make sound</p>
            <p class="text-sm text-ws-soft">Keys, frets and pads you tap or play from the computer keyboard sound like the instrument. MIDI devices make their own sound.</p>
          </div>
          {@render toggle("onscreen-l", s.onscreenSound, (v) => settings.update({ onscreenSound: v }))}
        </li>
        <li class="px-4 py-3 text-sm text-ws-soft">
          Sampled piano: Salamander Grand Piano by Alexander Holm, <a class="font-medium text-instr-ink underline underline-offset-4" href="https://creativecommons.org/licenses/by/3.0/" rel="noopener noreferrer" target="_blank">CC BY 3.0</a>.
        </li>
      </ul>
    </section>

    <section id="input" aria-labelledby="input-h" class="scroll-mt-20">
      {@render heading("input-h", "Input", Mic)}
      <ul class={listCls}>
        <li class={rowCls}>
          <label for="mic-device" class="min-w-0 flex-1 basis-48">
            <span class="block font-medium">Audio input</span>
            <span class="block text-sm text-ws-soft">Device names appear once you have allowed the microphone for this site.</span>
          </label>
          <select
            id="mic-device"
            class="min-h-11 w-full min-w-0 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm sm:w-64"
            value={s.audioInputDeviceId ?? ""}
            onchange={(e) => pickDevice(e.currentTarget.value)}
          >
            <option value="">Default input</option>
            {#each mic.devices.filter((d) => d.deviceId && d.deviceId !== "default") as d (d.deviceId)}<option value={d.deviceId}>{d.label}</option>{/each}
            {#if s.audioInputDeviceId && !mic.devices.some((d) => d.deviceId === s.audioInputDeviceId)}
              <option value={s.audioInputDeviceId}>{s.audioInputLabel} (not connected)</option>
            {/if}
          </select>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="echo-l" class="font-medium">Echo cancellation</p>
            <p class="text-sm text-ws-soft">Off is better for pitch and timing. Turn it on if the speakers bleed into the mic. Applies the next time the microphone starts.</p>
          </div>
          {@render toggle("echo-l", s.echoCancellation, (v) => settings.update({ echoCancellation: v }))}
        </li>
      </ul>
    </section>

    <section id="latency" aria-labelledby="latency-h" class="scroll-mt-20">
      {@render heading("latency-h", "Latency calibration", Timer)}
      <p class="mb-3 max-w-prose text-sm text-ws-soft">
        An offset says how late your input reaches Woodshed. Positive means it arrives late; Woodshed subtracts it from every note before grading. Tap along with 20 clicks and it estimates the offset. This is an estimate that includes your reaction time, not a hardware measurement.
      </p>
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium">Browser-reported output latency</p>
            <p class="text-sm text-ws-soft">Diagnostic only, never applied to scoring.</p>
          </div>
          <p class="tnum text-sm">
            Output {ms(latency.outputLatencyMs)}, base {ms(latency.baseLatencyMs)}
          </p>
        </li>
        <li>
          <CalibrationPanel
            id="mic"
            kind="audio"
            title="Microphone"
            blurb="For guitar, ukulele and voice. Clap or pick a muted string on each click."
            current={s.audioOffsetMs}
            onsave={(v) => settings.update({ audioOffsetMs: v })}
            onreset={() => settings.update({ audioOffsetMs: 0 })}
            {announce}
          />
        </li>
        <li>
          <CalibrationPanel
            id="midi"
            kind="midi"
            title="MIDI, all devices"
            blurb="Used by every MIDI device without its own offset."
            current={s.midiOffsetMs}
            onsave={(v) => settings.update({ midiOffsetMs: v })}
            onreset={() => settings.update({ midiOffsetMs: 0 })}
            {announce}
          />
        </li>
        {#each midi.inputs as port (port.id)}
          {@const profile = midi.profile(port.id)}
          <li>
            <CalibrationPanel
              id="dev-{port.id}"
              kind="device"
              deviceId={port.id}
              title={profile?.alias || port.name || port.id}
              blurb={profile?.inputOffsetMs !== undefined ? "Its own offset overrides the MIDI one." : `Uses the MIDI offset (${signed(s.midiOffsetMs)}) until you save one here.`}
              current={profile?.inputOffsetMs}
              onsave={(v) => midi.saveProfile({ ...(midi.profile(port.id) ?? { id: port.id }), inputOffsetMs: v })}
              onreset={() => midi.saveProfile({ ...(midi.profile(port.id) ?? { id: port.id }), inputOffsetMs: undefined })}
              {announce}
            />
          </li>
        {:else}
          <li class="px-4 py-3 text-sm text-ws-soft">
            {midi.enabled ? "No MIDI devices connected." : "MIDI is off."} Per-device offsets appear here for each connected device. <a class="font-medium text-instr-ink underline underline-offset-4" href="/music/connect">Connect a device</a>
          </li>
        {/each}
      </ul>
    </section>

    <section id="appearance" aria-labelledby="appearance-h" class="scroll-mt-20">
      {@render heading("appearance-h", "Appearance", Palette)}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="motion-l" class="font-medium">Reduce motion</p>
            <p class="text-sm text-ws-soft">Stops animations and transitions everywhere in Woodshed. Your system setting is respected either way.</p>
          </div>
          {@render toggle("motion-l", s.reduceMotion, (v) => settings.update({ reduceMotion: v }))}
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="hue-l" class="font-medium">Instrument colour coding</p>
            <p class="text-sm text-ws-soft">Each instrument gets its own colour: piano brass, guitar coral, pads magenta. Off uses one colour throughout.</p>
          </div>
          {@render toggle("hue-l", s.instrumentColorCoding, (v) => settings.update({ instrumentColorCoding: v }))}
        </li>
      </ul>
    </section>

    <section id="goals" aria-labelledby="goals-h" class="scroll-mt-20">
      {@render heading("goals-h", "Goals", Target)}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="goal-l" class="font-medium">Weekly session goal</p>
            <p class="text-sm text-ws-soft">How many sessions a week counts as a good week.</p>
          </div>
          <div class="flex items-center gap-1" role="group" aria-labelledby="goal-l">
            <button type="button" class="{btn} w-11 px-0" aria-label="One fewer session" disabled={s.weeklySessionGoal <= 1} onclick={() => settings.update({ weeklySessionGoal: s.weeklySessionGoal - 1 })}>−</button>
            <span class="tnum w-20 text-center font-display text-xl font-semibold" data-testid="weekly-goal">{s.weeklySessionGoal}<span class="ml-1 text-sm font-normal text-ws-soft">a week</span></span>
            <button type="button" class="{btn} w-11 px-0" aria-label="One more session" disabled={s.weeklySessionGoal >= 14} onclick={() => settings.update({ weeklySessionGoal: s.weeklySessionGoal + 1 })}>+</button>
          </div>
        </li>
      </ul>
    </section>

    <section id="data" aria-labelledby="data-h" class="scroll-mt-20">
      {@render heading("data-h", "Your data", Database)}
      <p class="mb-3 max-w-prose text-sm text-ws-soft">Everything stays in this browser. Backups are files you keep; there is no account and no server copy.</p>
      <DataSection {announce} {rowCls} />
    </section>

    <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
  </div>
</div>

{#snippet heading(id: string, label: string, Icon: typeof Volume2)}
  <h2 {id} class="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
    <span class="grid size-8 place-items-center rounded-lg bg-instr-wash text-instr-ink" aria-hidden="true"><Icon class="size-4" /></span>{label}
  </h2>
{/snippet}

{#snippet toggle(labelId: string, on: boolean, set: (v: boolean) => void)}
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-labelledby={labelId}
    class="relative inline-flex h-11 w-16 shrink-0 items-center"
    onclick={() => set(!on)}
  >
    <span class="absolute inset-x-1 h-7 rounded-full transition-colors {on ? 'bg-instr-ink' : 'bg-ws-raised ring-1 ring-ws-line'}"></span>
    <span class="relative size-6 rounded-full bg-ws-surface shadow transition-transform {on ? 'translate-x-8' : 'translate-x-2'}"></span>
  </button>
{/snippet}
