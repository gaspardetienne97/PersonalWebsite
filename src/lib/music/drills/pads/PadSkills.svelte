<script lang="ts">
  // The pad skills beyond rudiments and grooves (docs/research/pads-aerophone-gaps.md):
  // dynamics on a velocity ladder, fills that land on the one, playing a groove
  // back by ear, an ostinato under a reading line, rudiments spread across the
  // kit, and improvising over a loop. The grooves go through the groove grader;
  // dynamics and improvising have their own measures (content/pad-skills).
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { GROOVE_VOICES, grooveTargetsFor } from "@repo/music-core/content/winds-pads";
  import { gradeGroove, type GrooveResult } from "@repo/music-core/scoring/pads";
  import {
    DYNAMICS,
    DYNAMICS_EXERCISES,
    ECHO_LEVELS,
    ECHO_PASS,
    ORCHESTRATIONS,
    PAD_FILLS,
    READING_LINES,
    echoGroove,
    fillGroove,
    fillReport,
    gradeDynamics,
    improviseReport,
    inRange,
    ladderBand,
    orchestrationGroove,
    ostinatoGroove,
    ostinatoReport,
    quantise,
    velocityRange,
    type DynamicsId,
    type VelocityRange,
  } from "@repo/music-core/content/pad-skills";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Pads from "$lib/music/components/Pads.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, getSetting, putSetting, settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import GrooveGrid from "./GrooveGrid.svelte";
  import MidiStatus from "./MidiStatus.svelte";
  import { laneColor } from "./lanes";
  import { backingFor } from "./backing";

  type SkillMode = "dynamics" | "fills" | "echo" | "ostinato" | "orchestrate" | "improvise";
  let { skill, modes, onmode }: { skill: SkillMode; modes: readonly (readonly [string, string])[]; onmode: (m: string) => void } = $props();

  const cfg = new DrillSetup("pad-skills", {
    fill: "snare-eighths" as string,
    orch: "hats-snare" as string,
    line: "quarters" as string,
    echo: "kick-snare" as string,
    dyn: "ladder" as string,
    bars: 4,
  });
  const s = $derived(cfg.value);
  const bpm = $derived(clamp(settings.value.bpm, 40, 200));
  const beatMs = $derived(60000 / bpm);
  const barMs = $derived(4 * beatMs);
  const voicePads = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));

  // The groove-shaped skills share one path: targets, the grader, a grid.
  const grooveDef = $derived(
    skill === "fills" ? fillGroove(s.fill) : skill === "orchestrate" ? orchestrationGroove(s.orch) : skill === "ostinato" ? ostinatoGroove(s.line) : skill === "echo" ? echoGroove(s.echo) : null,
  );
  const gt = $derived(grooveDef ? grooveTargetsFor(grooveDef, bpm) : null);
  const dyn = $derived(DYNAMICS_EXERCISES.find((d) => d.id === s.dyn) ?? DYNAMICS_EXERCISES[0]);
  const dynSlots = $derived(Array.from({ length: dyn.notes }, (_, i) => (i * beatMs) / dyn.perBeat));
  const improBars = $derived([4, 8].includes(s.bars) ? s.bars : 4);
  const lengthMs = $derived(gt ? gt.lengthMs + (grooveDef!.targets.some((t) => t.beat >= grooveDef!.bars * 4) ? beatMs : 0) : skill === "dynamics" ? dyn.notes * (beatMs / dyn.perBeat) : improBars * barMs);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let grv = $state.raw<GrooveResult | null>(null);
  let levels = $state.raw<(number | null)[]>([]);
  let take = $state.raw<{ at: number; midi: number; velocity: number }[]>([]);
  let downbeat = $state(0);
  let now = $state(0);
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;
  let band: { stop(): void } | null = null;
  const flashes = new Flashes();

  // Dynamics: the player's soft-to-loud range on this controller, set once.
  const RANGE_KEY = "pads.velocity-range";
  let range = $state<VelocityRange | null>(null);
  void getSetting<VelocityRange | null>(RANGE_KEY, null).then((r) => (range = r));
  let calibrating = $state<"soft" | "loud" | null>(null);
  let calSoft = $state<number[]>([]);
  let calLoud = $state<number[]>([]);
  let calStop: (() => void) | null = null;
  function calibrate() {
    calibrating = "soft";
    calSoft = [];
    calLoud = [];
    calStop?.();
    const c = capture(performance.now(), (e) => {
      if (e.kind !== "noteon" || !e.velocityMeasured) return;
      if (calibrating === "soft") {
        calSoft.push(e.velocity);
        if (calSoft.length >= 4) calibrating = "loud";
      } else if (calibrating === "loud") {
        calLoud.push(e.velocity);
        if (calLoud.length >= 4) {
          calibrating = null;
          calStop?.();
          const r = velocityRange(calSoft, calLoud);
          if (r) {
            range = r;
            void putSetting(RANGE_KEY, r);
            status = `Range set: soft ${Math.round(r.soft * 127)}, loud ${Math.round(r.loud * 127)} (MIDI velocity).`;
          } else status = "Those were too close together. Try the softest you can, then the hardest.";
        }
      }
    });
    calStop = c.stop;
    status = "Play your four softest hits on any pad, then your four loudest.";
  }

  const sixteenthNow = $derived(phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / (beatMs / 4)) : null);
  const inCallBar = $derived(skill === "echo" && phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / barMs) % 2 === 0 : false);

  const usedVoices = $derived(gt ? GROOVE_VOICES.filter((v) => gt.targets.some((t) => t.voice === v.id)) : []);
  const names = $derived<Record<number, string>>(Object.fromEntries(usedVoices.map((v) => [v.midi, v.name])));
  const colors = $derived<Record<number, string>>(Object.fromEntries(usedVoices.map((v) => [v.midi, laneColor(v.id)])));
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (!gt || mode !== "practice" || phase !== "running" || skill === "echo" || sixteenthNow === null) return out;
    for (const t of gt.targets) if (Math.round(t.beat * 4) === sixteenthNow) out[t.pad] = { target: true };
    return out;
  });

  const label = $derived(
    skill === "fills"
      ? `Fill: ${PAD_FILLS.find((f) => f.id === s.fill)?.label ?? ""}, after three bars of rock, landing on the one`
      : skill === "orchestrate"
        ? (ORCHESTRATIONS.find((o) => o.id === s.orch)?.label ?? "")
        : skill === "ostinato"
          ? `Hats eighths, then a snare line: ${READING_LINES.find((r) => r.id === s.line)?.label ?? ""}`
          : skill === "echo"
            ? `Play it back: ${ECHO_LEVELS.find((l) => l.id === s.echo)?.label ?? ""}, four rounds`
            : skill === "dynamics"
              ? dyn.label
              : `Improvise over ${improBars} bars of the band`,
  );
  const summaryLine = $derived(`${label}, ${bpm} BPM`);

  function hearCalls(fromPerf: number) {
    if (skill !== "echo" || !grooveDef || !("calls" in grooveDef)) return null;
    const lead = Math.max(0, (fromPerf - performance.now()) / 1000);
    return audio.playSequence(
      (grooveDef as ReturnType<typeof echoGroove>).calls.map((t) => ({ midi: voicePads[t.voice], time: lead + (t.beat * beatMs) / 1000, duration: 0.12, velocity: t.accent === "accent" ? 1 : t.accent === "ghost" ? 0.35 : 0.75, voice: "drum" as const })),
    );
  }

  async function playDemo() {
    await audio.unlock();
    const notes = gt
      ? (skill === "echo" ? (grooveDef as ReturnType<typeof echoGroove>).calls : grooveDef!.targets).map((t) => ({ midi: voicePads[t.voice], time: (t.beat * beatMs) / 1000, duration: 0.12, velocity: t.accent === "accent" ? 1 : t.accent === "ghost" ? 0.35 : 0.75, voice: "drum" as const }))
      : skill === "dynamics"
        ? dynSlots.map((at, i) => ({ midi: 38, time: at / 1000, duration: 0.1, velocity: s.dyn === "ladder" ? 0.2 + ladderBand(i)[0] * 0.8 : s.dyn === "crescendo" ? 0.15 + (i / 15) * 0.85 : 0.6, voice: "drum" as const }))
        : backingFor("Funk", [{ beat: 0, voice: "kick" }, { beat: 2.5, voice: "kick" }].flatMap((k) => Array.from({ length: improBars }, (_, b) => ({ ...k, beat: k.beat + b * 4 }))), improBars, beatMs);
    audio.playSequence(notes);
    status = skill === "echo" ? "Listen: the four calls. In the run, each is followed by a bar for your answer." : "Listen: how it goes. Not scored.";
  }

  function onHit(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    if (!gt) return;
    const at = e.at - downbeat;
    const near = gt.targets.some((t) => t.pad === e.midi && Math.abs(t.atMs - at) <= gt.matchWindowMs);
    if (mode === "practice") flashes.add(e.midi, near ? "correct" : "wrong", 250);
  }

  function start(ctx: RunContext) {
    summary = null;
    grv = null;
    levels = [];
    take = [];
    flashes.clear();
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: `technique.mpc.${skill}`,
      setupKey: `pad-skills:${skill}:${grooveDef?.value ?? s.dyn}:${bpm}`,
      skillIds: ["technique.mpc", `technique.mpc.${skill === "orchestrate" ? "orchestration" : skill === "ostinato" ? "independence" : skill}`],
      capabilities: ["technique"],
      modality: "played",
      assistance: skill === "improvise" ? "guided" : assistanceFor(mode),
      difficulty: skill === "dynamics" ? 0.45 : skill === "echo" ? 0.5 : skill === "improvise" ? 0.4 : 0.55,
      instrument: "mpc",
      params: { skill, bpm, setup: grooveDef?.value ?? s.dyn },
    });
    cap = capture(ctx.downbeat - beatMs / 2, (e) => e.kind === "noteon" && onHit(e as NoteEvent));
    if (skill === "echo") band = hearCalls(ctx.downbeat);
    if (skill === "improvise") {
      const lead = Math.max(0, (ctx.downbeat - performance.now()) / 1000);
      const kicks = Array.from({ length: improBars }, (_, b) => [{ beat: b * 4, voice: "kick" }, { beat: b * 4 + 2.5, voice: "kick" }]).flat();
      band = audio.playSequence(backingFor("Funk", kicks, improBars, beatMs).map((n) => ({ ...n, time: n.time + lead })));
      status = "Improvise: any pads, any rhythm. Listen to the band and lock in.";
    } else if (skill === "dynamics") status = s.dyn === "ladder" ? "Four soft, four a little louder, four louder, four loudest." : s.dyn === "crescendo" ? "Start as soft as you can and grow to your loudest." : "Every hit the same: a steady middle level.";
    else if (skill === "echo") status = "Listen to the bar, then play it back in the next.";
    const tick = () => {
      now = performance.now();
      if (phase === "running" || phase === "countin") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + lengthMs + beatMs / 2 + 150);
  }

  const ms = (x: number | null | undefined) => (x === null || x === undefined ? "none" : `${x > 0 ? "+" : ""}${Math.round(x)} ms`);

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    band?.stop();
    band = null;
    cap?.stop();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    phase = "results";
    let score = 0;
    let correct = false;
    let headline = "";
    let rows: RunSummary["rows"] = [];

    if (gt && grooveDef) {
      // Play it back: only the answer bars are scored, so playing along with a call costs nothing.
      const hits = skill === "echo" ? ons.filter((h) => Math.floor((h.at - downbeat + gt.matchWindowMs) / barMs) % 2 === 1) : ons;
      const r = gradeGroove({ targets: grooveDef.targets, voicePads, sectionLabels: grooveDef.sectionLabels, beatsPerBar: 4, beatMs, startAt: downbeat, hits });
      if ("error" in r) {
        status = r.error;
        phase = "ready";
        return;
      }
      grv = r;
      score = r.score;
      correct = r.correct;
      rows = [
        { label: "Notes matched", value: r.accuracy, text: `${r.matched} of ${grooveDef.targets.length}, ${r.extra} extra` },
        { label: "Timing", text: `${Math.round(r.meanAbsErrorMs)} ms off on average` },
      ];
      if (skill === "fills") {
        const f = fillReport(grooveDef as ReturnType<typeof fillGroove>, r.perTarget);
        correct = r.correct && f.landed && !f.rushed;
        rows.push({ label: "The fill", text: f.fillMeanMs === null ? "not played" : `${ms(f.fillMeanMs)} on average${f.rushed ? ": rushed" : ""}` }, { label: "Landing on the one", text: f.landingMs === null ? "missed" : `${ms(f.landingMs)}${f.landed ? ", landed" : ""}` });
        headline = f.landingMs === null ? "The fill never landed: crash and kick together on the one after it." : f.rushed ? `The fill rushed (${ms(f.fillMeanMs)}): keep the sixteenths the same size as the groove's.` : f.landed ? `Landed on the one (${ms(f.landingMs)}).` : `Off the one by ${ms(f.landingMs)}: aim the crash at the click.`;
      } else if (skill === "ostinato") {
        const o = ostinatoReport(grooveDef, r.perTarget);
        correct = r.correct && o.held;
        rows.push({ label: "Hats alone", value: o.alone, text: pct(o.alone) }, { label: "Hats under the line", value: o.together, text: pct(o.together) }, { label: "The line", value: o.line, text: pct(o.line) });
        headline = o.held ? `The hats held (${pct(o.together)} under the line, ${pct(o.alone)} alone).` : `The hats slipped under the line: ${pct(o.together)} against ${pct(o.alone)} alone. Slow down until the right hand stays put.`;
      } else if (skill === "echo") {
        const rounds = [0, 1, 2, 3].map((k) => {
          const idx = grooveDef.targets.flatMap((t, i) => (Math.floor(t.beat / 8) === k ? [i] : []));
          return idx.filter((i) => r.perTarget[i] !== null).length / Math.max(1, idx.length);
        });
        const passed = rounds.filter((x) => x >= ECHO_PASS).length;
        correct = passed === 4 && r.extra === 0;
        rows = [...rows, ...rounds.map((x, k) => ({ label: `Round ${k + 1}`, value: x, text: `${pct(x)}${x >= ECHO_PASS ? ", played back" : ""}` }))];
        headline = `${passed} of 4 played back${r.extra ? `, ${r.extra} extra hits` : ""}.`;
      } else headline = r.correct ? `Clean: ${r.matched} of ${grooveDef.targets.length}, ${Math.round(r.meanAbsErrorMs)} ms off.` : `${r.matched} of ${grooveDef.targets.length} notes, ${r.extra} extra.`;
    } else if (skill === "dynamics") {
      const measured = ons.length > 0 && ons.every((n) => n.velocityMeasured);
      if (!measured || !range) {
        headline = !range ? "Set your range first: Calibrate, then run it." : "Dynamics need velocity: play on the MPC (with Full Level off), not the screen.";
        rows = [{ label: "Velocity", notMeasured: true }];
      } else {
        const slotMs = beatMs / dyn.perBeat;
        levels = dynSlots.map((at) => {
          const h = ons.find((n) => Math.abs(n.at - downbeat - at) <= slotMs / 2);
          return h ? inRange(h.velocity, range!) : null;
        });
        const g = gradeDynamics(dyn.id as DynamicsId, levels);
        score = g.score;
        correct = g.correct;
        rows =
          dyn.id === "ladder"
            ? [{ label: "Hits in their level", value: g.inBand ?? 0, text: pct(g.inBand ?? 0) }]
            : dyn.id === "crescendo"
              ? [{ label: "Always growing (rank correlation)", value: Math.max(0, g.rho ?? 0), text: (g.rho ?? 0).toFixed(2) }, { label: "Range covered", value: Math.min(1, g.span ?? 0), text: pct(g.span ?? 0) }]
              : [{ label: "Spread", text: `${pct(g.spread ?? 0)} of your range (aim under ${pct(DYNAMICS.evenSpread)})` }];
        headline = g.correct ? "Controlled: every hit where you meant it." : dyn.id === "ladder" ? `${pct(g.inBand ?? 0)} of hits in their level; the bars show which drifted.` : dyn.id === "crescendo" ? "Grow more steadily, from your softest to your loudest." : `The level wandered by ${pct(g.spread ?? 0)} of your range.`;
      }
    } else {
      take = ons.map((n) => ({ at: n.at, midi: n.midi, velocity: n.velocity }));
      const rep = improviseReport(take, downbeat, beatMs);
      score = rep.hits ? 1 : 0;
      correct = rep.hits > 0;
      rows = [
        { label: "Hits", text: String(rep.hits) },
        { label: "Distance from the sixteenth grid", text: rep.timingSpreadMs === null ? "too few hits" : `${Math.round(rep.timingSpreadMs)} ms spread` },
        { label: "Swing", text: rep.swing === null ? "not enough off-beats" : `${rep.swing}% (50 straight, 66 triplet)` },
        { label: "Loudness range", text: rep.velocity ? `${Math.round(rep.velocity[0] * 127)} to ${Math.round(rep.velocity[1] * 127)}` : "none" },
        { label: "Pads used", text: `${rep.pads.length}` },
      ];
      headline = rep.hits ? `${rep.hits} hits on ${rep.pads.length} pads. Hear it back, then nudged half way to the grid.` : "Nothing was played.";
    }
    await run!.attempt({ promptId: `${skill}:${grooveDef?.value ?? s.dyn}`, correct, partialCredit: score, metrics: grv?.metrics ?? [], source: runSource(notes), instrument: "mpc" });
    const fin = await run!.finish({ score, correct, headline });
    summary = { headline, metric: pct(score), metricLabel: skill === "improvise" ? "played" : "score", delta: fin.delta, best: fin.best, clean: correct && mode === "check", xp: fin.xp, assistance: skill === "improvise" ? "Improvising is described, not graded." : assistanceText(mode), rows, advance: graded(ons.length) ? await advanceAfter(score, correct) : undefined };
    status = headline;
  }

  /** Improvising is described, not graded; dynamics count only with velocity measured. */
  const graded = (hits: number) => hits > 0 && skill !== "improvise" && (skill !== "dynamics" || levels.length > 0);
  /** Each skill climbs the tempo to 120, then moves through its own list. */
  function advanceAfter(score: number, correct: boolean) {
    const [list, key] = ({ fills: [PAD_FILLS, "fill"], orchestrate: [ORCHESTRATIONS, "orch"], ostinato: [READING_LINES, "line"], echo: [ECHO_LEVELS, "echo"], dynamics: [DYNAMICS_EXERCISES, "dyn"] } as const)[skill as Exclude<SkillMode, "improvise">];
    const xs = list as readonly { id: string; label: string }[];
    const step = Math.max(0, xs.findIndex((x) => x.id === s[key]));
    return nextRun(`pads.${skill}`, { bpm, tempo: { min: 40, goal: 120 }, steps: xs.map((x) => ({ label: x.label })), step }, { score, correct }, tempoAnd((i) => cfg.set({ [key]: xs[i].id })));
  }

  function hearTake(amount: number) {
    if (!take.length) return;
    const q = amount ? quantise(take, downbeat, beatMs, amount) : take;
    audio.playSequence(q.map((h) => ({ midi: h.midi, time: (h.at - downbeat) / 1000 + 0.05, duration: 0.12, velocity: h.velocity, voice: "drum" as const })));
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    band?.stop();
    band = null;
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    band?.stop();
    cap?.stop();
    calStop?.();
  });
