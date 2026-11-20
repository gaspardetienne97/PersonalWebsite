<script lang="ts" module>
  import { m } from "@repo/i18n/messages.js";
  // One tap-along run at a time across every panel on the page.
  let active = $state<string | null>(null);
  /** A tap-along is running: Space is its tap, not a drill's Start. */
  export const calibrating = () => active !== null;
</script>

<script lang="ts">
  import Hint from "#lib/music/components/Hint.svelte";
  // Tap-along latency calibration (hardware notes 7): 20 clicks at 90 BPM, taps
  // from the panel's own source, scored by estimateOffset. The router already
  // subtracted the saved offset from MIDI and microphone events, so it is added
  // back here: calibration always measures the raw input.
  import { onDestroy, onMount, tick } from "svelte";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import { CALIBRATION, estimateOffset, type CalibrationResult } from "@repo/music-core/io/calibration";
  import { clamp, type InputEvent } from "@repo/music-core";
  import { audio, calibration, input, mic, midi } from "#lib/music/runtime/index.ts";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";

  interface Props {
    id: string;
    title: string;
    blurb: string;
    /** "audio": microphone onsets; "midi": any MIDI port; "device": one port. */
    kind: "audio" | "midi" | "device";
    deviceId?: string;
    current: number | undefined;
    onsave: (ms: number) => Promise<void> | void;
    onreset: () => Promise<void> | void;
    announce: (msg: string) => void;
    /** Start the tap-along as the panel opens (the drill's inline offer: its Calibrate button was the ask). */
    autorun?: boolean;
  }
  let { id, title, blurb, kind, deviceId, current, onsave, onreset, announce, autorun = false }: Props = $props();

  const BEAT_MS = 60000 / CALIBRATION.bpm;
  const TAP_MIDI = 60;
  const bound = (ms: number | undefined) => clamp(Number.isFinite(ms) ? (ms as number) : 0, -500, 500);

  let running = $derived(active === id);
  let count = $state(0);
  let result = $state<CalibrationResult | null>(null);
  let onscreenOnly = $state(false);
  let message = $state("");
  let tapButton = $state<HTMLButtonElement>();

  let clicks: number[] = [];
  let taps: number[] = [];
  let sources = new Set<string>();
  let unsub: (() => void) | undefined;
  let handle: { stop(): void } | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;

  function rawTime(e: InputEvent): number | undefined {
    if (e.kind === "noteon" && e.source === "onscreen") return e.at;
    if (kind === "audio")
      return e.kind === "onset" && e.source === "audio" ? e.at + bound(calibration.applied.audioMs) : undefined;
    if (e.kind !== "noteon" || e.source !== "midi") return undefined;
    if (kind === "device" && e.deviceId !== deviceId) return undefined;
    const applied = calibration.applied;
    return e.at + bound((e.deviceId ? applied.deviceMs[e.deviceId] : undefined) ?? applied.midiMs);
  }

  function onEvent(e: InputEvent) {
    const at = rawTime(e);
    if (at === undefined) return;
    taps.push(at);
    sources.add("source" in e ? e.source : "midi");
  }

  function tapNow() {
    if (!running) return;
    input.tap(TAP_MIDI, true);
    input.tap(TAP_MIDI, false);
  }

  function onKey(e: KeyboardEvent) {
    if (!running || (e.code !== "Space" && e.code !== "Enter") || e.repeat) return;
    e.preventDefault();
    tapNow();
  }

  function teardown() {
    clearTimeout(finishTimer);
    handle?.stop();
    handle = undefined;
    unsub?.();
    unsub = undefined;
    if (kind === "audio") mic.stop();
    delete (window as { __woodshedCalibration?: unknown }).__woodshedCalibration;
    if (active === id) active = null;
  }

  function finish() {
    teardown();
    const r = estimateOffset(clicks, taps);
    result = r;
    onscreenOnly = sources.size === 1 && sources.has("onscreen");
    message = r.ok
      ? m.music_hubs_cal_result({ describe: describe(r.offsetMs), spread: Math.round(r.iqrMs), answered: r.answered, total: CALIBRATION.clicks - CALIBRATION.warmup })
      : r.message;
    announce(m.music_hubs_pair({ a: title, b: r.ok ? describe(r.offsetMs) : r.message }));
  }

  async function run() {
    if (active) return;
    message = "";
    result = null;
    await audio.unlock();
    if (!audio.unlocked) {
      message = m.music_hubs_cal_no_sound();
      return;
    }
    if (kind !== "audio" && !midi.enabled && !(await midi.enable())) {
      message = midi.error || m.music_hubs_cal_no_midi();
      announce(message);
      return;
    }
    if (kind === "audio" && !(await mic.start())) {
      message = mic.error || m.music_hubs_mic_failed();
      announce(message);
      return;
    }
    clicks = [];
    taps = [];
    sources = new Set();
    count = 0;
    active = id;
    unsub = input.subscribe(onEvent);
    const h = audio.metronome.start({
      bpm: CALIBRATION.bpm,
      countInBars: 0,
      onBeat: (_beat, _bar, perfAt) => {
        if (clicks.length >= CALIBRATION.clicks) return;
        clicks.push(perfAt);
        count = clicks.length;
        // Leave room for a late last tap (up to half a beat), then score.
        if (clicks.length === CALIBRATION.clicks) finishTimer = setTimeout(finish, BEAT_MS * 0.6);
      },
    });
    handle = h;
    // Test hook, present only while a run is active.
    (window as { __woodshedCalibration?: unknown }).__woodshedCalibration = {
      startPerf: h.startPerf,
      beatMs: BEAT_MS,
      clicks: CALIBRATION.clicks,
    };
    announce(m.music_hubs_cal_tap_each({ title, count: CALIBRATION.clicks, bpm: CALIBRATION.bpm }));
    await tick();
    tapButton?.focus();
  }

  function cancel() {
    teardown();
    message = m.music_hubs_cal_stopped();
    announce(message);
  }

  async function save() {
    if (!result?.ok) return;
    await onsave(bound(result.offsetMs));
    announce(m.music_hubs_cal_saved({ title, offset: signed(result.offsetMs) }));
    result = null;
    message = "";
  }

  async function reset() {
    await onreset();
    result = null;
    message = "";
    announce(m.music_hubs_cal_reset_done({ title }));
  }

  const signed = (ms: number) => `${ms > 0 ? "+" : ms < 0 ? "−" : ""}${Math.abs(ms)} ms`;
  function describe(ms: number) {
    if (Math.abs(ms) < 3) return m.music_hubs_cal_lines_up({ offset: signed(ms) });
    return ms > 0
      ? m.music_hubs_cal_late({ offset: signed(ms), ms: Math.abs(ms) })
      : m.music_hubs_cal_early({ offset: signed(ms), ms: Math.abs(ms) });
  }

  onMount(() => {
    if (autorun) void run();
  });
  onDestroy(() => {
    if (active === id) teardown();
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="flex flex-col gap-3 px-4 py-4" data-testid="cal-{id}">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0 flex-1 basis-56">
      <p class="flex items-center gap-1 font-medium">{title}<Hint about={m.music_hubs_cal_about({ title })} text={blurb} /></p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="tnum rounded-full bg-ws-raised px-3 py-1 text-sm" data-testid="offset-{id}">
        {current === undefined ? m.music_hubs_cal_not_calibrated() : m.music_hubs_cal_now({ offset: signed(current) })}
      </span>
      {#if running}
        <button type="button" class={btn} onclick={cancel}><Square class="size-4" aria-hidden="true" />{m.music_hubs_stop()}</button>
      {:else}
        <button type="button" class={btn} disabled={!!active} onclick={run}><Play class="size-4" aria-hidden="true" />{m.music_hubs_start()}</button>
        {#if current !== undefined}<button type="button" class={btn} onclick={reset}>{m.music_hubs_reset()}</button>{/if}
      {/if}
    </div>
  </div>

  {#if running}
    <div class="stage flex flex-wrap items-center gap-4 rounded-2xl p-4">
      <button
        bind:this={tapButton}
        type="button"
        class="grid size-24 shrink-0 place-items-center rounded-full bg-instr font-display text-xl font-semibold text-ws-stage shadow-lg active:scale-95"
        onpointerdown={tapNow}
        aria-describedby="tap-hint-{id}"
      >
        {m.music_hubs_cal_tap()}
      </button>
      <div class="min-w-0 flex-1">
        <p class="tnum font-display text-3xl font-semibold">
          {count}<span class="ml-1.5 text-lg text-ws-stage-soft">{m.music_hubs_cal_of({ count: CALIBRATION.clicks })}</span>
        </p>
        <div class="mt-2 flex flex-wrap gap-1" aria-hidden="true">
          {#each { length: CALIBRATION.clicks }, i (i)}
            <span
              class="h-2 w-3 rounded-full {i < count ? 'bg-instr' : 'bg-ws-stage-ink/15'} {i < CALIBRATION.warmup ? 'opacity-60' : ''}"
            ></span>
          {/each}
        </div>
        <p id="tap-hint-{id}" class="mt-2 text-sm text-ws-stage-soft">
          {kind === "audio" ? m.music_hubs_cal_hint_audio({ warmup: CALIBRATION.warmup }) : m.music_hubs_cal_hint_midi({ warmup: CALIBRATION.warmup })}
        </p>
      </div>
    </div>
  {/if}

  {#if message}
    <div class="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm {result && !result.ok ? 'border-warn/50' : 'border-ws-line'}">
      <p class="min-w-0 flex-1" data-testid="result-{id}">
        {#if result && !result.ok}<span class="font-semibold text-warn">{m.music_hubs_cal_not_accepted()}</span>{/if}{message}
        {#if result?.ok && onscreenOnly}
          {kind === "audio" ? m.music_hubs_cal_onscreen_audio() : m.music_hubs_cal_onscreen_midi()}
        {/if}
      </p>
      {#if result?.ok}<button type="button" class={btnPrimary} onclick={save}>{m.music_hubs_cal_save({ offset: signed(result.offsetMs) })}</button>{/if}
    </div>
  {/if}
</div>
