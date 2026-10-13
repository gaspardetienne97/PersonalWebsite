<script lang="ts">
  // Practice Lab: free play, captured. Every note from MIDI, the on-screen
  // surface or the microphone is kept with its real note-off, saved as a MIDI
  // take (db.midiTakes, the shape Record uses) and logged as free practice.
  // Unscored by design.
  import { onDestroy, onMount } from "svelte";
  import Mic from "lucide-svelte/icons/mic";
  import MicOff from "lucide-svelte/icons/mic-off";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Upload from "lucide-svelte/icons/upload";
  import { noteName, type InputSource, type NoteEvent } from "@repo/music-core";
  import { LEVEL_FLOOR_DB } from "@repo/music-core/signal/level";
  import { TUNINGS } from "@repo/music-core/data/index";
  import DrillShell, { type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Fretboard from "$lib/music/components/Fretboard.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import { btn, btnStage, panel } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { capture, runInstrument, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { INSTRUMENT_LABEL } from "$lib/music/bench.svelte";
  import { audio, mic, settings, type SequenceHandle } from "$lib/music/runtime";
  import { importTrack, listTracks, playTrack, type BackingTrack } from "$lib/music/drills/jam/tracks";
  import { pairNotes, recentTakes, saveTake, takeToSequence, takeStats, type MidiTake } from "$lib/music/takes";
  import Picker from "$lib/music/components/Picker.svelte";

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
  const SOURCE: Record<InputSource, string> = { midi: "MIDI", onscreen: "On-screen", audio: "Microphone", click: "Click" };
  const recent = $derived(events.filter((e) => e.kind === "noteon").slice(-10));
  const micOn = $derived(mic.state === "on");
  // The microphone only makes sense for instruments it can hear.
  const canMic = $derived(instrument !== "piano" && instrument !== "mpc");
  const levelPct = $derived(Math.max(0, Math.min(1, (mic.level - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB)));

  async function toggleMic() {
    if (micOn) {
      mic.stop();
      status = "Microphone off.";
      return;
    }
    const ok = await mic.start();
    status = ok ? "Listening through the microphone." : mic.error;
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
    status = "Recording. Play anything; Stop saves the take.";
    if (s.track) {
      try {
        backing = await playTrack(s.track);
        status = "Recording over your backing track.";
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
      status = "Nothing was played, so nothing was saved.";
      return;
    }
    const inst = runInstrument(all);
    const when = new Date();
    const take: MidiTake = {
      id: crypto.randomUUID(),
      createdAt: when.getTime(),
      name: `Free play, ${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
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
        headline: `${st.count} notes of free play`,
      },
      ["free-play"],
    );
    status = `Saved ${take.name}: ${st.count} notes. Logged as free practice.`;
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
    { text: s.track ? `over ${tracks.find((t) => t.id === s.track)?.name ?? "your backing track"}` : "no backing", focus: "track" },
    ...(micOn ? [{ text: "microphone on" }] : []),
  ]);
  const secs = (ms: number) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
  const rangeOf = (st: { low: number | null; high: number | null }) => (st.low === null || st.high === null ? "none" : st.low === st.high ? noteName(st.low) : `${noteName(st.low)} to ${noteName(st.high)}`);

  const DRILLS = [
    { href: "/music/scales", label: "Scales", hint: "Piano" },
    { href: "/music/two-hand", label: "Two hands", hint: "Piano" },
    { href: "/music/pads", label: "MPC rudiments", hint: "Pads" },
    { href: "/music/fretboard", label: "String spider", hint: "Guitar and ukulele" },
    { href: "/music/chords", label: "Chords", hint: "Guitar and ukulele" },
    { href: "/music/aerophone?mode=articulation", label: "Articulation", hint: "Aerophone" },
    { href: "/music/tuner", label: "Tuner", hint: "Any instrument" },
    { href: "/music/library", label: "Song library", hint: "Your repertoire" },
  ];
</script>

<svelte:head><title>Practice lab | Woodshed</title></svelte:head>

<DrillShell
  title="Practice lab"
  hue={instrument}
  blurb="Play freely. Everything is recorded with real note lengths and saved as a take; nothing is scored."
  summary={summaryLine}
  checkable={false}
  bind:phase
  bind:status
  startLabel="Start recording"
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1 text-sm" data-setup="track">
        <span class="font-medium">Backing track</span>
        <div class="flex flex-wrap items-center gap-2">
          <Picker class="w-auto min-w-40" label="Backing track" value={s.track} options={[{ value: "", label: "None" }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]} onchange={(v) => cfg.set({ track: v })} />
          <label class="{btn} cursor-pointer focus-within:outline-2">
            <Upload class="size-4" aria-hidden="true" />Import
            <input class="sr-only" type="file" accept="audio/*" aria-label="Import a backing track" onchange={(e) => addTrack(e.currentTarget.files?.[0])} />
          </label>
        </div>
        {#if trackError}<p role="alert" class="font-medium text-destructive">{trackError}</p>{/if}
      </div>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase !== "ready"}
      <Stat label="Notes" value={stats.count} />
      <Stat label="Distinct" value={stats.distinct} />
      <Stat label="Range" value={rangeOf(stats)} />
      {#each Object.entries(stats.perSource) as [src, n] (src)}<Stat label={SOURCE[src as InputSource]} value={n} />{/each}
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="mb-3 flex flex-wrap items-center gap-3">
      {#if phase === "running"}
        <span class="rec flex items-center gap-2 text-sm font-semibold"><span class="dot" aria-hidden="true"></span>Recording</span>
      {/if}
      {#if canMic && phase !== "results"}
        <button type="button" class={btnStage} aria-pressed={micOn} onclick={toggleMic}>
          {#if micOn}<MicOff class="size-4" aria-hidden="true" />Stop listening{:else}<Mic class="size-4" aria-hidden="true" />Listen with the microphone{/if}
        </button>
      {/if}
      <div class="flex min-w-48 flex-1 items-center gap-2 text-sm">
        {#if micOn}
          <span class="text-ws-stage-soft">Input level</span>
          <meter class="level" min="0" max="1" low="0.5" high="0.9" optimum="0.7" value={levelPct} aria-label="Microphone level">{Math.round(mic.level)} dB</meter>
          <span class="tnum">{Math.round(mic.level)} dB{mic.advice ? `, ${mic.advice.label}` : ""}</span>
        {:else if lastVelocity !== null}
          <span class="text-ws-stage-soft">Last velocity</span>
          <meter class="level" min="0" max="1" value={lastVelocity} aria-label="Last MIDI velocity">{Math.round(lastVelocity * 127)}</meter>
          <span class="tnum">{Math.round(lastVelocity * 127)} of 127</span>
        {:else if phase === "running"}
          <span class="text-ws-stage-soft">Level shows here once the microphone is on or a MIDI note arrives. On-screen taps have no velocity.</span>
        {/if}
      </div>
    </div>
    {#if fretted}
      <Fretboard openStrings={tuning.openStrings} from={0} to={12} label="{tuning.name} fretboard" />
    {:else}
      <Piano low={48} high={84} label="Piano keyboard" />
    {/if}
    {#if recent.length}
      <p class="mt-3 text-sm" aria-hidden="true">
        <span class="text-ws-stage-soft">Last notes:</span>
        {#each recent as n, i (i)}<span class="tnum mr-2 font-medium">{noteName(n.midi)}</span>{/each}
      </p>
    {/if}
  {/snippet}

  {#snippet results()}
    <article class="{panel} flex flex-wrap items-start gap-4">
      <div class="min-w-0 flex-1 basis-72">
        {#if saved}
          <p class="font-display text-2xl font-semibold">Take saved: {saved.notes.length} notes in {secs(saved.durationMs)}.</p>
          <p class="mt-1 text-sm text-ws-soft">{stats.distinct} distinct notes, {rangeOf(stats)}. Logged as free practice; free play is never scored.</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class={btn} onclick={() => playTake(saved!)}>
              {#if playing === saved.id}<Square class="size-4" aria-hidden="true" />Stop{:else}<Play class="size-4" aria-hidden="true" />Play it back{/if}
            </button>
            <a class={btn} href="/music/record">Open in Record</a>
          </div>
        {:else}
          <p class="font-display text-2xl font-semibold">Nothing was played this time.</p>
        {/if}
      </div>
      {#if saved}
        <div class="text-right">
          <p class="tnum font-display text-5xl font-bold leading-none">{saved.notes.length}</p>
          <p class="mt-1 text-sm text-ws-soft">notes kept</p>
        </div>
      {/if}
    </article>
  {/snippet}
</DrillShell>

{#if phase !== "running"}
  <div class="mx-auto mt-8 grid w-full max-w-6xl gap-6 lg:grid-cols-2">
    <section aria-labelledby="takes-h">
      <h2 id="takes-h" class="font-display text-xl font-semibold">Recent takes</h2>
      {#if takes.length}
        <ul class="mt-2 divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface" aria-label="Recent takes">
          {#each takes as t (t.id)}
            <li class="flex items-center gap-3 px-4 py-2">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{t.name}</span>
                <span class="tnum block text-sm text-ws-soft">{t.notes.length} notes, {secs(t.durationMs)}{t.instrument ? `, ${INSTRUMENT_LABEL[t.instrument]}` : ""}</span>
              </span>
              <button type="button" class={btn} aria-label="{playing === t.id ? 'Stop' : 'Play'} {t.name}" onclick={() => playTake(t)}>
                {#if playing === t.id}<Square class="size-4" aria-hidden="true" />{:else}<Play class="size-4" aria-hidden="true" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-ws-soft">No takes yet. Start recording and play anything; it lands here.</p>
      {/if}
    </section>
    <section aria-labelledby="drills-h">
      <h2 id="drills-h" class="font-display text-xl font-semibold">Turn it into practice</h2>
      <ul class="mt-2 grid grid-cols-2 gap-2">
        {#each DRILLS as d (d.href)}
          <li>
            <a class="flex min-h-14 flex-col justify-center rounded-xl border border-ws-line bg-ws-surface px-3 py-2 hover:bg-ws-raised" href={d.href}>
              <span class="font-semibold">{d.label}</span>
              <span class="text-xs text-ws-soft">{d.hint}</span>
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
