<script lang="ts">
  // Tune and Intonation share one listening session: the microphone starts on
  // a click, keeps running when you switch between the two, and stops when this
  // view goes away (Drone, another page) or you press Stop.
  import { onDestroy } from "svelte";
  import Mic from "lucide-svelte/icons/mic";
  import Square from "lucide-svelte/icons/square";
  import Volume from "lucide-svelte/icons/volume-2";
  import { hzToMidiFloat, midiToHz, noteName } from "@repo/music-core";
  import { TUNINGS } from "@repo/music-core/data/index";
  import {
    createIntonationStats,
    createTunerReader,
    type IntonationStats,
    type TunerState,
  } from "@repo/music-core/signal/pitch";
  import { btnPrimary, btnStage } from "$lib/music/components/ui";
  import { audio, mic, settings, type MicFrame } from "$lib/music/runtime";
  import {
    A4_CHOICES,
    direction,
    IN_TUNE_CENTS,
    INTONATION_BAND_CENTS,
    nearestString,
    pretty,
    signedCents,
    tracePath,
  } from "./tuner";

  let { mode, onstatus }: { mode: "tune" | "intonation"; onstatus: (s: string) => void } = $props();

  const reader = createTunerReader({ clarityFloor: 0.6, staleMs: 1500, toleranceCents: IN_TUNE_CENTS });
  const intonation = createIntonationStats({ windowMs: 10000, toleranceCents: INTONATION_BAND_CENTS });

  let reading = $state.raw<TunerState | null>(null);
  let stats = $state.raw<IntonationStats | null>(null);
  let frameAt = $state(0);
  let inTuneSince = $state<number | null>(null);
  let lastInTuneAt = $state(0);
  let unsub: (() => void) | null = null;
  let announced = "";

  const listening = $derived(mic.state === "on");
  const a4 = $derived(settings.value.a4Hz);
  const held = $derived(inTuneSince === null ? 0 : (lastInTuneAt - inTuneSince) / 1000);
  const word = $derived(reading ? direction(reading.cents) : null);

  // Fretted instruments get a string strip.
  const instrument = $derived(settings.value.activeInstrument);
  const fretted = $derived(instrument === "guitar" || instrument === "ukulele");
  const tuningKey = $derived(instrument === "ukulele" ? "ukuleleTuningId" : "guitarTuningId");
  const tunings = $derived(instrument === "ukulele" ? TUNINGS.ukulele : TUNINGS.guitar);
  const tuning = $derived(tunings.find((t) => t.id === settings.value[tuningKey]) ?? tunings[0]);
  const near = $derived(reading && fretted ? nearestString(reading.hz, tuning.openStrings, a4) : -1);

  function onFrame(f: MicFrame) {
    const fresh = f.pitch;
    const r = reader.push(fresh, f.at);
    intonation.push(fresh, f.at);
    reading = r;
    stats = intonation.stats();
    frameAt = f.at;
    if (fresh && r?.inTune) {
      inTuneSince ??= f.at;
      lastInTuneAt = f.at;
    } else if (fresh || !r) inTuneSince = null;
    const say = r?.inTune ? `${noteName(r.midi)} in tune.` : "";
    if (say && say !== announced) onstatus(say);
    announced = say;
  }

  async function start() {
    onstatus("Starting the microphone.");
    const ok = await mic.start();
    if (!ok) return onstatus(mic.error || "The microphone did not start.");
    reader.reset();
    intonation.reset();
    unsub?.();
    unsub = mic.subscribeFrames(onFrame);
    onstatus("Listening. Play one note and let it ring.");
  }

  function stop() {
    unsub?.();
    unsub = null;
    mic.stop();
    reading = null;
    inTuneSince = null;
    onstatus("Stopped listening.");
  }

  onDestroy(() => {
    unsub?.();
    if (mic.state === "on" || mic.state === "starting") mic.stop();
  });

  async function playString(midi: number) {
    await audio.unlock();
    audio.playNote(midi, 2);
  }

  // Gauge geometry: -50..+50 cents across a 140 degree arc.
  const CX = 150;
  const CY = 150;
  const R = 124;
  const angle = (c: number) => (Math.max(-50, Math.min(50, c)) / 50) * 70;
  const pt = (deg: number, r: number) => {
    const t = (deg * Math.PI) / 180;
    return [CX + r * Math.sin(t), CY - r * Math.cos(t)].map((v) => +v.toFixed(1));
  };
  const at = (deg: number, r: number) => pt(deg, r).join(" ");
  const tickIn = (t: number) => R - (t === 0 ? 20 : t % 50 === 0 ? 14 : 8);
  const arc = (from: number, to: number, r = R) => `M${at(from, r)} A${r} ${r} 0 0 1 ${at(to, r)}`;
  const TICKS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
  const faceScale = $derived(0.8 + Math.min(held, 4) * 0.1);
  const voiced = $derived(stats?.trace.some((s) => s.cents !== null) ?? false);
  const bandTop = 80 - (INTONATION_BAND_CENTS / 50) * 80;
