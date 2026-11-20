<script lang="ts">
  // Practice Lab: free play, captured. Every note from MIDI, the on-screen
  // surface or the microphone is kept with its real note-off, saved as a MIDI
  // take (db.midiTakes, the shape Record uses) and logged as free practice.
  // Unscored by design.
  import { onDestroy, onMount } from "svelte";
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Upload from "@lucide/svelte/icons/upload";
  import { noteName as letters, type InputSource, type NoteEvent } from "@repo/music-core";
  import { note } from "#lib/music/names.svelte.ts";
  /** A note as the player reads names (letters or solfège). */
  const noteName = (midi: number) => note(letters(midi));
  import { LEVEL_FLOOR_DB } from "@repo/music-core/signal/level";
  import { TUNINGS } from "@repo/music-core/data/index";
  import DrillShell, { type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Piano from "#lib/music/components/Piano.svelte";
  import Fretboard from "#lib/music/components/Fretboard.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import { btn, btnStage, panel } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { capture, runInstrument, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { INSTRUMENT_LABEL } from "#lib/music/bench.svelte.ts";
  import { audio, mic, settings, type SequenceHandle } from "#lib/music/runtime/index.ts";
  import { importTrack, listTracks, playTrack, type BackingTrack } from "#lib/music/drills/jam/tracks.ts";
  import { pairNotes, recentTakes, saveTake, takeToSequence, takeStats, type MidiTake } from "#lib/music/takes.ts";
  import Picker from "#lib/music/components/Picker.svelte";
  import { m } from "@repo/i18n/messages.js";
  import { intlLocale } from "@repo/i18n/format";

  const cfg = new DrillSetup("lab", { track: "" });
  const s = $derived(cfg.value);

  let phase = $state<Phase>("ready");
  let status = $state("");
  let events = $state.raw<NoteEvent[]>([]);
  let lastVelocity = $state<number | null>(null);
  let tracks = $state.raw<BackingTrack[]>([]);
  let takes = $state.raw<MidiTake[]>([]);
  let saved = $state.raw<MidiTake | null>(null);
  let trackError = $state("");
  let cap: Capture | null = null;
  let backing: SequenceHandle | null = null;
  let playing = $state<string | null>(null);
  let playback: SequenceHandle | null = null;
  let t0 = 0;

  onMount(async () => {
    [tracks, takes] = await Promise.all([listTracks().catch(() => []), recentTakes()]);
  });

  const instrument = $derived(settings.value.activeInstrument);
  const fretted = $derived(instrument === "guitar" || instrument === "ukulele");
  const tuning = $derived(
    instrument === "ukulele"
      ? (TUNINGS.ukulele.find((t) => t.id === settings.value.ukuleleTuningId) ?? TUNINGS.ukulele[0])
      : (TUNINGS.guitar.find((t) => t.id === settings.value.guitarTuningId) ?? TUNINGS.guitar[0]),
  );
  const stats = $derived(takeStats(events));
  const SOURCE: Record<InputSource, string> = {
    midi: m.music_runtime_lab_source_midi(),
    onscreen: m.music_runtime_lab_source_onscreen(),
    audio: m.music_runtime_lab_source_audio(),
    click: m.music_runtime_lab_source_click(),
  };
  const recent = $derived(events.filter((e) => e.kind === "noteon").slice(-10));
  const micOn = $derived(mic.state === "on");
  // The microphone only makes sense for instruments it can hear.
  const canMic = $derived(instrument !== "piano" && instrument !== "mpc");
  const levelPct = $derived(Math.max(0, Math.min(1, (mic.level - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB)));

  async function toggleMic() {
    if (micOn) {
      mic.stop();
      status = m.music_runtime_lab_mic_off();
      return;
    }
    const ok = await mic.start();
    status = ok ? m.music_runtime_lab_listening() : mic.error;
  }

  async function start(ctx: RunContext) {
    saved = null;
    events = [];
    lastVelocity = null;
    t0 = ctx.downbeat;
    cap = capture(t0, (e) => {
      if (e.kind !== "noteon" && e.kind !== "noteoff") return;
      events = [...events, e];
      if (e.kind === "noteon" && e.velocityMeasured) lastVelocity = e.velocity;
    });
    status = m.music_runtime_lab_recording_status();
    if (s.track) {
      try {
        backing = await playTrack(s.track);
        status = m.music_runtime_lab_recording_over_backing();
      } catch (e) {
        status = (e as Error).message;
      }
    }
  }

  async function stop() {
    backing?.stop();
    backing = null;
    cap?.stop();
    mic.stop();
    const endAt = performance.now();
    const all = cap?.notes ?? [];
    cap = null;
    phase = "results";
    const st = takeStats(all);
    if (!st.count) {
      status = m.music_runtime_lab_nothing_saved();
      return;
    }
    const inst = runInstrument(all);
    const when = new Date();
    const take: MidiTake = {
      id: crypto.randomUUID(),
      createdAt: when.getTime(),
      name: m.music_runtime_lab_take_name({
        date: when.toLocaleDateString(intlLocale(), { month: "short", day: "numeric" }),
        time: when.toLocaleTimeString(intlLocale(), { hour: "numeric", minute: "2-digit" }),
      }),
      notes: pairNotes(all, t0, endAt),
      durationMs: Math.round(endAt - t0),
      instrument: inst,
    };
    await saveTake(take);
    saved = take;
    takes = [take, ...takes.filter((t) => t.id !== take.id)].slice(0, 6);
    await practice.logSession(
      "free-practice",
      inst,
      {
        exerciseId: "lab.free-play",
        setupKey: s.track ? "lab|backing" : "lab",
        promptIds: [],
        skillIds: [],
        difficulty: 0,
        instrument: inst,
        params: { notes: st.count, distinct: st.distinct, takeId: take.id, backing: !!s.track },
        startedAt: Date.now() - take.durationMs,
        endedAt: Date.now(),
        assistance: "guided",
        headline: m.music_runtime_lab_headline({ count: st.count }),
      },
      ["free-play"],
    );
    status = m.music_runtime_lab_saved_status({ name: take.name, count: st.count });
  }

  function stopPlayback() {
    playback?.stop();
    playback = null;
    playing = null;
  }
  async function playTake(t: MidiTake) {
    if (playing === t.id) return stopPlayback();
    stopPlayback();
    await audio.unlock();
    const h = audio.playSequence(takeToSequence(t));
    playback = h;
    playing = t.id;
    void h.done.then(() => {
      if (playback === h) stopPlayback();
    });
  }

  async function addTrack(file: File | undefined) {
    if (!file) return;
    trackError = "";
    try {
      const t = await importTrack(file);
      tracks = [t, ...tracks];
      cfg.set({ track: t.id });
    } catch (e) {
      trackError = (e as Error).message;
    }
  }

  onDestroy(() => {
    backing?.stop();
    cap?.stop();
    mic.stop();
    stopPlayback();
  });

  const summaryLine = $derived([
    {
      text: s.track
        ? ((name) => (name ? m.music_runtime_lab_summary_over({ track: name }) : m.music_runtime_lab_summary_your_track()))(tracks.find((t) => t.id === s.track)?.name)
        : m.music_runtime_lab_summary_no_backing(),
      focus: "track",
    },
    ...(micOn ? [{ text: m.music_runtime_lab_summary_mic_on() }] : []),
  ]);
  const secs = (ms: number) =>
    ms < 60000
      ? m.music_runtime_lab_seconds({ seconds: Math.round(ms / 1000) })
      : m.music_runtime_lab_minutes_seconds({ minutes: Math.floor(ms / 60000), seconds: Math.round((ms % 60000) / 1000) });
  const rangeOf = (st: { low: number | null; high: number | null }) =>
    st.low === null || st.high === null
      ? m.music_runtime_lab_range_none()
      : st.low === st.high
        ? noteName(st.low)
        : m.music_runtime_lab_range({ low: noteName(st.low), high: noteName(st.high) });

  const DRILLS = [
    { href: "/music/scales", label: m.music_runtime_lab_drill_scales(), hint: m.music_runtime_lab_hint_piano() },
    { href: "/music/two-hand", label: m.music_runtime_lab_drill_two_hand(), hint: m.music_runtime_lab_hint_piano() },
    { href: "/music/pads", label: m.music_runtime_lab_drill_pads(), hint: m.music_runtime_lab_hint_pads() },
    { href: "/music/fretboard", label: m.music_runtime_lab_drill_spider(), hint: m.music_runtime_lab_hint_fretted() },
    { href: "/music/chords", label: m.music_runtime_lab_drill_chords(), hint: m.music_runtime_lab_hint_fretted() },
    { href: "/music/aerophone?mode=articulation", label: m.music_runtime_lab_drill_articulation(), hint: m.music_runtime_lab_hint_aerophone() },
    { href: "/music/tuner", label: m.music_runtime_lab_drill_tuner(), hint: m.music_runtime_lab_hint_any() },
    { href: "/music/studio", label: m.music_runtime_lab_drill_songs(), hint: m.music_runtime_lab_hint_repertoire() },
  ];
</script>

<svelte:head><title>{m.music_runtime_lab_head_title()}</title></svelte:head>

<DrillShell
  title={m.music_runtime_lab_title()}
  hue={instrument}
  blurb={m.music_runtime_lab_blurb()}
  summary={summaryLine}
  checkable={false}
  bind:phase
  bind:status
  startLabel={m.music_runtime_lab_start()}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1 text-sm" data-setup="track">
        <span class="font-medium">{m.music_runtime_lab_backing_track()}</span>
        <div class="flex flex-wrap items-center gap-2">
          <Picker class="w-auto min-w-40" label={m.music_runtime_lab_backing_track()} value={s.track} options={[{ value: "", label: m.music_runtime_lab_none() }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]} onchange={(v) => cfg.set({ track: v })} />
          <label class="{btn} cursor-pointer focus-within:outline-2">
            <Upload class="size-4" aria-hidden="true" />{m.music_runtime_lab_import()}
            <input class="sr-only" type="file" accept="audio/*" aria-label={m.music_runtime_lab_import_label()} onchange={(e) => addTrack(e.currentTarget.files?.[0])} />
          </label>
        </div>
        {#if trackError}<p role="alert" class="font-medium text-destructive">{trackError}</p>{/if}
      </div>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase !== "ready"}
      <!-- Two counters in the HUD; the rest of the tally sits on the stage. -->
      <Stat label={m.music_runtime_lab_stat_notes()} value={stats.count} />
      <Stat label={m.music_runtime_lab_stat_range()} value={rangeOf(stats)} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phase !== "ready" && stats.count}
      <p class="mb-2 text-sm text-ws-stage-soft" data-testid="lab-tally">
        {m.music_runtime_lab_tally({ count: stats.distinct })}{#each Object.entries(stats.perSource) as [src, n] (src)}, {m.music_runtime_lab_tally_source({ count: n, source: SOURCE[src as InputSource] })}{/each}.
      </p>
    {/if}
    <div class="mb-3 flex flex-wrap items-center gap-3">
      {#if phase === "running"}
        <span class="rec flex items-center gap-2 text-sm font-semibold"><span class="dot" aria-hidden="true"></span>{m.music_runtime_lab_recording()}</span>
      {/if}
      {#if canMic && phase !== "results"}
        <button type="button" class={btnStage} aria-pressed={micOn} onclick={toggleMic}>
          {#if micOn}<MicOff class="size-4" aria-hidden="true" />{m.music_runtime_lab_stop_listening()}{:else}<Mic class="size-4" aria-hidden="true" />{m.music_runtime_lab_listen_mic()}{/if}
        </button>
      {/if}
      <div class="flex min-w-48 flex-1 items-center gap-2 text-sm">
        {#if micOn}
          <span class="text-ws-stage-soft">{m.music_runtime_lab_input_level()}</span>
          <meter class="level" min="0" max="1" low="0.5" high="0.9" optimum="0.7" value={levelPct} aria-label={m.music_runtime_lab_mic_level()}>{Math.round(mic.level)} dB</meter>
          <span class="tnum">{Math.round(mic.level)} dB{mic.advice ? `, ${mic.advice.label}` : ""}</span>
        {:else if lastVelocity !== null}
          <span class="text-ws-stage-soft">{m.music_runtime_lab_last_velocity()}</span>
          <meter class="level" min="0" max="1" value={lastVelocity} aria-label={m.music_runtime_lab_last_midi_velocity()}>{Math.round(lastVelocity * 127)}</meter>
          <span class="tnum">{m.music_runtime_lab_velocity_of({ value: Math.round(lastVelocity * 127) })}</span>
        {:else if phase === "running"}
          <span class="text-ws-stage-soft">{m.music_runtime_lab_level_hint()}</span>
        {/if}
      </div>
    </div>
    {#if fretted}
      <Fretboard openStrings={tuning.openStrings} from={0} to={12} label={m.music_runtime_lab_fretboard({ tuning: tuning.name })} />
    {:else}
      <Piano low={48} high={84} label={m.music_runtime_lab_piano_keyboard()} />
    {/if}
    {#if recent.length}
      <p class="mt-3 text-sm" aria-hidden="true">
        <span class="text-ws-stage-soft">{m.music_runtime_lab_last_notes()}</span>
        {#each recent as n, i (i)}<span class="tnum mr-2 font-medium">{noteName(n.midi)}</span>{/each}
      </p>
    {/if}
  {/snippet}

  {#snippet results()}
    <article class="{panel} flex flex-wrap items-start gap-4">
      <div class="min-w-0 flex-1 basis-72">
        {#if saved}
          <p class="font-display text-2xl font-semibold">{m.music_runtime_lab_take_saved({ count: saved.notes.length, duration: secs(saved.durationMs) })}</p>
          <p class="mt-1 text-sm text-ws-soft">{m.music_runtime_lab_take_summary({ count: stats.distinct, range: rangeOf(stats) })}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class={btn} onclick={() => playTake(saved!)}>
              {#if playing === saved.id}<Square class="size-4" aria-hidden="true" />{m.music_runtime_lab_stop()}{:else}<Play class="size-4" aria-hidden="true" />{m.music_runtime_lab_play_back()}{/if}
            </button>
            <a class={btn} href="/music/record">{m.music_runtime_lab_open_in_record()}</a>
          </div>
        {:else}
          <p class="font-display text-2xl font-semibold">{m.music_runtime_lab_nothing_played()}</p>
        {/if}
      </div>
      {#if saved}
        <div class="text-right">
          <p class="tnum font-display text-5xl font-bold leading-none">{saved.notes.length}</p>
          <p class="mt-1 text-sm text-ws-soft">{m.music_runtime_lab_notes_kept()}</p>
        </div>
      {/if}
    </article>
  {/snippet}
</DrillShell>

{#if phase !== "running"}
  <div class="mx-auto mt-8 grid w-full max-w-6xl gap-6 lg:grid-cols-2">
    <section aria-labelledby="takes-h">
      <h2 id="takes-h" class="font-display text-xl font-semibold">{m.music_runtime_lab_recent_takes()}</h2>
      {#if takes.length}
        <ul class="mt-2 divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface" aria-label={m.music_runtime_lab_recent_takes()}>
          {#each takes as t (t.id)}
            <li class="flex items-center gap-3 px-4 py-2">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{t.name}</span>
                <span class="tnum block text-sm text-ws-soft">{t.instrument ? m.music_runtime_lab_take_meta_instrument({ count: t.notes.length, duration: secs(t.durationMs), instrument: INSTRUMENT_LABEL[t.instrument] }) : m.music_runtime_lab_take_meta({ count: t.notes.length, duration: secs(t.durationMs) })}</span>
              </span>
              <button type="button" class={btn} aria-label={(playing === t.id ? m.music_runtime_lab_stop_take : m.music_runtime_lab_play_take)({ name: t.name })} onclick={() => playTake(t)}>
                {#if playing === t.id}<Square class="size-4" aria-hidden="true" />{:else}<Play class="size-4" aria-hidden="true" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-ws-soft">{m.music_runtime_lab_no_takes()}</p>
      {/if}
    </section>
    <section aria-labelledby="drills-h">
      <h2 id="drills-h" class="font-display text-xl font-semibold">{m.music_runtime_lab_turn_into_practice()}</h2>
      <ul class="mt-2 grid grid-cols-2 gap-2">
        {#each DRILLS as d (d.href)}
          <li>
            <a class="flex min-h-14 flex-col justify-center rounded-xl border border-ws-line bg-ws-surface px-3 py-2 hover:bg-ws-raised" href={d.href}>
              <span class="font-semibold">{d.label}</span>
              <span class="text-[13px] text-ws-soft">{d.hint}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}

<style>
  .rec .dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
    background: var(--destructive);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rec .dot {
      animation: none;
    }
  }
  .level {
    flex: 1;
    min-width: 6rem;
    height: 0.6rem;
  }
</style>
