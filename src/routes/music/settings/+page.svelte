<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { micLabel } from "#lib/music/hubs/connect/rig.ts";
  // Settings (catalog 5.15): grouped rows, labels left, controls right. Every
  // control here is read by something: the audio graph, the pitch detector, the
  // router offsets, the root attributes for motion and hue. Devices are chosen
  // on Connect only; the Instruments row shows the same stored values.
  import { onMount } from "svelte";
  import { SectionSpy } from "#lib/music/section-spy.svelte.ts";
  import { page } from "$app/state";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import Mic from "@lucide/svelte/icons/mic";
  import Timer from "@lucide/svelte/icons/timer";
  import Palette from "@lucide/svelte/icons/palette";
  import Target from "@lucide/svelte/icons/target";
  import Database from "@lucide/svelte/icons/database";
  import Info from "@lucide/svelte/icons/info";
  import type { PlaybackSound } from "@repo/music-core";
  import { AEROPHONE_READING_KEYS } from "@repo/music-core/theory/transposition";
  import { keyName, note as noteText } from "#lib/music/names.svelte.ts";
  import CalibrationPanel from "#lib/music/hubs/tools/settings/CalibrationPanel.svelte";
  import DataSection from "#lib/music/hubs/tools/settings/DataSection.svelte";
  import { btn } from "#lib/music/components/ui.ts";
  import Hint from "#lib/music/components/Hint.svelte";
  import { audio, calibration, mic, midi, settings } from "#lib/music/runtime/index.ts";
  import { AUDIO_INPUT, MIDI_INPUT, deviceInput } from "@repo/music-core/io/calibration";
  import Picker from "#lib/music/components/Picker.svelte";
  import { A4_CHOICES } from "#lib/music/hubs/tools/tuner/tuner.ts";
  import { setDayInstrument, splitOptions, WEEKDAYS } from "#lib/music/today.svelte.ts";
  import { getLocale, locales, setLocale, type Locale } from "@repo/i18n/runtime.js";
  import { getNoteNaming, type NoteNaming } from "@repo/music-core";

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
    { value: "salamander-piano", label: m.music_shell_settings_sound_sampled() },
    { value: "warm-synth", label: m.music_shell_settings_sound_warm() },
    { value: "synth", label: m.music_shell_settings_sound_synth() },
    { value: "e-piano", label: m.music_shell_settings_sound_epiano() },
    { value: "square", label: m.music_shell_settings_sound_square() },
    { value: "saw", label: m.music_shell_settings_sound_saw() },
  ];
  const LEVELS = [
    { key: "masterLevel", label: m.music_shell_settings_level_master(), blurb: m.music_shell_settings_level_master_blurb() },
    { key: "playbackLevel", label: m.music_shell_settings_level_playback(), blurb: m.music_shell_settings_level_playback_blurb() },
    { key: "metronomeLevel", label: m.music_shell_settings_level_metronome(), blurb: m.music_shell_settings_level_metronome_blurb() },
  ] as const;
  const SECTIONS = [
    { id: "audio", label: m.music_shell_settings_sec_audio(), icon: Volume2, hue: "piano" },
    { id: "input", label: m.music_shell_settings_sec_instruments(), icon: Mic, hue: "guitar" },
    { id: "latency", label: m.music_shell_settings_sec_latency(), icon: Timer, hue: "rhythm" },
    { id: "appearance", label: m.music_shell_settings_sec_appearance(), icon: Palette, hue: "ear" },
    { id: "goals", label: m.music_shell_settings_sec_goals(), icon: Target, hue: "mpc" },
    { id: "data", label: m.music_shell_settings_sec_data(), icon: Database, hue: "aerophone" },
  ];
  const spy = new SectionSpy(SECTIONS.map((x) => x.id));
  const rowCls = "flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3";
  const listCls = "divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface";

  let latency = $state(audio.latencyInfo());
  const ms = (v: number | null) => (v === null ? m.music_shell_settings_not_reported() : m.music_shell_settings_ms({ value: v }));

  // Language: each named in itself, so anyone can find their own. Choosing one stores it in Paraglide's
  // cookie and reloads the page in it.
  const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", es: "Español", fr: "Français", ht: "Kreyòl ayisyen" };
  const LANGUAGES = locales.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }));
  const locale = getLocale();
  const chooseLanguage = (v: string) => {
    if (v !== locale) setLocale(v as Locale);
  };

  // Note names: letters, fixed do or movable do. Every name on every screen
  // follows it, so changing it reloads the page, like the language.
  const NOTE_NAME_OPTIONS = [
    { value: "letters", label: m.music_shell_settings_note_names_letters() },
    { value: "fixed", label: m.music_shell_settings_note_names_fixed() },
    { value: "movable", label: m.music_shell_settings_note_names_movable() },
  ];
  const noteNaming = getNoteNaming();
  const chooseNoteNames = async (v: string) => {
    if (v === noteNaming) return;
    await settings.update({ noteNames: v as NoteNaming });
    location.reload();
  };

  onMount(() => spy.watch());
  onMount(() => {
    const restored = page.url.searchParams.get("restored");
    if (restored !== null) {
      const files = Number(page.url.searchParams.get("files") ?? 0);
      say("top", files ? m.music_shell_settings_restored_files({ rows: restored, files }) : m.music_shell_settings_restored({ rows: restored }));
    } else if (page.url.searchParams.has("reset")) say("top", m.music_shell_settings_reset());
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
    if (!audio.unlocked) return say("audio", m.music_shell_settings_sound_failed());
    audio.playSequence(
      CADENCE.flatMap((chord, i) => chord.map((midi) => ({ midi, time: i * 0.7, duration: i === 3 ? 1.4 : 0.65, velocity: 0.7 }))),
    );
    say("audio", m.music_shell_settings_cadence({ c: noteText("C"), f: noteText("F"), g: noteText("G") }));
  }

  async function setSound(on: boolean) {
    await settings.update({ muted: !on });
    if (!on) return say("audio", m.music_shell_settings_sound_off_all());
    await audio.unlock();
    latency = audio.latencyInfo();
    say("audio", audio.unlocked ? m.music_shell_settings_sound_is_on() : m.music_shell_settings_sound_held());
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
        ? m.music_shell_settings_samples_loading()
        : audio.sampleState === "error"
          ? audio.sampleError
          : audio.sampleState === "ready"
            ? m.music_shell_settings_samples_ready()
            : m.music_shell_settings_samples_later(),
  );
</script>

<svelte:head><title>{m.music_shell_settings_title()}</title></svelte:head>

<div class="mx-auto grid max-w-4xl gap-6">
  <header>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{m.music_shell_nav_settings()}</h1>
    <p class="mt-1 max-w-prose text-ws-soft">{@html m.music_shell_settings_intro({ link: `<a class="font-medium text-instr-ink underline underline-offset-4" href="/music/connect">${m.music_shell_nav_connect()}</a>` })}</p>
    <!-- The one thing that can lose work, as a callout with its fix beside it. -->
    <div class="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ws-line bg-instr-wash px-4 py-3">
      <Info class="size-5 shrink-0 text-instr-ink" aria-hidden="true" />
      <p class="min-w-0 flex-1 basis-56 text-sm">{m.music_shell_settings_local_only()}</p>
      <a class={btn} href="#data">{m.music_shell_settings_back_up_now()}</a>
    </div>
    <div class="mt-3">{@render note("top")}</div>
  </header>

  <!-- One row of section anchors above the content (one vertical nav on the page: the app's). On a phone the
       chips scroll sideways in one row; from sm the row wraps and sticks under the strip. -->
  <nav aria-label={m.music_shell_settings_sections()} class="min-w-0 sm:sticky sm:top-[var(--ws-strip-h,3.75rem)] sm:z-20 sm:-mx-6 sm:bg-ws-bg sm:px-6 sm:py-2">
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
      {@render heading("audio-h", m.music_shell_settings_sec_audio(), Volume2)}
      {@render note("audio")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium" id="sound-l">{m.music_shell_input_sound()}</p>
            <p class="text-sm text-ws-soft" data-testid="sound-status">
              {s.muted ? m.music_shell_settings_sound_status_off() : audio.unlocked ? m.music_shell_settings_sound_status_on() : m.music_shell_settings_sound_status_first_tap()}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class={btn} onclick={playTest} disabled={s.muted}>{m.music_shell_settings_play_test()}</button>
            {@render toggle("sound-l", !s.muted, (v) => void setSound(v))}
          </div>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <span class="block font-medium">{m.music_shell_settings_playback_sound()}</span>
            {#if sampleNote}<span class="block text-sm {audio.sampleState === 'error' ? 'text-warn' : 'text-ws-soft'}">{sampleNote}</span>{/if}
          </div>
          <Picker class="w-auto" label={m.music_shell_settings_playback_sound()} value={s.preferredPlaybackSound} options={SOUNDS} onchange={(v) => settings.update({ preferredPlaybackSound: v as PlaybackSound })} />
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
              <span class="tnum w-14 shrink-0 text-right font-display text-lg font-semibold" aria-hidden="true">{m.music_shell_pct({ value: Math.round(s[l.key] * 100) })}</span>
            </div>
          </li>
        {/each}
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium" id="onscreen-l">{m.music_shell_settings_onscreen()}</p>
            <p class="text-sm text-ws-soft">{m.music_shell_settings_onscreen_blurb()}</p>
          </div>
          {@render toggle("onscreen-l", s.onscreenSound, (v) => settings.update({ onscreenSound: v }))}
        </li>
        <li class="px-4 py-3 text-sm">
          <a class="inline-flex min-h-11 items-center font-medium text-instr-ink underline underline-offset-4" href="#latency">{m.music_shell_settings_late_link()}</a>
        </li>
        <li class="px-4 py-3 text-sm text-ws-soft">
          {@html m.music_shell_settings_credit({ license: `<a class="font-medium text-instr-ink underline underline-offset-4" href="https://creativecommons.org/licenses/by/3.0/" rel="noopener noreferrer" target="_blank">CC BY 3.0</a>` })}
        </li>
      </ul>
    </section>

    <section id="input" aria-labelledby="input-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("input-h", m.music_shell_settings_sec_instruments(), Mic, m.music_shell_settings_instruments_hint())}
      {@render note("input")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium">{m.music_shell_settings_devices()}</p>
            <p class="text-sm text-ws-soft" data-testid="settings-devices">
              {m.music_shell_settings_mic_label()} <span class="font-medium text-ws-ink">{micLabel(s.audioInputLabel)}</span>{mic.state === "on" ? `, ${m.music_shell_settings_listening()}` : ""}{s.echoCancellation ? `, ${m.music_shell_settings_echo_on()}` : ""}.
              {m.music_shell_settings_midi_label()} <span class="font-medium text-ws-ink">{!midi.enabled ? m.music_shell_settings_midi_off() : m.music_shell_settings_midi_inputs({ count: midi.inputs.length })}</span>.
            </p>
          </div>
          <a class={btn} href="/music/connect">{m.music_shell_settings_choose_connect()}</a>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-medium">{m.music_shell_search_clips()}</p>
            <p class="text-sm text-ws-soft">{m.music_shell_settings_test_recordings_blurb()}</p>
          </div>
          <a class={btn} href="/music/clips">{m.music_shell_settings_record_clips()}</a>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="aero-key-l">{m.music_shell_settings_aero_key()}</span><Hint about={m.music_shell_settings_aero_key()} text={m.music_shell_settings_aero_key_hint()} /></p>
          </div>
          <div class="flex gap-1.5" role="group" aria-labelledby="aero-key-l">
            {#each AEROPHONE_READING_KEYS as k (k.id)}
              <button type="button" class="min-h-11 rounded-lg border px-3 text-sm {k.id === s.aerophoneKey ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}" aria-pressed={k.id === s.aerophoneKey} onclick={() => settings.update({ aerophoneKey: k.id })}>{keyName(k.label)}</button>
            {/each}
          </div>
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium">{m.music_shell_settings_a4({ a4: noteText("A4") })}<Hint about={m.music_shell_settings_a4({ a4: noteText("A4") })} text={m.music_shell_settings_a4_hint({ a4: noteText("A4") })} /></p>
          </div>
          <Picker class="tnum w-auto" label={m.music_shell_settings_a4({ a4: noteText("A4") })} value={String(s.a4Hz)} options={A4_CHOICES.map((hz) => ({ value: String(hz), label: hz === 440 ? m.music_shell_settings_hz_standard({ hz }) : m.music_shell_settings_hz({ hz }) }))} onchange={(v) => settings.update({ a4Hz: Number(v) })} />
        </li>
      </ul>
    </section>

    <section id="latency" aria-labelledby="latency-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("latency-h", m.music_shell_settings_latency_heading(), Timer, m.music_shell_settings_latency_hint())}
      {@render note("latency")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium">{m.music_shell_settings_output_latency()}<Hint about={m.music_shell_settings_output_latency_about()} text={m.music_shell_settings_output_latency_hint()} /></p>
          </div>
          <p class="tnum text-sm">
            {m.music_shell_settings_output_base({ output: ms(latency.outputLatencyMs), base: ms(latency.baseLatencyMs) })}
          </p>
        </li>
        <li>
          <CalibrationPanel
            id="mic"
            kind="audio"
            title={m.music_shell_input_microphone()}
            blurb={m.music_shell_settings_mic_blurb()}
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
            title={m.music_shell_settings_midi_all()}
            blurb={m.music_shell_settings_midi_all_blurb()}
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
              blurb={own !== undefined ? m.music_shell_settings_own_offset() : midiOffset !== undefined ? m.music_shell_settings_uses_midi_offset({ offset: signed(midiOffset) }) : m.music_shell_settings_not_calibrated()}
              current={own}
              onsave={(v) => calibration.save(deviceInput(port.id), v)}
              onreset={() => calibration.reset(deviceInput(port.id))}
              announce={announceIn("latency")}
            />
          </li>
        {:else}
          <li class="px-4 py-3 text-sm text-ws-soft">
            {midi.enabled ? m.music_shell_settings_no_midi_devices() : m.music_shell_settings_midi_is_off()} {m.music_shell_settings_per_device()} <a class="font-medium text-instr-ink underline underline-offset-4" href="/music/connect">{m.music_shell_settings_connect_device()}</a>
          </li>
        {/each}
      </ul>
    </section>

    <section id="appearance" aria-labelledby="appearance-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("appearance-h", m.music_shell_settings_sec_appearance(), Palette)}
      {@render note("appearance")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="motion-l">{m.music_shell_settings_reduce_motion()}</span><Hint about={m.music_shell_settings_reduce_motion()} text={m.music_shell_settings_reduce_motion_hint()} /></p>
          </div>
          {@render toggle("motion-l", s.reduceMotion, (v) => settings.update({ reduceMotion: v }))}
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="hue-l">{m.music_shell_settings_colour_coding()}</span><Hint about={m.music_shell_settings_colour_coding()} text={m.music_shell_settings_colour_coding_hint()} /></p>
          </div>
          {@render toggle("hue-l", s.instrumentColorCoding, (v) => settings.update({ instrumentColorCoding: v }))}
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="language-l">{m.music_shell_settings_language()}</span><Hint about={m.music_shell_settings_language()} text={m.music_shell_settings_language_hint()} /></p>
          </div>
          <Picker class="w-auto" label={m.music_shell_settings_language()} value={locale} options={LANGUAGES} onchange={chooseLanguage} />
        </li>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="note-names-l">{m.music_shell_settings_note_names()}</span><Hint about={m.music_shell_settings_note_names()} text={m.music_shell_settings_note_names_hint()} /></p>
          </div>
          <Picker class="w-auto" label={m.music_shell_settings_note_names()} value={noteNaming} options={NOTE_NAME_OPTIONS} onchange={chooseNoteNames} />
        </li>
      </ul>
    </section>

    <section id="goals" aria-labelledby="goals-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("goals-h", m.music_shell_settings_sec_goals(), Target)}
      {@render note("goals")}
      <ul class={listCls}>
        <li class={rowCls}>
          <div class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-1 font-medium"><span id="goal-l">{m.music_shell_settings_weekly_goal()}</span><Hint about={m.music_shell_settings_weekly_goal()} text={m.music_shell_settings_weekly_goal_hint()} /></p>
          </div>
          <div class="flex items-center gap-1" role="group" aria-labelledby="goal-l">
            <button type="button" class="{btn} w-11 px-0" aria-label={m.music_shell_settings_one_fewer()} disabled={s.weeklySessionGoal <= 1} onclick={() => settings.update({ weeklySessionGoal: s.weeklySessionGoal - 1 })}>−</button>
            <span class="tnum w-20 text-center font-display text-xl font-semibold" data-testid="weekly-goal">{s.weeklySessionGoal}<span class="ml-1 text-sm font-normal text-ws-soft">{m.music_shell_settings_a_week()}</span></span>
            <button type="button" class="{btn} w-11 px-0" aria-label={m.music_shell_settings_one_more()} disabled={s.weeklySessionGoal >= 14} onclick={() => settings.update({ weeklySessionGoal: s.weeklySessionGoal + 1 })}>+</button>
          </div>
        </li>
        <li class="px-4 py-3">
          <p class="flex items-center gap-1 font-medium">{m.music_shell_settings_weekly_split()}<Hint about={m.music_shell_settings_weekly_split()} text={m.music_shell_settings_weekly_split_hint()} /></p>
          <ul class="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {#each WEEKDAYS as day, i (day)}
              <li class="flex min-h-11 items-center justify-between gap-3">
                <span class="text-sm">{day}</span>
                <Picker class="w-auto" label={m.music_shell_settings_instrument_on({ day })} value={s.weeklySplit?.[i] ?? ""} options={splitOptions(s.activeInstrument)} onchange={(v) => setDayInstrument(i, v)} />
              </li>
            {/each}
          </ul>
        </li>
      </ul>
    </section>

    <section id="data" aria-labelledby="data-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] sm:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)]">
      {@render heading("data-h", m.music_shell_settings_sec_data(), Database, m.music_shell_settings_data_hint())}
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