</script>

<DrillShell
  title="Pads"
  hue="mpc"
  blurb={skill === "dynamics" ? "Velocity on purpose: levels, a crescendo, even hits, against your own soft-to-loud range." : skill === "fills" ? "Three bars of groove, a fill, and the crash and kick back on the one, without rushing." : skill === "echo" ? "Hear a bar, play it back in the next: four rounds, scored on the answers." : skill === "ostinato" ? "The right hand keeps the hats while the left reads a line; the hats are measured against playing them alone." : skill === "orchestrate" ? "A rudiment spread across the kit: the sticking becomes a groove." : "Improvise over the band; the take is described, then played back as it was and nudged to the grid."}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={phase === "running" && now >= downbeat ? clamp((now - downbeat) / lengthMs, 0, 1) : 0}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={playDemo}
  onstart={start}
  onstop={stop}
  blocked={skill === "dynamics" && !range ? "Set your soft-to-loud range first: press Calibrate." : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Mode" select options={modes.map(([value, l]) => ({ value, label: l }))} value={skill} onchange={onmode} />
      {#if skill === "fills"}
        <Choice label="Fill" select options={PAD_FILLS.map((f) => ({ value: f.id, label: f.label }))} value={s.fill} onchange={(v) => cfg.set({ fill: v })} />
      {:else if skill === "orchestrate"}
        <Choice label="Orchestration" select options={ORCHESTRATIONS.map((o) => ({ value: o.id as string, label: o.label }))} value={s.orch} onchange={(v) => cfg.set({ orch: v })} />
      {:else if skill === "ostinato"}
        <Choice label="Reading line" select options={READING_LINES.map((r) => ({ value: r.id as string, label: r.label }))} value={s.line} onchange={(v) => cfg.set({ line: v })} />
      {:else if skill === "echo"}
        <Choice label="Level" options={ECHO_LEVELS.map((l) => ({ value: l.id as string, label: l.label }))} value={s.echo} onchange={(v) => cfg.set({ echo: v })} />
      {:else if skill === "dynamics"}
        <Choice label="Exercise" select options={DYNAMICS_EXERCISES.map((d) => ({ value: d.id as string, label: d.label }))} value={s.dyn} onchange={(v) => cfg.set({ dyn: v })} />
      {:else}
        <Choice label="Bars" options={[4, 8].map((n) => ({ value: n, label: String(n) }))} value={improBars} onchange={(v) => cfg.set({ bars: v })} />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">Tempo comes from the practice strip. Thresholds here are starting values to tune on your controller.</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && skill === "echo"}
      <Stat label="Now" value={inCallBar ? "listen" : "your turn"} tone={inCallBar ? undefined : "success"} />
    {:else if phase === "running" && sixteenthNow !== null}
      <Stat label="Bar" value={`${Math.min(Math.floor(sixteenthNow / 16) + 1, Math.ceil(lengthMs / barMs))}`} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-4" data-testid="pad-skills" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-targets={gt ? JSON.stringify(gt.targets.map((t) => [t.pad, Math.round(t.atMs), t.accent ? "a" : t.ghost ? "g" : "n"])) : undefined}>
      {#if phase === "ready" || phase === "results"}
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Pads mode">
          {#each modes as [id, l] (id)}
            <button type="button" class="min-h-11 rounded-full px-4 text-sm font-semibold {skill === id ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/10 text-ws-stage-ink hover:bg-ws-stage-ink/20'}" aria-pressed={skill === id} onclick={() => onmode(id)}>{l}</button>
          {/each}
        </div>
      {/if}
      {#if gt && grooveDef && (skill !== "echo" || phase === "results") && (mode === "practice" || phase === "results")}
        <GrooveGrid targets={gt.targets} bars={grooveDef.bars} sectionLabels={grooveDef.sectionLabels} playhead={sixteenthNow} outcomes={grv?.perTarget} windowMs={gt.matchWindowMs} />
      {:else if skill === "echo"}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm" aria-live="polite">{phase === "running" ? (inCallBar ? "Listen…" : "Your turn: play it back.") : "Each call is a bar on the kit; play it back in the bar after. The grid shows after the run."}</p>
      {:else if skill === "dynamics"}
        <div class="rounded-xl bg-ws-stage-ink/8 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>{range ? `Your range: ${Math.round(range.soft * 127)} soft to ${Math.round(range.loud * 127)} loud.` : "No range yet."} {calibrating ? `Now your ${calibrating === "soft" ? "softest" : "loudest"} hits (${calibrating === "soft" ? calSoft.length : calLoud.length} of 4).` : ""}</p>
            <button type="button" class={btnStage} onclick={calibrate} disabled={phase === "running"}>{range ? "Recalibrate" : "Calibrate"}</button>
          </div>
          <svg viewBox="0 0 320 100" class="mt-3 h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Each hit's level in your range{levels.length ? '' : ', after the run'}">
            {#each dynSlots as _, i (i)}
              {@const w = 320 / dyn.notes}
              {@const band = dyn.id === "ladder" ? ladderBand(i) : dyn.id === "crescendo" ? [Math.max(0, i / (dyn.notes - 1) - 0.1), Math.min(1, i / (dyn.notes - 1) + 0.1)] : [0.4, 0.6]}
              <rect x={i * w + 1} y={100 - band[1] * 100} width={w - 2} height={(band[1] - band[0]) * 100} class="band" />
              {#if levels[i] !== undefined && levels[i] !== null}
                <rect x={i * w + w * 0.25} y={100 - levels[i]! * 100} width={w * 0.5} height={levels[i]! * 100} class="lvl" />
              {/if}
            {/each}
          </svg>
          <p class="mt-1 text-xs text-ws-stage-soft">Shaded: where each hit should land. Bars: where yours did.</p>
        </div>
      {:else}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">Any pads. The band plays {improBars} bars of a funk vamp; listen back afterwards, as played and nudged half way to the grid.</p>
      {/if}
      <Pads marks={marks} {flashes} {names} {colors} label="MPC pads, bank A. Computer keys Z X C V play the bottom row." />
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if skill === "improvise" && take.length}
            <button type="button" class={btn} onclick={() => hearTake(0)}>Hear your take</button>
            <button type="button" class={btn} onclick={() => hearTake(0.5)}>Hear it nudged to the grid</button>
          {/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="mpc" /></div>
  {/snippet}
</DrillShell>

<style>
  .band {
    fill: color-mix(in oklch, var(--instr) 22%, transparent);
  }
  .lvl {
    fill: var(--instr);
  }
</style>
