<script lang="ts">
  // Tune and Intonation share one listening session: the microphone starts on
  // a click, keeps running when you switch between the two, and stops when this
  // view goes away (Drone, another page) or you press Stop.
  import { onDestroy } from "svelte";
  import Mic from "lucide-svelte/icons/mic";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ArrowUp from "lucide-svelte/icons/arrow-up";
  import ArrowDown from "lucide-svelte/icons/arrow-down";
  import Check from "lucide-svelte/icons/check";
  import Volume from "lucide-svelte/icons/volume-2";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Piano from "$lib/music/components/Piano.svelte";
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
  import NotePads from "./NotePads.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import {
    A4_CHOICES,
    centsToTarget,
    direction,
    HOLD_GOAL_S,
    IN_TUNE_CENTS,
    intonationVerdict,
    nearestString,
    pretty,
    signedCents,
    tracePath,
  } from "./tuner";

  let { mode, onstatus }: { mode: "tune" | "intonation"; onstatus: (s: string) => void } = $props();

  const reader = createTunerReader({ clarityFloor: 0.6, staleMs: 1500, toleranceCents: IN_TUNE_CENTS });
  const intonation = createIntonationStats({ windowMs: 10000, toleranceCents: IN_TUNE_CENTS });

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

  // A chosen target note (pitch class), or null for "whatever note is nearest".
  let target = $state<number | null>(null);
  // Auto-detect is the default; the twelve target notes open on demand.
  let choosing = $state(false);
  /** What the gauge shows: distance from the target note, or from the nearest note. */
  function against(r: { hz: number; midi: number; cents: number }) {
    if (target === null) return { midi: r.midi, cents: r.cents };
    const t = centsToTarget(r.hz, target, a4);
    return { midi: t.targetMidi, cents: t.cents };
  }
  const shown = $derived(reading ? { ...against(reading), inTune: Math.abs(against(reading).cents) <= IN_TUNE_CENTS } : null);
  const word = $derived(shown ? direction(shown.cents) : null);
  const semitonesOff = $derived(shown && Math.abs(shown.cents) > 50 ? Math.round(shown.cents / 100) : 0);

  async function chooseTarget(pc: number | null) {
    target = pc;
    intonation.reset();
    inTuneSince = null;
    if (pc === null) return onstatus("Tuning to the nearest note.");
    const octave = reading ? Math.floor(reading.midi / 12) - 1 : 4;
    const midi = (octave + 1) * 12 + pc;
    onstatus(`Target ${noteName(midi)}.`);
    await audio.unlock();
    audio.playNote(midi, 1.5);
  }

  // Fretted instruments get a string strip.
  const instrument = $derived(settings.value.activeInstrument);
  const fretted = $derived(instrument === "guitar" || instrument === "ukulele");
  /** Keyboard instruments see the note on a keyboard, one stable octave at a time. */
  const keyed = $derived(instrument === "piano" || instrument === "aerophone" || instrument === "voice");
  // The keyboard's centre: the heard note, else middle C.
  const keyMid = $derived(shown ? shown.midi : 60);
  const tuningKey = $derived(instrument === "ukulele" ? "ukuleleTuningId" : "guitarTuningId");
  const tunings = $derived(instrument === "ukulele" ? TUNINGS.ukulele : TUNINGS.guitar);
  const tuning = $derived(tunings.find((t) => t.id === settings.value[tuningKey]) ?? tunings[0]);
  const near = $derived(reading && fretted ? nearestString(reading.hz, tuning.openStrings, a4) : -1);

  function onFrame(f: MicFrame) {
    const fresh = f.pitch;
    const r = reader.push(fresh, f.at);
    intonation.push(fresh, f.at, fresh && target !== null ? centsToTarget(fresh.hz, target, a4).targetMidi : undefined);
    reading = r;
    stats = intonation.stats();
    frameAt = f.at;
    const view = r ? against(r) : null;
    const ok = !!view && Math.abs(view.cents) <= IN_TUNE_CENTS;
    if (fresh && ok) {
      inTuneSince ??= f.at;
      lastInTuneAt = f.at;
    } else if (fresh || !r) inTuneSince = null;
    const say = ok && view ? `${noteName(view.midi)} in tune.` : "";
    if (say && say !== announced) onstatus(say);
    announced = say;
  }

  async function start() {
    onstatus("Starting the microphone…");
    const ok = await mic.start();
    if (!ok) return onstatus(mic.error || "The microphone didn't start. Allow it in the browser, then try again.");
    reader.reset();
    intonation.reset();
    unsub?.();
    unsub = mic.subscribeFrames(onFrame);
    onstatus("Listening. Play one note and let it ring.");
  }

  /** Intonation: clear the window and hold the note again. */
  function holdAgain() {
    intonation.reset();
    stats = null;
    inTuneSince = null;
    onstatus("Cleared. Hold the note again.");
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
  const [fx, fy] = pt(-70, R);
  const NONE = new Set<number>();
  const voiced = $derived(stats?.trace.some((s) => s.cents !== null) ?? false);
  const bandTop = 80 - (IN_TUNE_CENTS / 50) * 80;
  // The trace's cents gridlines, top to bottom, and their height in its 160-high box.
  const GRID = [50, 25, 10, 0, -10, -25, -50];
  const centsY = (c: number) => 80 - (c / 50) * 80;
  const verdict = $derived(stats && voiced ? intonationVerdict(stats) : null);
  // The hold ring: fills over HOLD_GOAL_S while the note stays in tune, then closes with a check.
  const RING = 2 * Math.PI * 46;
  const holdFrac = $derived(shown?.inTune ? Math.min(held / HOLD_GOAL_S, 1) : 0);
  const holdDone = $derived(holdFrac >= 1);
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <div class="flex items-center gap-2">
    <span class="font-medium whitespace-nowrap">Reference A4</span>
    <Picker class="tnum" label="Reference A4" value={String(a4)} options={A4_CHOICES.map((hz) => ({ value: String(hz), label: `${hz} Hz${hz === 440 ? " (standard)" : ""}` }))} onchange={(v) => settings.update({ a4Hz: Number(v) })} />
  </div>
  {#if fretted}
    <div class="flex items-center gap-2">
      <span class="font-medium whitespace-nowrap">{instrument === "ukulele" ? "Ukulele" : "Guitar"} tuning</span>
      <Picker label="{instrument === 'ukulele' ? 'Ukulele' : 'Guitar'} tuning" value={tuning.id} options={tunings.map((t) => ({ value: t.id, label: t.name }))} onchange={(v) => settings.update({ [tuningKey]: v })} />
    </div>
  {/if}
</div>

<section class="stage relative overflow-hidden rounded-2xl p-4 sm:p-5" aria-label="Tuner">
  <div class="flex flex-wrap items-center gap-3">
    {#if listening}
      <!-- One mic control: the button carries the live dot, so the state is not said twice. -->
      <button type="button" class={btnStage} onclick={stop}><span class="live-dot" aria-hidden="true"></span><Mic class="size-4" aria-hidden="true" />Stop listening</button>
    {:else}
      <button type="button" class={btnPrimary} onclick={start} disabled={mic.state === "starting"}>
        <Mic class="size-4" aria-hidden="true" />{mic.state === "denied" || mic.state === "error" ? "Try the microphone again" : "Start listening"}
      </button>
      <p class="min-w-0 flex-1 basis-48 text-sm text-ws-stage-soft">
        {#if mic.state === "denied" || mic.state === "error"}{mic.error}{:else}The microphone only listens while this is on. Nothing is recorded.{/if}
      </p>
    {/if}
    <button type="button" class="{btnStage} ml-auto" aria-label="Pick a note, target {target === null ? 'auto' : noteName(target, 'flat', false)}" aria-expanded={choosing} aria-controls="tuner-targets" onclick={() => (choosing = !choosing)}>
      Target: {target === null ? "Auto" : pretty(noteName(target, "flat", false))}
      <ChevronDown class="size-4 transition-transform {choosing ? 'rotate-180' : ''}" aria-hidden="true" />
    </button>
  </div>

  {#if choosing}
    <div id="tuner-targets" class="mt-3">
      <p class="mb-2 text-sm text-ws-stage-soft">Target note. Any note tunes to the nearest note. Pick one to aim at it in the octave you play.</p>
      <NotePads label="Target note" noneLabel="Any note" selected={target} onselect={(p) => void chooseTarget(p)} />
    </div>
  {/if}

  {#if mode === "tune"}
    <div class="readout mx-auto mt-2 grid w-full max-w-md" data-state={word ?? "none"}>
      <svg viewBox="-12 -6 324 178" class="w-full" aria-hidden="true">
        <path d={arc(-70, 70)} class="track" />
        <path d={arc(angle(-IN_TUNE_CENTS), angle(IN_TUNE_CENTS))} class="zone" />
        {#each TICKS as t (t)}
          {@const [x1, y1] = pt(angle(t), tickIn(t))}
          {@const [x2, y2] = pt(angle(t), R + 6)}
          <line {x1} {y1} {x2} {y2} class="tick" />
        {/each}
        <!-- Every 10 cents labelled; flat and sharp sit under the arc's own ends. -->
        {#each TICKS as t (t)}
          {@const [lx, ly] = pt(angle(t), R + 20)}
          <text x={lx} y={ly + 5} class="scale" text-anchor="middle">{signedCents(t)}</text>
        {/each}
        <text x={fx} y={fy + 30} class="nb" text-anchor="middle">flat</text>
        <text x={2 * CX - fx} y={fy + 30} class="nb" text-anchor="middle">sharp</text>
        {#if shown}
          <!-- A short needle riding the arc, so it never crosses the note letter below it. -->
          <g class="needle" style:transform="rotate({angle(shown.cents)}deg)">
            <line x1={CX} y1={CY - R + 24} x2={CX} y2={CY - R - 6} />
            <circle cx={CX} cy={CY - R} r="7" />
          </g>
        {/if}
      </svg>

      <div class="face-wrap">
        <svg viewBox="0 0 100 100" class="hold" data-done={holdDone || undefined} aria-hidden="true">
          <circle cx="50" cy="50" r="46" class="hold-track" />
          <circle cx="50" cy="50" r="46" class="hold-fill" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - holdFrac)} />
        </svg>
        {@render note()}
        {#if holdDone}
          <span class="hold-check ws-pop" aria-hidden="true"><Check class="size-5" strokeWidth={3} /></span>
        {/if}
      </div>
    </div>
  {:else}
    <div class="introw mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
      {@render note()}
      {@render readline()}
    </div>
  {/if}

  {#if mode === "tune"}{@render readline()}{/if}

  {#if fretted}
    <ul class="strings mt-4 grid gap-2" style:grid-template-columns="repeat({tuning.openStrings.length}, minmax(0, 1fr))" aria-label="{tuning.name} strings, low to high">
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
            <span class="font-display text-lg font-semibold">{pretty(noteName(open, "flat", false))}<span class="text-[13px] opacity-70">{Math.floor(open / 12) - 1}</span></span>
            <span class="tnum text-[13px]">
              {#if off !== null}{Math.abs(off) <= IN_TUNE_CENTS ? "In tune" : `${signedCents(off)}¢`}{:else}<Volume class="inline size-3.5" aria-hidden="true" /> {i + 1}{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if mode === "tune"}{@render keys()}{/if}

  {#if mode === "intonation"}
    <figure class="mt-4">
      <div class="flex gap-2">
        <!-- Cents on the left at the gridlines, sharp above the line and flat below. -->
        <div class="tnum relative w-16 shrink-0 text-right text-[13px] leading-none text-ws-stage-soft" aria-hidden="true">
          {#each GRID as c (c)}
            <span class="absolute right-0 whitespace-nowrap {c === 50 ? '' : c === -50 ? '-translate-y-full' : '-translate-y-1/2'}" style:top="{centsY(c) / 1.6}%">{c === 50 ? "+50 sharp" : c === -50 ? "−50 flat" : signedCents(c)}</span>
          {/each}
        </div>
        <div class="min-w-0 flex-1">
        <svg viewBox="0 0 600 160" preserveAspectRatio="none" class="trace block h-44 w-full rounded-lg sm:h-52" role="img" aria-label="Pitch over the last 10 seconds, with the in-tune band of ±{IN_TUNE_CENTS} cents">
          <rect x="0" y={bandTop} width="600" height={160 - 2 * bandTop} class="band" />
          {#each GRID as c (c)}{#if c !== 0}<line x1="0" x2="600" y1={centsY(c)} y2={centsY(c)} class="grid" vector-effect="non-scaling-stroke" />{/if}{/each}
          {#each [120, 240, 360, 480] as x (x)}<line x1={x} x2={x} y1="0" y2="160" class="grid" vector-effect="non-scaling-stroke" />{/each}
          <line x1="0" x2="600" y1="80" y2="80" class="mid" vector-effect="non-scaling-stroke" />
          {#if stats}<path d={tracePath(stats.trace, frameAt)} class="line" vector-effect="non-scaling-stroke" />{/if}
        </svg>
        <!-- Time every 2 seconds, now at the right edge. -->
        <div class="tnum relative mt-1 h-4 text-[13px] leading-none text-ws-stage-soft" aria-hidden="true">
          {#each [10, 8, 6, 4, 2, 0] as t, i (t)}
            <span class="absolute whitespace-nowrap {i === 0 ? '' : i === 5 ? '-translate-x-full' : '-translate-x-1/2'}" style:left="{i * 20}%">{t ? `−${t} s` : "now"}</span>
          {/each}
        </div>
        </div>
      </div>
      <figcaption class="mt-1 flex flex-wrap justify-between gap-2 text-[13px] text-ws-stage-soft">
        <span><span class="band-key" aria-hidden="true"></span> Green band: in tune, within ±{IN_TUNE_CENTS} cents</span>
        <span>last 10 seconds, now at the right</span>
      </figcaption>
    </figure>
    <div class="mt-4">
      {#if voiced && stats}
        {#if verdict}
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p class="verdict font-display text-lg font-semibold" data-tone={verdict.tone} data-testid="intonation-verdict">
              {#if verdict.tone === "good"}<Check class="mr-1 inline size-5 align-[-0.15em]" aria-hidden="true" />{/if}{verdict.text}
            </p>
            <button type="button" class={btnStage} onclick={holdAgain}><RotateCcw class="size-4" aria-hidden="true" />Hold again</button>
          </div>
        {/if}
        <!-- The score block is always drawn; its numbers are the last 10 seconds as heard. -->
        <div data-testid="intonation-stats">
        <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-empty={stats.inTunePct === 0 || undefined}>
          <div class="stat" title="Share of the last 10 seconds within ±{IN_TUNE_CENTS} cents"><dt>In tune</dt><dd class="tnum font-display">{stats.inTunePct}%</dd></div>
          <div class="stat" title="The longest stretch in tune without a break"><dt>Hold</dt><dd class="tnum font-display">{stats.holdSeconds.toFixed(1)} s</dd></div>
          <div class="stat" title="How little the pitch wobbles, wherever it sits"><dt>Held steady</dt><dd class="tnum font-display">{stats.steadinessPct}%</dd></div>
          <div class="stat" title="Average distance from the note: plus is sharp, minus is flat"><dt>Avg drift</dt><dd class="tnum font-display">{signedCents(stats.avgDriftCents)} cents</dd></div>
        </dl>
        {#if stats.inTunePct === 0}<p class="mt-2 text-sm text-ws-stage-soft">In tune and Hold count once the note sits in the green band.</p>{/if}
        </div>
      {:else}
        <p class="text-sm text-ws-stage-soft">Hold one note steadily. In tune %, hold, steadiness and drift fill in as you play.</p>
      {/if}
    </div>
    {@render keys()}
  {/if}
</section>

<p class="text-[15px] text-ws-soft">
  In tune means within {IN_TUNE_CENTS} cents, everywhere on this page. {mode === "intonation"
    ? "The trace shows the last 10 seconds."
    : `Hold a note in tune for ${HOLD_GOAL_S} second and the ring closes. Weak or noisy sound holds the last reading instead of flickering.`}
</p>

<!-- The keyboard centres on the heard note, on Tune (under the gauge) and Intonation (under the score). -->
{#snippet keys()}
  {#if keyed}
    <div class="keys mx-auto mt-4 w-full max-w-xl" data-testid="tuner-keys">
      <Piano
        fit={{ low: keyMid - 6, high: keyMid + 6 }}
        low={keyMid - 12}
        high={keyMid + 12}
        held={NONE}
        marks={shown ? { [shown.midi]: { target: true, label: pretty(noteName(shown.midi, "flat", false)) } } : {}}
        interactive={false}
        names="c"
        minKey={30}
        label="Keyboard with the note heard marked"
      />
    </div>
  {/if}
{/snippet}

{#snippet readline()}
  <div class="mt-1 {mode === 'tune' ? 'text-center' : 'min-w-0 flex-1 basis-60'}">
    {#if reading && shown && word}
      <p class="readline font-display text-2xl font-semibold sm:text-3xl" data-testid="tuner-cents" data-state={word}>
        {#if semitonesOff}
          {pretty(noteName(reading.midi, "flat", false))}, {Math.abs(semitonesOff)} semitone{Math.abs(semitonesOff) === 1 ? "" : "s"}
          {semitonesOff > 0 ? "above" : "below"}
        {:else}
          <span class="tnum">{signedCents(shown.cents)}</span> cents,
          {#if word === "in tune"}<span class="text-success"><Check class="mr-1 inline size-6 align-[-0.1em]" aria-hidden="true" />in tune</span>{:else}{word},
            <span class="turn">{#if word === "flat"}<ArrowUp class="mr-1 inline size-5 align-[-0.1em]" aria-hidden="true" />{:else}<ArrowDown class="mr-1 inline size-5 align-[-0.1em]" aria-hidden="true" />{/if}tune {word === "flat" ? "up" : "down"}</span>{/if}
        {/if}
      </p>
      <p class="tnum mt-1 text-sm text-ws-stage-soft">
        Hearing {reading.hz.toFixed(1)} Hz, target {midiToHz(shown.midi, a4).toFixed(1)} Hz{#if held >= 0.5}. Held in tune {held.toFixed(1)} s{/if}
      </p>
    {:else}
      <p class="text-sm text-ws-stage-soft">{listening ? "Nothing clear yet. One note at a time, close to the microphone." : "Start listening, then play a single note."}</p>
    {/if}
  </div>
{/snippet}

{#snippet note()}
  <p class="note font-display" data-testid="tuner-note">
    {#if shown}{pretty(noteName(shown.midi, "flat", false))}<span class="oct">{Math.floor(shown.midi / 12) - 1}</span>{:else if target !== null}<span class="idle">Aim for {pretty(noteName(target, "flat", false))}</span>{:else}<span class="idle">{listening ? "Play a note" : "Ready"}</span>{/if}
  </p>
{/snippet}

<style>
  /* Taller than a compact strip, shorter than a drill's keyboard: the card fits a laptop screen. */
  .keys :global(.piano .white) {
    height: 6.5rem;
  }
  .keys :global(.piano .black) {
    height: 4rem;
  }
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
    margin-bottom: 0.25rem;
  }
  .face-wrap > * {
    grid-area: 1 / 1;
  }
  .hold {
    width: clamp(7rem, 27vw, 9.5rem);
    height: clamp(7rem, 27vw, 9.5rem);
    transform: rotate(-90deg);
  }
  /* The hold ring is always drawn, so the footer's promise has a place to land; it greens in tune. */
  .hold-track {
    fill: none;
    stroke: color-mix(in oklch, var(--ws-stage-ink) 16%, transparent);
    stroke-width: 4;
    transition: fill 200ms, stroke 200ms;
  }
  [data-state="in tune"] .hold-track {
    fill: color-mix(in oklch, var(--success) 10%, transparent);
    stroke: color-mix(in oklch, var(--success) 25%, transparent);
  }
  .hold-fill {
    fill: none;
    stroke: var(--success);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 120ms linear;
  }
  .hold[data-done] .hold-track {
    fill: color-mix(in oklch, var(--success) 22%, transparent);
  }
  .hold-check {
    align-self: start;
    justify-self: end;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    margin-right: calc(50% - clamp(7rem, 27vw, 9.5rem) / 2 - 0.25rem);
    border-radius: 999px;
    background: var(--success);
    color: var(--ws-stage);
  }
  .verdict[data-tone="good"] {
    color: var(--success);
  }
  .note {
    position: relative;
    font-size: clamp(3.75rem, 15vw, 5.75rem);
    line-height: 1;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .introw .note {
    font-size: clamp(3.5rem, 12vw, 5rem);
  }
  .scale {
    fill: var(--ws-stage-soft);
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .readline .turn {
    white-space: nowrap;
  }
  .readline[data-state="flat"] .turn,
  .readline[data-state="sharp"] .turn {
    color: var(--instr);
  }
  .band-key {
    display: inline-block;
    width: 0.75rem;
    height: 0.5rem;
    border-radius: 2px;
    vertical-align: middle;
    background: color-mix(in oklch, var(--success) 45%, transparent);
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
    font-size: 0.8125rem;
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
    fill: color-mix(in oklch, var(--success) 34%, transparent);
  }
  .grid {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 18%, transparent);
    stroke-width: 1;
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
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 999px;
    background: var(--success);
    animation: live 1.6s ease-in-out infinite;
  }
  @keyframes live {
    50% {
      box-shadow: 0 0 0 0.35rem color-mix(in oklch, var(--success) 30%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }
</style>