</script>

<div class="flex flex-wrap items-end gap-3">
  <label class="flex flex-col gap-1 text-sm">
    <span class="font-medium">Reference A4</span>
    <select
      class="tnum min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3"
      value={String(a4)}
      onchange={(e) => settings.update({ a4Hz: Number(e.currentTarget.value) })}
    >
      {#each A4_CHOICES as hz (hz)}<option value={String(hz)}>{hz} Hz{hz === 440 ? " (standard)" : ""}</option>{/each}
    </select>
  </label>
  {#if fretted}
    <label class="flex flex-col gap-1 text-sm">
      <span class="font-medium">{instrument === "ukulele" ? "Ukulele" : "Guitar"} tuning</span>
      <select
        class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3"
        value={tuning.id}
        onchange={(e) => settings.update({ [tuningKey]: e.currentTarget.value })}
      >
        {#each tunings as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </label>
  {/if}
  <p class="min-w-64 flex-1 text-sm text-ws-soft">
    In tune means within {IN_TUNE_CENTS} cents. {mode === "intonation"
      ? `The trace shows the last 10 seconds; the band is ±${INTONATION_BAND_CENTS} cents.`
      : "Weak or noisy sound holds the last reading instead of flickering."}
  </p>
</div>

<section class="stage relative overflow-hidden rounded-2xl p-4 sm:p-6" aria-label="Tuner">
  <div class="flex flex-wrap items-center gap-3">
    {#if listening}
      <button type="button" class={btnStage} onclick={stop}><Square class="size-4" aria-hidden="true" />Stop listening</button>
      <p class="text-sm text-ws-stage-soft"><span class="live-dot" aria-hidden="true"></span> Listening</p>
    {:else}
      <button type="button" class={btnPrimary} onclick={start} disabled={mic.state === "starting"}>
        <Mic class="size-4" aria-hidden="true" />{mic.state === "denied" || mic.state === "error" ? "Try the microphone again" : "Start listening"}
      </button>
      <p class="min-w-0 flex-1 text-sm text-ws-stage-soft">
        {#if mic.state === "denied" || mic.state === "error"}{mic.error}{:else}The microphone only listens while this is on. Nothing is recorded.{/if}
      </p>
    {/if}
  </div>

  <div class="readout mx-auto mt-4 grid max-w-xl" class:intonation={mode === "intonation"} data-state={word ?? "none"}>
    <svg viewBox="0 0 300 172" class="w-full" aria-hidden="true">
      <path d={arc(-70, 70)} class="track" />
      <path d={arc(angle(-IN_TUNE_CENTS), angle(IN_TUNE_CENTS))} class="zone" />
      {#each TICKS as t (t)}
        {@const [x1, y1] = pt(angle(t), tickIn(t))}
        {@const [x2, y2] = pt(angle(t), R + 6)}
        <line {x1} {y1} {x2} {y2} class="tick" />
      {/each}
      {#if reading}
        <text x="18" y="168" class="nb">{pretty(noteName(reading.midi - 1, "flat", false))}</text>
        <text x="282" y="168" class="nb" text-anchor="end">{pretty(noteName(reading.midi + 1, "flat", false))}</text>
        <g class="needle" style:transform="rotate({angle(reading.cents)}deg)">
          <line x1={CX} y1={CY - R + 46} x2={CX} y2={CY - R - 4} />
          <circle cx={CX} cy={CY - R} r="7" />
        </g>
      {:else}
        <text x="18" y="168" class="nb">flat</text>
        <text x="282" y="168" class="nb" text-anchor="end">sharp</text>
      {/if}
    </svg>

    <div class="face-wrap">
      <div class="face" style:transform="scale({reading?.inTune ? faceScale : 0.8})" aria-hidden="true"></div>
      <p class="note font-display" data-testid="tuner-note">
        {#if reading}{pretty(noteName(reading.midi, "flat", false))}<span class="oct">{Math.floor(reading.midi / 12) - 1}</span>{:else}<span class="idle">{listening ? "Play a note" : "Ready"}</span>{/if}
      </p>
    </div>
  </div>

  <div class="mt-2 text-center">
    {#if reading && word}
      <p class="font-display text-2xl font-semibold sm:text-3xl" data-testid="tuner-cents">
        <span class="tnum">{signedCents(reading.cents)}</span> cents,
        {#if word === "in tune"}<span class="text-success">✓ in tune</span>{:else}{word}, tune {word === "flat" ? "up" : "down"}{/if}
      </p>
      <p class="tnum mt-1 text-sm text-ws-stage-soft">
        Hearing {reading.hz.toFixed(1)} Hz, target {midiToHz(reading.midi, a4).toFixed(1)} Hz{#if held >= 0.5}. Held in tune {held.toFixed(1)} s{/if}
      </p>
    {:else}
      <p class="text-sm text-ws-stage-soft">{listening ? "Nothing clear yet. One note at a time, close to the microphone." : "Start listening, then play a single note."}</p>
    {/if}
  </div>

  {#if fretted}
    <ul class="strings mt-5 grid gap-2" style:grid-template-columns="repeat({tuning.openStrings.length}, minmax(0, 1fr))" aria-label="{tuning.name} strings, low to high">
      {#each [...tuning.openStrings].reverse() as open, k (k)}
        {@const i = tuning.openStrings.length - 1 - k}
        {@const isNear = i === near}
        {@const off = reading && isNear ? (hzToMidiFloat(reading.hz, a4) - open) * 100 : null}
        <li>
          <button
            type="button"
            class="string w-full"
            data-near={isNear || undefined}
            data-ok={(off !== null && Math.abs(off) <= IN_TUNE_CENTS) || undefined}
            aria-label="String {i + 1}, {noteName(open)}{isNear ? ', nearest to what you are playing' : ''}. Play reference."
            onclick={() => playString(open)}
          >
            <span class="font-display text-lg font-semibold">{pretty(noteName(open, "flat", false))}<span class="text-xs opacity-70">{Math.floor(open / 12) - 1}</span></span>
            <span class="tnum text-xs">
              {#if off !== null}{Math.abs(off) <= IN_TUNE_CENTS ? "✓ in tune" : `${signedCents(off)}¢`}{:else}<Volume class="inline size-3.5" aria-hidden="true" /> {i + 1}{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if mode === "intonation"}
    <div class="mt-6 border-t border-ws-stage-ink/10 pt-5">
      {#if voiced && stats}
        <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="intonation-stats">
          <div class="stat"><dt>In tune</dt><dd class="tnum font-display">{stats.inTunePct}%</dd></div>
          <div class="stat"><dt>Hold</dt><dd class="tnum font-display">{stats.holdSeconds.toFixed(1)} s</dd></div>
          <div class="stat"><dt>Steadiness</dt><dd class="tnum font-display">{stats.steadinessPct}%</dd></div>
          <div class="stat"><dt>Avg drift</dt><dd class="tnum font-display">{signedCents(stats.avgDriftCents)} ¢</dd></div>
        </dl>
      {:else}
        <p class="text-sm text-ws-stage-soft">Hold one note steadily. In tune %, hold, steadiness and drift fill in as you play.</p>
      {/if}
      <figure class="mt-4">
        <div class="flex gap-2">
          <div class="flex flex-col justify-between py-1 text-xs text-ws-stage-soft" aria-hidden="true"><span>sharp</span><span>0</span><span>flat</span></div>
          <svg viewBox="0 0 600 160" preserveAspectRatio="none" class="trace h-36 min-w-0 flex-1 rounded-lg" role="img" aria-label="Pitch over the last 10 seconds, with the ±{INTONATION_BAND_CENTS} cent band">
            <rect x="0" y={bandTop} width="600" height={160 - 2 * bandTop} class="band" />
            <line x1="0" x2="600" y1="80" y2="80" class="mid" vector-effect="non-scaling-stroke" />
            {#if stats}<path d={tracePath(stats.trace, frameAt)} class="line" vector-effect="non-scaling-stroke" />{/if}
          </svg>
        </div>
        <figcaption class="mt-1 text-right text-xs text-ws-stage-soft">last 10 seconds, now at the right</figcaption>
      </figure>
    </div>
  {/if}
</section>

<style>
  .readout {
    grid-template-areas: "stack";
  }
  .readout > :global(*) {
    grid-area: stack;
  }
  .track {
    fill: none;
    stroke: color-mix(in oklch, var(--ws-stage-ink) 14%, transparent);
    stroke-width: 10;
    stroke-linecap: round;
  }
  .zone {
    fill: none;
    stroke: var(--success);
    stroke-width: 10;
  }
  .tick {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 45%, transparent);
    stroke-width: 2;
  }
  .nb {
    fill: var(--ws-stage-soft);
    font-size: 16px;
    font-weight: 600;
  }
  .needle {
    transform-origin: 150px 150px;
    transition: transform 120ms ease-out;
  }
  .needle line {
    stroke: var(--instr);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .needle circle {
    fill: var(--instr);
    stroke: var(--ws-stage);
    stroke-width: 2;
  }
  [data-state="in tune"] .needle line {
    stroke: var(--success);
  }
  [data-state="in tune"] .needle circle {
    fill: var(--success);
  }
  .face-wrap {
    display: grid;
    place-items: center;
    align-self: end;
    margin-bottom: 1.5rem;
  }
  .face-wrap > * {
    grid-area: 1 / 1;
  }
  .face {
    width: 10rem;
    height: 10rem;
    border-radius: 999px;
    background: radial-gradient(circle, color-mix(in oklch, var(--success) 45%, transparent), transparent 70%);
    opacity: 0;
    transition:
      transform 400ms ease-out,
      opacity 200ms;
  }
  [data-state="in tune"] .face {
    opacity: 1;
  }
  .note {
    position: relative;
    font-size: clamp(4.5rem, 18vw, 7.5rem);
    line-height: 1;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .intonation .note {
    font-size: clamp(3.5rem, 12vw, 5rem);
  }
  .oct {
    font-size: 0.4em;
    font-weight: 600;
    color: var(--ws-stage-soft);
    margin-left: 0.05em;
  }
  .idle {
    font-size: 1.5rem;
    font-weight: 500;
    color: var(--ws-stage-soft);
  }
  .string {
    display: flex;
    min-height: 3.5rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    border: 2px solid transparent;
  }
  .string:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
  }
  .string[data-near] {
    border-color: var(--instr);
    background: color-mix(in oklch, var(--instr) 18%, transparent);
  }
  .string[data-ok] {
    border-color: var(--success);
  }
  .stat {
    border-radius: 0.75rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    padding: 0.5rem 0.75rem;
  }
  .stat dt {
    font-size: 0.75rem;
    color: var(--ws-stage-soft);
  }
  .stat dd {
    font-size: 1.5rem;
    font-weight: 600;
  }
  .trace {
    background: color-mix(in oklch, var(--ws-stage-ink) 5%, transparent);
  }
  .band {
    fill: color-mix(in oklch, var(--success) 22%, transparent);
  }
  .mid {
    stroke: color-mix(in oklch, var(--success) 70%, transparent);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
  .line {
    fill: none;
    stroke: var(--instr);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
  .live-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--destructive);
    margin-right: 0.25rem;
  }
</style>
