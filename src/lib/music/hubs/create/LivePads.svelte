<script lang="ts">
  // Play the beat in live, as on the MPC: the loop goes round with a click and
  // every pass records what the pads play (kick, then snare, then hats), with
  // input quantise off, 50% or 100%, undo of the last pass, swing on the loop
  // and Note Repeat on a held pad. Keep the loop when it is done: the build is
  // graded (in time, three passes, no late undo) and joins the beat.
  import { onDestroy } from "svelte";
  import type { InputEvent, NoteEvent } from "@repo/music-core";
  import { gradeLiveLoop, quantiseBeat, REPEAT_RATES, LIVE_LOOP, type LivePass } from "@repo/music-core/content/pads-studio";
  import Pads from "$lib/music/components/Pads.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import { btn, btnPrimary } from "$lib/music/components/ui";
  import { pct } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, input, type SequenceHandle } from "$lib/music/runtime";
  import { NoteRepeat } from "$lib/music/drills/pads/note-repeat";
  import { barsOf, beatNotes, type BeatPattern } from "./pattern";
  import { session } from "./session.svelte";

  let { announce }: { announce: (msg: string) => void } = $props();

  let quantise = $state(0);
  let swing = $state(50);
  let rate = $state<string>("off");
  let recording = $state(false);
  let loopAt = $state(0);
  let now = $state(0);
  let raf = 0;
  let handle: SequenceHandle | null = null;
  /** Every pass so far (undone ones kept, for the grade), and the pattern before each kept pass. */
  let passes = $state.raw<(LivePass & { before: BeatPattern })[]>([]);
  let current: LivePass["hits"] = [];
  let startedAt = 0;
  let lastScore = $state<string | null>(null);

  const bpm = $derived(session.bpm);
  const beatMs = $derived(60000 / bpm);
  const loopBeats = $derived(barsOf(session.pattern) * 4);
  const kept = $derived(passes.filter((p) => !p.undone));
  const beatNow = $derived(recording && now >= loopAt ? ((now - loopAt) / beatMs) % loopBeats : null);

  const repeater = new NoteRepeat({
    origin: () => (recording ? loopAt : null),
    beatMs: () => beatMs,
    rate: () => (rate === "off" ? "1/16" : rate),
    onRepeat: (e) => {
      audio.playKitPad(e.midi, e.velocity);
      take(e, true);
    },
  });

  /** A hit's place in the loop, as played; quantise is applied when the pass is kept. */
  function take(e: NoteEvent, repeat = false) {
    if (!recording) return;
    const rel = (e.at - loopAt) / beatMs;
    current.push({ midi: e.midi, beat: ((rel % loopBeats) + loopBeats) % loopBeats, velocity: e.velocityMeasured ? e.velocity : 0.8, ...(repeat ? { repeat: true } : {}) });
  }

  // Pads: MIDI hits sound on the kit here (the MPC is silent in Controller Mode); on-screen taps already do.
  $effect(() =>
    input.subscribe((e: InputEvent) => {
      if (e.kind === "noteon" && e.source !== "onscreen") audio.playKitPad(e.midi, e.velocity);
      if (rate !== "off") repeater.handle(e);
      if (e.kind === "noteon") take(e);
    }),
  );

  /** The pass just played joins the beat: as played, half way to the grid, or on it. */
  function commit() {
    const hits = current;
    current = [];
    if (!hits.length) return;
    const before = $state.snapshot(session.pattern) as BeatPattern;
    const steps: Record<string, number[]> = structuredClone(before.steps);
    const live = [...(before.live ?? [])];
    for (const h of hits) {
      const beat = quantiseBeat(h.beat, quantise, swing, loopBeats);
      const step = Math.round(beat * 4);
      if (quantise === 1 && Math.abs(beat * 4 - step) < 1e-6 && swing === 50) {
        const k = String(h.midi);
        steps[k] = [...new Set([...(steps[k] ?? []), step % (loopBeats * 4)])].sort((a, b) => a - b);
      } else live.push({ midi: h.midi, beat, velocity: h.velocity });
    }
    session.setPattern({ ...before, steps, live, swing });
    passes = [...passes, { hits, undone: false, before }];
    announce(`Pass ${kept.length} kept: ${hits.length} hits.`);
  }

  async function record() {
    if (recording) return stop();
    await audio.unlock();
    if (!audio.unlocked) return announce("Sound is blocked. Tap for sound in the strip above, then try again.");
    session.stop();
    if (!passes.length) startedAt = performance.now();
    recording = true;
    current = [];
    const bar = (b: number) => Array.from({ length: 4 }, (_, k) => ({ midi: 0, time: ((b * 4 + k) * beatMs) / 1000, duration: 0.05, velocity: k ? 0.6 : 0.95, voice: "click" as const }));
    handle = audio.playLoop({
      notes: () => [...beatNotes(session.pattern, bpm), ...Array.from({ length: barsOf(session.pattern) }, (_, b) => bar(b)).flat()],
      lengthSec: () => (loopBeats * beatMs) / 1000,
      onLoop: (perfAt) => {
        // A pass ends where the next begins.
        if (loopAt) commit();
        loopAt = perfAt;
      },
    });
    const tick = () => {
      now = performance.now();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    announce(`Recording: ${barsOf(session.pattern)} bar${barsOf(session.pattern) > 1 ? "s" : ""} at ${bpm} BPM, round and round. Each pass adds what you play; one voice a pass works best.`);
  }

  function stop() {
    if (!recording) return;
    handle?.stop();
    handle = null;
    cancelAnimationFrame(raf);
    repeater.stop();
    recording = false;
    loopAt = 0;
    // What was played since the last downbeat counts as a pass too.
    commit();
  }

  function undo() {
    const last = [...passes].reverse().find((p) => !p.undone);
    if (!last) return;
    session.setPattern(last.before);
    passes = passes.map((p) => (p === last ? { ...p, undone: true } : p));
    announce("Undid the last pass.");
  }

  /** The build is graded and recorded; the loop stays in the beat. */
  async function keep() {
    stop();
    if (!kept.length) return announce("Record a pass first.");
    const minutes = Math.round(((performance.now() - startedAt) / 60000) * 10) / 10;
    const g = gradeLiveLoop(passes, { bpm, swing, minutes });
    const run = practice.beginRun({
      exerciseId: "technique.mpc.live-loop",
      setupKey: `live:${barsOf(session.pattern)}:${bpm}:${swing}`,
      skillIds: ["technique.mpc"],
      capabilities: ["technique", "rhythm"],
      modality: "played",
      assistance: "independent",
      difficulty: Math.min(0.95, 0.4 + (bpm - 80) / 300 + barsOf(session.pattern) * 0.05),
      instrument: "mpc",
      params: { bpm, bars: barsOf(session.pattern), swing, quantise, repeat: g.repeats, passes: g.kept, undos: g.undos, minutes },
    });
    await run.attempt({ promptId: `live:${barsOf(session.pattern)}`, correct: g.correct, partialCredit: g.score, metrics: [], source: "midi", instrument: "mpc" });
    const headline = g.correct
      ? `A ${barsOf(session.pattern)}-bar loop in ${g.kept} passes, in time, in ${minutes} minutes.`
      : g.kept < LIVE_LOOP.passes
        ? `${g.kept} passes kept: build it in at least ${LIVE_LOOP.passes} (kick, snare, hats).`
        : g.lateUndo
          ? "A pass from the third on was undone: aim to keep every pass once the groove is there."
          : g.time < LIVE_LOOP.timePass
            ? "The hits wandered off the grid: steady the passes, or set Quantise to 50%."
            : `Built in ${minutes} minutes: aim for ${LIVE_LOOP.maxMinutes} or less.`;
    await run.finish({ score: g.score, correct: g.correct, headline });
    lastScore = `${pct(g.score)}: ${headline}`;
    announce(headline);
    passes = [];
  }

  onDestroy(() => {
    handle?.stop();
    cancelAnimationFrame(raf);
    repeater.stop();
  });
</script>

<section class="stage rounded-3xl p-3 sm:p-5" aria-label="Play it live" data-testid="live-pads" data-loop-at={recording ? Math.round(loopAt) : undefined} data-passes={kept.length}>
  <div class="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
    <button type="button" class={btnPrimary} aria-pressed={recording} onclick={record}>{recording ? "Stop" : passes.length ? "Record more" : "Record"}</button>
    <button type="button" class={btn} disabled={!kept.length} onclick={undo}>Undo last pass</button>
    <button type="button" class={btn} disabled={!kept.length && !recording} onclick={keep}>Keep this loop</button>
    <p class="min-w-0 flex-1 basis-48 text-sm text-ws-stage-soft" aria-live="polite">
      {recording ? `Pass ${kept.length + 1}, beat ${beatNow === null ? "-" : Math.floor(beatNow) + 1} of ${loopBeats}.` : `${barsOf(session.pattern)} bar${barsOf(session.pattern) > 1 ? "s" : ""} at ${bpm} BPM: the beat's length (set on the beat grid) and the song's tempo.`}
      {kept.length ? ` ${kept.length} kept.` : ""}
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-3">
    <Choice label="Quantise" options={[{ value: 0, label: "Off" }, { value: 0.5, label: "50%" }, { value: 1, label: "100%" }]} value={quantise} onchange={(v) => (quantise = v)} />
    <Choice label="Swing" options={[50, 54, 56, 58, 60, 62, 66].map((n) => ({ value: n, label: n === 50 ? "Straight" : `${n}%` }))} value={swing} onchange={(v) => (swing = v)} />
    <Choice label="Note repeat" options={[{ value: "off", label: "Off" }, ...REPEAT_RATES.map((r) => ({ value: r.id as string, label: r.id }))]} value={rate} onchange={(v) => (rate = v)} />
  </div>
  <p class="mt-3 text-[13px] text-ws-stage-soft">
    Note repeat: hold a pad and it repeats on the loop's grid{repeater.aftertouch ? "; your pads send aftertouch, so pressure sets the level" : "; pressure sets the level when the pads send aftertouch"}. Keep this loop grades the build: in time, at least {LIVE_LOOP.passes} passes, no undo from the third on, {LIVE_LOOP.maxMinutes} minutes or less.
    {#if lastScore}<span class="font-semibold text-ws-stage-ink">Last loop: {lastScore}</span>{/if}
  </p>
  <div class="mt-4 max-w-md"><Pads label="MPC pads, bank A, playing the kit. Computer keys Z X C V play the bottom row." /></div>
</section>
