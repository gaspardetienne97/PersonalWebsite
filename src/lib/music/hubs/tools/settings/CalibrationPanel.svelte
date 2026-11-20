<script lang="ts" module>
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
      ? `${describe(r.offsetMs)} Spread ${Math.round(r.iqrMs)} ms, ${r.answered} of ${CALIBRATION.clicks - CALIBRATION.warmup} clicks answered.`
      : r.message;
    announce(`${title}: ${r.ok ? describe(r.offsetMs) : r.message}`);
  }

  async function run() {
    if (active) return;
    message = "";
    result = null;
    await audio.unlock();
    if (!audio.unlocked) {
      message = "Sound didn't start. Tap anywhere on the page, then start again.";
      return;
    }
    if (kind !== "audio" && !midi.enabled && !(await midi.enable())) {
      message = midi.error || "MIDI didn't start. Allow it in the browser, then start again.";
      announce(message);
      return;
    }
    if (kind === "audio" && !(await mic.start())) {
      message = mic.error || "The microphone didn't start. Allow it in the browser, then try again.";
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
    announce(`${title}: tap once on every click. ${CALIBRATION.clicks} clicks at ${CALIBRATION.bpm} BPM.`);
    await tick();
    tapButton?.focus();
  }

  function cancel() {
    teardown();
    message = "Stopped before the end, nothing measured.";
    announce(message);
  }

  async function save() {
    if (!result?.ok) return;
    await onsave(bound(result.offsetMs));
    announce(`${title}: saved ${signed(result.offsetMs)}.`);
    result = null;
    message = "";
  }

  async function reset() {
    await onreset();
    result = null;
    message = "";
    announce(`${title}: offset reset to none.`);
  }

  const signed = (ms: number) => `${ms > 0 ? "+" : ms < 0 ? "−" : ""}${Math.abs(ms)} ms`;
  function describe(ms: number) {
    if (Math.abs(ms) < 3) return `Measured ${signed(ms)}: your input lines up with the click.`;
    return `Measured ${signed(ms)}: your input arrives about ${Math.abs(ms)} ms ${ms > 0 ? "late" : "early"}.`;
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
      <p class="flex items-center gap-1 font-medium">{title}<Hint about="{title} calibration" text={blurb} /></p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="tnum rounded-full bg-ws-raised px-3 py-1 text-sm" data-testid="offset-{id}">
        {current === undefined ? "Not calibrated" : `Now ${signed(current)}`}
      </span>
      {#if running}
        <button type="button" class={btn} onclick={cancel}><Square class="size-4" aria-hidden="true" />Stop</button>
      {:else}
        <button type="button" class={btn} disabled={!!active} onclick={run}><Play class="size-4" aria-hidden="true" />Start</button>
        {#if current !== undefined}<button type="button" class={btn} onclick={reset}>Reset</button>{/if}
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
        Tap
      </button>
      <div class="min-w-0 flex-1">
        <p class="tnum font-display text-3xl font-semibold">
          {count}<span class="ml-1.5 text-lg text-ws-stage-soft">of {CALIBRATION.clicks}</span>
        </p>
        <div class="mt-2 flex flex-wrap gap-1" aria-hidden="true">
          {#each { length: CALIBRATION.clicks }, i (i)}
            <span
              class="h-2 w-3 rounded-full {i < count ? 'bg-instr' : 'bg-ws-stage-ink/15'} {i < CALIBRATION.warmup ? 'opacity-60' : ''}"
            ></span>
          {/each}
        </div>
        <p id="tap-hint-{id}" class="mt-2 text-sm text-ws-stage-soft">
          {kind === "audio" ? "Clap or pick a muted string on each click." : "Play any note on each click."} The first {CALIBRATION.warmup} are warm-up. Space or the Tap button also works.
        </p>
      </div>
    </div>
  {/if}

  {#if message}
    <div class="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm {result && !result.ok ? 'border-warn/50' : 'border-ws-line'}">
      <p class="min-w-0 flex-1" data-testid="result-{id}">
        {#if result && !result.ok}<span class="font-semibold text-warn">Not accepted. </span>{/if}{message}
        {#if result?.ok && onscreenOnly}
          These taps came from the on-screen button, so this measures your tapping, not the {kind === "audio" ? "microphone" : "MIDI device"}.
        {/if}
      </p>
      {#if result?.ok}<button type="button" class={btnPrimary} onclick={save}>Save {signed(result.offsetMs)}</button>{/if}
    </div>
  {/if}
</div>
