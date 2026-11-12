<script lang="ts">
  // Settings (catalog 5.15): grouped rows, labels left, controls right. Every
  // control here is read by something: the audio graph, the pitch detector, the
  // router offsets, the root attributes for motion and hue. Devices are chosen
  // on Connect only; the Instruments row shows the same stored values.
  import { onMount } from "svelte";
  import { SectionSpy } from "$lib/music/section-spy.svelte";
  import { page } from "$app/state";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Mic from "lucide-svelte/icons/mic";
  import Timer from "lucide-svelte/icons/timer";
  import Palette from "lucide-svelte/icons/palette";
  import Target from "lucide-svelte/icons/target";
  import Database from "lucide-svelte/icons/database";
  import Info from "lucide-svelte/icons/info";
  import type { PlaybackSound } from "@repo/music-core";
  import { AEROPHONE_READING_KEYS } from "@repo/music-core/theory/transposition";
  import CalibrationPanel from "$lib/music/hubs/tools/settings/CalibrationPanel.svelte";
  import DataSection from "$lib/music/hubs/tools/settings/DataSection.svelte";
  import { btn } from "$lib/music/components/ui";
  import Hint from "$lib/music/components/Hint.svelte";
  import { audio, calibration, mic, midi, settings } from "$lib/music/runtime";
  import { AUDIO_INPUT, MIDI_INPUT, deviceInput } from "@repo/music-core/io/calibration";
  import Picker from "$lib/music/components/Picker.svelte";
  import { A4_CHOICES } from "$lib/music/hubs/tools/tuner/tuner";
  import { setDayInstrument, splitOptions, WEEKDAYS } from "$lib/music/today.svelte";

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
    { key: "masterLevel", label: "Overall volume", blurb: "Everything the app plays." },
    { key: "playbackLevel", label: "Playback and drills", blurb: "Demos, prompts and the instruments you play on screen." },
    { key: "metronomeLevel", label: "Metronome", blurb: "The click and the count-in." },
  ] as const;
  const SECTIONS = [
    { id: "audio", label: "Audio", icon: Volume2, hue: "piano" },
    { id: "input", label: "Instruments", icon: Mic, hue: "guitar" },
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

  /** A slider let go: a short sample at the new level (a click for the metronome, a note for the rest). */
  async function sample(key: (typeof LEVELS)[number]["key"]) {
    if (s.muted) return;
    await audio.unlock();
    if (key === "metronomeLevel") audio.click(true);
    else audio.playNote(67, 0.4);
  }

  const midiOffset = $derived(calibration.offset(MIDI_INPUT));
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

<div class="mx-auto grid max-w-4xl gap-6">
  <header>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Settings</h1>
    <p class="mt-1 max-w-prose text-ws-soft">Saved as you change them. Choose devices on <a class="font-medium text-instr-ink underline underline-offset-4" href="/music/connect">Connect</a>.</p>
    <!-- The one thing that can lose work, as a callout with its fix beside it. -->
    <div class="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ws-line bg-instr-wash px-4 py-3">
      <Info class="size-5 shrink-0 text-instr-ink" aria-hidden="true" />
      <p class="min-w-0 flex-1 basis-56 text-sm">Settings and progress live in this browser only. A backup file keeps a copy.</p>
      <a class={btn} href="#data">Back up now</a>
    </div>
    <div class="mt-3">{@render note("top")}</div>
  </header>

  <!-- One row of section anchors above the content (one vertical nav on the page: the app's). On a phone the
       chips scroll sideways in one row; from sm the row wraps and sticks under the strip. -->
  <nav aria-label="Settings sections" class="min-w-0 sm:sticky sm:top-[var(--ws-strip-h,3.75rem)] sm:z-20 sm:-mx-6 sm:bg-ws-bg sm:px-6 sm:py-2">
    <ul class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {#each SECTIONS as sec (sec.id)}
        <li>
          <a
            href="#{sec.id}"
            aria-current={spy.current === sec.id ? "location" : undefined}
            style:--topic="var(--hue-{sec.hue})"
            class="topic flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-ws-line px-3 text-sm text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
          >
            <span class="grid size-6 shrink-0 place-items-center rounded-md" style:color="var(--topic)" aria-hidden="true"><sec.icon class="size-4" /></span>{sec.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-10">
    <section id="audio" aria-labelledby="audio-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("audio-h", "Audio", Volume2)}
      {@render note("audio")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium" id="sound-l">Sound</p>
            <p class="text-sm text-ws-soft" data-testid="sound-status">
              {s.muted ? "Sound off. Nothing in Woodshed plays; your levels are kept." : audio.unlocked ? "Sound on." : "Sound on. It starts at your first tap."}
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
            <div class="min-w-0 flex-1 basis-40">
              <label for={l.key} class="font-medium">{l.label}</label>
              {#if l.blurb}<p class="text-sm text-ws-soft">{l.blurb}</p>{/if}
            </div>
            <div class="flex w-full items-center gap-2 sm:w-72">
              <input
                id={l.key}
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="h-11 min-w-0 flex-1 accent-[var(--instr-ink)]"
                value={s[l.key]}
                oninput={(e) => settings.update({ [l.key]: Number(e.currentTarget.value) })}
                onchange={() => sample(l.key)}
              />
              <span class="tnum w-14 shrink-0 text-right font-display text-lg font-semibold" aria-hidden="true">{Math.round(s[l.key] * 100)}%</span>
            </div>
          </li>
        {/each}
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium" id="onscreen-l">On-screen instruments make sound</p>
            <p class="text-sm text-ws-soft">Keys, frets and pads you tap sound like the instrument. MIDI devices make their own sound.</p>
          </div>
          {@render toggle("onscreen-l", s.onscreenSound, (v) => settings.update({ onscreenSound: v }))}
        </li>
        <li class="px-4 py-3 text-sm">
          <a class="inline-flex min-h-11 items-center font-medium text-instr-ink underline underline-offset-4" href="#latency">Sound feels late? Calibrate latency</a>
        </li>
        <li class="px-4 py-3 text-sm text-ws-soft">
          Sampled piano: Salamander Grand Piano by Alexander Holm, <a class="font-medium text-instr-ink underline underline-offset-4" href="https://creativecommons.org/licenses/by/3.0/" rel="noopener noreferrer" target="_blank">CC BY 3.0</a>.
        </li>
      </ul>
    </section>

    <section id="input" aria-labelledby="input-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("input-h", "Instruments", Mic, "Which microphone and MIDI devices to use is set on Connect, with a live test for each. These rows are about reading and pitch.")}
      {@render note("input")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium">Devices</p>
            <p class="text-sm text-ws-soft" data-testid="settings-devices">
              Microphone: <span class="font-medium text-ws-ink">{s.audioInputLabel}</span>{mic.state === "on" ? ", listening" : ""}{s.echoCancellation ? ", echo cancellation on" : ""}.
              MIDI: <span class="font-medium text-ws-ink">{!midi.enabled ? "off" : `${midi.inputs.length} input${midi.inputs.length === 1 ? "" : "s"}`}</span>.
            </p>
          </div>
          <a class={btn} href="/music/connect">Choose in Connect</a>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="aero-key-l">Aerophone reading key</span><Hint about="Aerophone reading key" text="Match the AE-20's transpose setting. Staffs and fingerings show the note you read and finger; the Aerophone sends concert pitch either way, and that is what is graded and played back." /></p>
          </div>
          <div class="flex gap-1.5" role="group" aria-labelledby="aero-key-l">
            {#each AEROPHONE_READING_KEYS as k (k.id)}
              <button type="button" class="min-h-11 rounded-lg border px-3 text-sm {k.id === s.aerophoneKey ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}" aria-pressed={k.id === s.aerophoneKey} onclick={() => settings.update({ aerophoneKey: k.id })}>{k.label}</button>
            {/each}
          </div>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium">Reference A4<Hint about="Reference A4" text="The pitch A4 is tuned to. The tuner and every drill that listens to the microphone read notes against it. The Tuner's A4 picker changes this same setting." /></p>
          </div>
          <Picker class="tnum w-auto" label="Reference A4" value={String(s.a4Hz)} options={A4_CHOICES.map((hz) => ({ value: String(hz), label: `${hz} Hz${hz === 440 ? " (standard)" : ""}` }))} onchange={(v) => settings.update({ a4Hz: Number(v) })} />
        </li>
      </ul>
    </section>

    <section id="latency" aria-labelledby="latency-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("latency-h", "Latency calibration", Timer, "An offset says how late your input reaches Woodshed. Positive means it arrives late; Woodshed subtracts it from every note before grading. Tap along with 20 clicks and it estimates the offset. This is an estimate that includes your reaction time, not a hardware measurement. Each offset is saved for the input and the sound output in use, so calibrate again on another output such as Bluetooth speakers.")}
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
            current={calibration.offset(AUDIO_INPUT)}
            onsave={(v) => calibration.save(AUDIO_INPUT, v)}
            onreset={() => calibration.reset(AUDIO_INPUT)}
            announce={announceIn("latency")}
          />
        </li>
        <li>
          <CalibrationPanel
            id="midi"
            kind="midi"
            title="MIDI, all devices"
            blurb="Used by every MIDI device without its own offset."
            current={midiOffset}
            onsave={(v) => calibration.save(MIDI_INPUT, v)}
            onreset={() => calibration.reset(MIDI_INPUT)}
            announce={announceIn("latency")}
          />
        </li>
        {#each midi.inputs as port (port.id)}
          {@const profile = midi.profile(port.id)}
          {@const own = calibration.offset(deviceInput(port.id))}
          <li>
            <CalibrationPanel
              id="dev-{port.id}"
              kind="device"
              deviceId={port.id}
              title={profile?.alias || port.name || port.id}
              blurb={own !== undefined ? "Its own offset overrides the MIDI one." : midiOffset !== undefined ? `Uses the MIDI offset (${signed(midiOffset)}) until you save one here.` : "Not calibrated on this output yet."}
              current={own}
              onsave={(v) => calibration.save(deviceInput(port.id), v)}
              onreset={() => calibration.reset(deviceInput(port.id))}
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

    <section id="appearance" aria-labelledby="appearance-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
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

    <section id="goals" aria-labelledby="goals-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
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
        <li class="px-4 py-3">
          <p class="flex items-center gap-1 font-medium">Weekly split<Hint about="Weekly split" text="Today builds each day's set for that day's instrument and its path. The strip changes when you open a block." /></p>
          <ul class="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {#each WEEKDAYS as day, i (day)}
              <li class="flex min-h-11 items-center justify-between gap-3">
                <span class="text-sm">{day}</span>
                <Picker class="w-auto" label="Instrument on {day}s" value={s.weeklySplit?.[i] ?? ""} options={splitOptions(s.activeInstrument)} onchange={(v) => setDayInstrument(i, v)} />
              </li>
            {/each}
          </ul>
        </li>
      </ul>
    </section>

    <section id="data" aria-labelledby="data-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
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
      <span class="grid size-8 place-items-center rounded-lg text-ws-stage" style:background="var(--hue-{SECTIONS.find((x) => `${x.id}-h` === id)?.hue ?? 'create'})" aria-hidden="true"><Icon class="size-4" /></span>{label}
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
    <!-- A plain switch: the knob's side carries the state, so it is never colour alone. -->
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
    border-color: var(--topic);
    background: color-mix(in oklch, var(--topic) 16%, transparent);
  }
</style>
