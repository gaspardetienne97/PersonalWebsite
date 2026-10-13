<script lang="ts">
  // Settings (catalog 5.15): grouped rows, labels left, controls right. Every
  // control here is read by something: the audio graph, getUserMedia, the
  // router offsets, the root attributes for motion and hue.
  import { onMount } from "svelte";
  import { SectionSpy } from "$lib/music/section-spy.svelte";
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
  import Hint from "$lib/music/components/Hint.svelte";
  import { audio, mic, midi, settings } from "$lib/music/runtime";
  import Picker from "$lib/music/components/Picker.svelte";

  const s = $derived(settings.value);
  // One live region for screen readers; the same message is also shown
  // visibly in the section it is about, not at the bottom of the page.
  let status = $state("");
  let noteIn = $state<string | null>(null);
  const say = (section: string, msg: string) => {
    status = msg;
    noteIn = section;
  };
  const announceIn = (section: string) => (msg: string) => say(section, msg);

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
    { id: "audio", label: "Audio", icon: Volume2, hue: "piano" },
    { id: "input", label: "Input", icon: Mic, hue: "guitar" },
    { id: "latency", label: "Latency", icon: Timer, hue: "rhythm" },
    { id: "appearance", label: "Appearance", icon: Palette, hue: "ear" },
    { id: "goals", label: "Goals", icon: Target, hue: "mpc" },
    { id: "data", label: "Your data", icon: Database, hue: "aerophone" },
  ];
  const spy = new SectionSpy(SECTIONS.map((x) => x.id));
  const rowCls = "flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3";
  const listCls = "divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface";

  let latency = $state(audio.latencyInfo());
  const ms = (v: number | null) => (v === null ? "not reported" : `${v} ms`);

  onMount(() => spy.watch());
  onMount(() => {
    mic.refreshDevices().catch(() => {});
    const restored = page.url.searchParams.get("restored");
    if (restored !== null) {
      const files = Number(page.url.searchParams.get("files") ?? 0);
      say("top", `Restored ${restored} rows from the backup${files ? ` and ${files} media file${files === 1 ? "" : "s"}` : ""}.`);
    } else if (page.url.searchParams.has("reset")) say("top", "Local data deleted. Woodshed is back to a fresh start.");
  });

  // I IV V I in C, block chords: the test that says "this is working".
  const CADENCE = [
    [48, 60, 64, 67],
    [53, 60, 65, 69],
    [55, 59, 62, 67],
    [48, 60, 64, 67],
  ];

  async function playTest() {
    await audio.unlock();
    latency = audio.latencyInfo();
    if (!audio.unlocked) return say("audio", "Audio did not start. Click again; browsers only allow sound after a tap.");
    audio.playSequence(
      CADENCE.flatMap((chord, i) => chord.map((midi) => ({ midi, time: i * 0.7, duration: i === 3 ? 1.4 : 0.65, velocity: 0.7 }))),
    );
    say("audio", "Playing a C major cadence: C, F, G, C.");
  }

  async function setSound(on: boolean) {
    await settings.update({ muted: !on });
    if (!on) return say("audio", "Sound is off everywhere in Woodshed. Your levels are kept.");
    await audio.unlock();
    latency = audio.latencyInfo();
    say("audio", audio.unlocked ? "Sound is on." : "Sound is on, but the browser is still holding it back. Tap Play test sound.");
  }

  function pickDevice(id: string) {
    const d = mic.devices.find((x) => x.deviceId === id);
    settings.update({ audioInputDeviceId: id || undefined, audioInputLabel: d?.label ?? "Default input" });
    say("input", `Input set to ${d?.label ?? "the default input"}. It applies the next time the microphone starts.`);
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
    <div class="mt-3">{@render note("top")}</div>
  </header>

  <nav aria-label="Settings sections" class="sticky top-27 z-20 min-w-0 -mx-4 bg-ws-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-32 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
    <ul class="flex gap-1.5 overflow-x-auto py-2 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:py-0">
      {#each SECTIONS as sec (sec.id)}
        <li class="shrink-0">
          <a
            href="#{sec.id}"
            aria-current={spy.current === sec.id ? "location" : undefined}
            style:--topic="var(--hue-{sec.hue})"
            class="topic flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-ws-line px-3 text-sm text-ws-soft hover:bg-ws-raised hover:text-ws-ink lg:rounded-lg lg:border-0"
          >
            <span class="grid size-6 shrink-0 place-items-center rounded-md" style:color="var(--topic)" aria-hidden="true"><sec.icon class="size-4" /></span>{sec.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-10">
    <section id="audio" aria-labelledby="audio-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("audio-h", "Audio", Volume2)}
      {@render note("audio")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p id="sound-l" class="font-medium">Sound</p>
            <p class="text-sm text-ws-soft">
              {s.muted ? "Off: nothing in Woodshed makes sound. Your levels are kept." : audio.unlocked ? "On." : "On, and it starts at your first tap (browsers wait for one)."}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class={btn} onclick={playTest} disabled={s.muted}>Play test sound</button>
            {@render toggle("sound-l", !s.muted, (v) => void setSound(v))}
          </div>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <span class="block font-medium">Playback sound</span>
            {#if sampleNote}<span class="block text-sm {audio.sampleState === 'error' ? 'text-warn' : 'text-ws-soft'}">{sampleNote}</span>{/if}
          </div>
          <Picker class="w-auto" label="Playback sound" value={s.preferredPlaybackSound} options={SOUNDS} onchange={(v) => settings.update({ preferredPlaybackSound: v as PlaybackSound })} />
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
            <p class="flex items-center gap-1 font-medium"><span id="onscreen-l">On-screen instruments make sound</span><Hint about="On-screen instruments make sound" text="Keys, frets and pads you tap or play from the computer keyboard sound like the instrument. MIDI devices make their own sound." /></p>
          </div>
          {@render toggle("onscreen-l", s.onscreenSound, (v) => settings.update({ onscreenSound: v }))}
        </li>
        <li class="px-4 py-3 text-sm text-ws-soft">
          Sampled piano: Salamander Grand Piano by Alexander Holm, <a class="font-medium text-instr-ink underline underline-offset-4" href="https://creativecommons.org/licenses/by/3.0/" rel="noopener noreferrer" target="_blank">CC BY 3.0</a>.
        </li>
      </ul>
    </section>

    <section id="input" aria-labelledby="input-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("input-h", "Input", Mic)}
      {@render note("input")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="flex min-w-0 flex-1 basis-48 items-center gap-1">
            <span class="font-medium">Audio input</span>
            <Hint about="audio input" text="Device names appear once you have allowed the microphone for this site." />
          </div>
          <Picker class="sm:w-64" label="Audio input" value={s.audioInputDeviceId ?? ""} options={[{ value: "", label: "Default input" }, ...mic.devices.filter((d) => d.deviceId && d.deviceId !== "default").map((d) => ({ value: d.deviceId, label: d.label })), ...(s.audioInputDeviceId && !mic.devices.some((d) => d.deviceId === s.audioInputDeviceId) ? [{ value: s.audioInputDeviceId, label: `${s.audioInputLabel} (not connected)` }] : [])]} onchange={pickDevice} />
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="echo-l">Echo cancellation</span><Hint about="Echo cancellation" text="Off is better for pitch and timing. Turn it on if the speakers bleed into the mic. Applies the next time the microphone starts." /></p>
          </div>
          {@render toggle("echo-l", s.echoCancellation, (v) => settings.update({ echoCancellation: v }))}
        </li>
      </ul>
    </section>

    <section id="latency" aria-labelledby="latency-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("latency-h", "Latency calibration", Timer, "An offset says how late your input reaches Woodshed. Positive means it arrives late; Woodshed subtracts it from every note before grading. Tap along with 20 clicks and it estimates the offset. This is an estimate that includes your reaction time, not a hardware measurement.")}
      {@render note("latency")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium">Browser-reported output latency<Hint about="output latency" text="Diagnostic only, never applied to scoring." /></p>
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
            announce={announceIn("latency")}
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
            announce={announceIn("latency")}
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
              announce={announceIn("latency")}
            />
          </li>
        {:else}
          <li class="px-4 py-3 text-sm text-ws-soft">
            {midi.enabled ? "No MIDI devices connected." : "MIDI is off."} Per-device offsets appear here for each connected device. <a class="font-medium text-instr-ink underline underline-offset-4" href="/music/connect">Connect a device</a>
          </li>
        {/each}
      </ul>
    </section>

    <section id="appearance" aria-labelledby="appearance-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("appearance-h", "Appearance", Palette)}
      {@render note("appearance")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="motion-l">Reduce motion</span><Hint about="Reduce motion" text="Stops animations and transitions everywhere in Woodshed. Your system setting is respected either way." /></p>
          </div>
          {@render toggle("motion-l", s.reduceMotion, (v) => settings.update({ reduceMotion: v }))}
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="hue-l">Instrument colour coding</span><Hint about="Instrument colour coding" text="Each instrument gets its own colour: piano brass, guitar coral, pads magenta. Off uses one colour throughout." /></p>
          </div>
          {@render toggle("hue-l", s.instrumentColorCoding, (v) => settings.update({ instrumentColorCoding: v }))}
        </li>
      </ul>
    </section>

    <section id="goals" aria-labelledby="goals-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("goals-h", "Goals", Target)}
      {@render note("goals")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="goal-l">Weekly session goal</span><Hint about="Weekly session goal" text="How many sessions a week counts as a good week." /></p>
          </div>
          <div class="flex items-center gap-1" role="group" aria-labelledby="goal-l">
            <button type="button" class="{btn} w-11 px-0" aria-label="One fewer session" disabled={s.weeklySessionGoal <= 1} onclick={() => settings.update({ weeklySessionGoal: s.weeklySessionGoal - 1 })}>−</button>
            <span class="tnum w-20 text-center font-display text-xl font-semibold" data-testid="weekly-goal">{s.weeklySessionGoal}<span class="ml-1 text-sm font-normal text-ws-soft">a week</span></span>
            <button type="button" class="{btn} w-11 px-0" aria-label="One more session" disabled={s.weeklySessionGoal >= 14} onclick={() => settings.update({ weeklySessionGoal: s.weeklySessionGoal + 1 })}>+</button>
          </div>
        </li>
      </ul>
    </section>

    <section id="data" aria-labelledby="data-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("data-h", "Your data", Database, "Everything stays in this browser. Backups are files you keep; there is no account and no server copy.")}
      {@render note("data")}
      <DataSection announce={announceIn("data")} {rowCls} />
    </section>

    <p role="status" class="sr-only">{status}</p>
  </div>
</div>

{#snippet heading(id: string, label: string, Icon: typeof Volume2, hint?: string)}
  <div class="mb-3 flex items-center gap-1">
    <h2 {id} class="flex items-center gap-2 font-display text-xl font-semibold">
      <span class="grid size-8 place-items-center rounded-lg text-[oklch(0.2_0.04_288)]" style:background="var(--hue-{SECTIONS.find((x) => `${x.id}-h` === id)?.hue ?? 'create'})" aria-hidden="true"><Icon class="size-4" /></span>{label}
    </h2>
    {#if hint}<Hint about={label.toLowerCase()} text={hint} />{/if}
  </div>
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

{#snippet note(section: string)}
  {#if noteIn === section && status}
    <p class="mb-3 rounded-xl border border-ws-line bg-instr-wash px-4 py-2.5 text-sm font-medium" aria-hidden="true">{status}</p>
  {/if}
{/snippet}

<style>
  .topic[aria-current="location"] {
    color: var(--ws-ink);
    font-weight: 600;
    background: color-mix(in oklch, var(--topic) 16%, transparent);
    box-shadow: inset 3px 0 0 var(--topic);
  }
</style>
