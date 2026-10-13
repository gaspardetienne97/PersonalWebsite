<script lang="ts">
  // Aerophone technique beyond the lessons and breath holds (docs/research/
  // pads-aerophone-gaps.md): timed scales and arpeggios in any key, tonguing
  // patterns told apart by the breath, register crossings, trills, and bite
  // vibrato at a rate. The lines are graded by order and evenness; the rest by
  // their own measures in content/aero-skills.
  import { onDestroy } from "svelte";
  import type { ControlEvent, NoteEvent } from "@repo/music-core";
  import { clamp, FLAT_NAMES, noteName } from "@repo/music-core";
  import { fingeringFor } from "@repo/music-core/content/winds-pads";
  import {
    AERO_GRADE_SPEEDS,
    AERO_SCALES,
    REGISTER_PAIRS,
    TONGUING,
    TRILL_PAIRS,
    TRILL_SECONDS,
    VIBRATO,
    VIBRATO_SETS,
    bendWobble,
    crossingLine,
    glitches,
    gradeTrill,
    joinTypes,
    octaveSlip,
    scaleLine,
    tonguingMarks,
    tonguingScore,
  } from "@repo/music-core/content/aero-skills";
  import { gradeLine, type LineResult } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import AerophoneKeys from "$lib/music/components/AerophoneKeys.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { benchFromUrl } from "$lib/music/drills/piano/transport.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, settings } from "$lib/music/runtime";
  import MidiStatus from "$lib/music/drills/pads/MidiStatus.svelte";
  import { aerophoneSkills, type AerophoneMode } from "@repo/music-core/content/winds-pads";

  type Skill = "scales" | "tonguing" | "register" | "trills" | "vibrato";
  let { skill, modes, onmode }: { skill: Skill; modes: readonly { id: string; label: string }[]; onmode: (m: string) => void } = $props();

  const cfg = new DrillSetup("aero-skills", {
    scale: "major" as string,
    key: 0,
    perBeat: 1,
    tongue: "slur2-tongue2" as string,
    pair: "cs5-d5" as string,
    trill: "g4-a4" as string,
    vib: "4-at-60" as string,
    vibNote: 67,
  });
  const s = $derived(cfg.value);
  const vib = $derived(VIBRATO_SETS.find((v) => v.id === s.vib) ?? VIBRATO_SETS[0]);
  const bpm = $derived(skill === "vibrato" ? vib.bpm : clamp(settings.value.bpm, 40, 160));
  const perBeat = $derived(skill === "scales" ? ([1, 2, 4].includes(s.perBeat) ? s.perBeat : 1) : 2);
  const stepMs = $derived(60000 / bpm / perBeat);
  const trillPair = $derived(TRILL_PAIRS.find((p) => p.id === s.trill) ?? TRILL_PAIRS[0]);
  const regPair = $derived(REGISTER_PAIRS.find((p) => p.id === s.pair) ?? REGISTER_PAIRS[0]);

  /** The notes to play in time (scales, tonguing and crossings). */
  const line = $derived(skill === "scales" ? scaleLine(s.scale, s.key) : skill === "tonguing" ? scaleLine("major", s.key) : skill === "register" ? crossingLine(s.pair) : []);
  const marks = $derived(skill === "tonguing" ? tonguingMarks(s.tongue, line.length) : []);
  const timed = $derived(line.length > 0);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>(benchFromUrl({ min: 40, max: 160 }));
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let downbeat = $state(0);
  let now = $state(0);
  let firstAt = $state<number | null>(null);
  let sounding = $state<number | null>(null);
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;
  let joins = $state<("T" | "S")[]>([]);
  let lineResult = $state.raw<LineResult | null>(null);

  const stepNow = $derived(timed && phase === "running" && now >= downbeat ? Math.min(line.length - 1, Math.floor((now - downbeat) / stepMs + 0.5)) : null);
  const target = $derived(timed ? line[stepNow ?? 0] : skill === "trills" ? trillPair.notes[0] : skill === "vibrato" ? s.vibNote : null);

  const summaryLine = $derived(
    skill === "scales"
      ? `${FLAT_NAMES[s.key]} ${AERO_SCALES.find((x) => x.id === s.scale)?.label.toLowerCase()}, up and down, ${bpm} BPM, ${perBeat === 1 ? "a note" : `${perBeat} notes`} a click`
      : skill === "tonguing"
        ? `${FLAT_NAMES[s.key]} major, ${TONGUING.find((t) => t.id === s.tongue)?.label.toLowerCase()}, ${bpm} BPM, eighths`
        : skill === "register"
          ? `${regPair.label}, back and forth in eighths at ${bpm} BPM`
          : skill === "trills"
            ? `Trill ${trillPair.label}, ${TRILL_SECONDS} seconds, as fast and even as you can`
            : `Bite vibrato on ${noteName(s.vibNote)}, ${vib.label.toLowerCase()}`,
  );

  async function playDemo() {
    await audio.unlock();
    const notes = timed
      ? line.map((midi, i) => ({ midi, time: (i * stepMs) / 1000, duration: (stepMs * (marks[i + 1] === "S" ? 1 : 0.8)) / 1000 }))
      : skill === "trills"
        ? Array.from({ length: 24 }, (_, i) => ({ midi: trillPair.notes[i % 2], time: i * 0.125, duration: 0.12 }))
        : [{ midi: s.vibNote, time: 0, duration: VIBRATO.seconds }];
    audio.playSequence(notes);
    status = "Listen: how it goes. Not scored.";
  }

  function onEvent(e: NoteEvent | ControlEvent) {
    if (e.kind === "noteon") {
      sounding = (e as NoteEvent).midi;
      if (firstAt === null && phase === "running") {
        firstAt = e.at;
        // Trills and vibrato are timed from the first note.
        if (!timed) {
          clearTimeout(timer);
          timer = setTimeout(() => void finish(), e.at + (skill === "trills" ? TRILL_SECONDS : VIBRATO.seconds) * 1000 - performance.now() + 100);
        }
      }
    } else if (e.kind === "noteoff" && (e as NoteEvent).midi === sounding) sounding = null;
  }

  function start(ctx: RunContext) {
    summary = null;
    lineResult = null;
    joins = [];
    firstAt = null;
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: `technique.aerophone.${skill}`,
      setupKey: `aero:${summaryLine}`,
      skillIds: aerophoneSkills(skill as AerophoneMode),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: skill === "scales" ? 0.4 + perBeat * 0.05 : skill === "register" ? 0.55 : skill === "trills" ? 0.5 : 0.5,
      instrument: "aerophone",
      params: { skill, bpm, setup: summaryLine },
    });
    cap = capture(timed ? ctx.downbeat - stepMs / 2 : performance.now(), (e) => onEvent(e as NoteEvent | ControlEvent));
    status = timed ? "Play in time with the click." : skill === "trills" ? `Trill ${trillPair.label}: the clock starts on your first note.` : `Hold ${noteName(s.vibNote)} and pulse the bite ${vib.pulses} times a click.`;
    timer = setTimeout(() => void finish(), timed ? Math.max(0, ctx.downbeat - performance.now()) + line.length * stepMs + 60000 / bpm : 15000);
    const tick = () => {
      now = performance.now();
      if (phase === "running" || phase === "countin") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const controls = cap?.controls ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    phase = "results";
    let score = 0;
    let correct = false;
    let headline = "";
    let rows: RunSummary["rows"] = [];
    if (!ons.length) headline = "No note arrived. The line under the stage says whether the Aerophone is connected.";
    else if (timed) {
      const r = gradeLine({ beats: line.map((m) => [{ midi: m }]), beatMs: stepMs, notes });
      lineResult = r;
      const strays = Math.max(0, ons.length - r.clean);
      const slips = r.metrics.flatMap((mt) => (mt.kind === "pitch" && mt.actualMidi !== undefined && mt.actualMidi !== mt.expectedMidi ? [octaveSlip(mt.expectedMidi, mt.actualMidi)] : [])).filter(Boolean);
      score = r.score;
      correct = r.correct;
      rows = [
        { label: "Notes right", value: r.pitch, text: `${r.clean} of ${r.total}` },
        { label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(r.evennessErrorMs)} ms off` },
        { label: "Stray notes between fingerings", text: String(strays) },
      ];
      if (skill === "register") {
        const g = glitches(notes, regPair.notes);
        correct = r.pitch >= 0.9 && g <= 1;
        rows[2] = { label: "Glitches across the break", text: `${g}${g <= 1 ? "" : ": move the fingers and the thumb together"}` };
      }
      if (skill === "tonguing") {
        const got = joinTypes(notes, controls);
        joins = got;
        const breathSeen = controls.some((c) => c.kind === "cc" && c.controller === 2);
        const t = tonguingScore(marks, got);
        score = r.score * 0.5 + t * 0.5;
        correct = r.correct && t >= 0.8;
        rows.push(breathSeen ? { label: "Tongued and slurred as marked", value: t, text: pct(t) } : { label: "Tonguing (no breath arrived, CC 2)", notMeasured: true });
      }
      headline = !r.correct
        ? slips.length
          ? `${r.clean} of ${r.total} right; ${slips.length} came out an octave off: ${slips[0]}.`
          : r.pitch < 0.9
            ? `${r.clean} of ${r.total} notes right. Slow down until every fingering lands.`
            : `Every note right; the spacing wandered ${Math.round(r.evennessErrorMs)} ms. Keep it even.`
        : skill === "tonguing" && !correct
          ? "The notes were right; the tonguing wasn't as marked. Stop the air (the tongue) only where it says T."
          : skill === "register" && !correct
            ? "Right notes, but the crossing left glitches between them."
            : `Clean and even at ${bpm} BPM.`;
    } else if (skill === "trills") {
      const t = gradeTrill(notes, trillPair.notes);
      score = t.score;
      correct = t.correct;
      rows = [
        { label: "Notes a second", text: t.perSecond.toFixed(1) },
        { label: "Evenness", value: t.evenness, text: pct(t.evenness) },
        { label: "Stray notes", text: String(t.strays) },
      ];
      headline = t.correct ? `${t.perSecond.toFixed(1)} notes a second, even to ${pct(t.evenness)}.` : t.strays ? `${t.strays} stray notes: move only the finger that changes.` : t.evenness < 0.7 ? `Uneven (${pct(t.evenness)}): slower and steady first, then faster.` : `${t.perSecond.toFixed(1)} a second: aim for 4 or more, even.`;
    } else {
      const bends = controls.filter((c) => c.kind === "pitchbend" && firstAt !== null && c.at >= firstAt && c.at <= firstAt + VIBRATO.seconds * 1000).map((c) => ({ at: c.at, value: c.value }));
      const w = bends.length ? bendWobble(bends) : null;
      const want = (vib.pulses * vib.bpm) / 60;
      if (!w) {
        headline = "No bite arrived: set the bite to send pitch bend (E-Wind bite mode gives vibrato), then try again.";
        rows = [{ label: "Bite (pitch bend)", notMeasured: true }];
      } else if (w.rateHz === null) {
        headline = "The pitch held still: pulse the bite in time with the click.";
        rows = [{ label: "Vibrato", text: "none heard" }];
      } else {
        const off = Math.abs(w.rateHz - want) / want;
        score = Math.max(0, 1 - off) * 0.6 + (w.evenness ?? 0) * 0.4;
        correct = off <= VIBRATO.rateTolerance && (w.evenness ?? 0) >= VIBRATO.evenness;
        rows = [
          { label: `Rate (target ${want.toFixed(1)} a second)`, text: `${w.rateHz.toFixed(1)} a second` },
          { label: "Evenness", value: w.evenness ?? 0, text: pct(w.evenness ?? 0) },
          { label: "Depth", text: `${Math.round(w.depth * 100)}% of the bend range` },
        ];
        headline = correct ? `${vib.pulses} pulses a click, even.` : w.rateHz < want ? `Too slow: ${w.rateHz.toFixed(1)} a second against ${want.toFixed(1)}.` : off > VIBRATO.rateTolerance ? `Too fast: ${w.rateHz.toFixed(1)} a second against ${want.toFixed(1)}.` : `On rate, but uneven (${pct(w.evenness ?? 0)}).`;
      }
    }
    await run!.attempt({ promptId: `aero:${skill}`, correct, partialCredit: score, metrics: lineResult?.metrics ?? [], source: runSource(notes), instrument: runInstrument(notes, "aerophone") ?? null });
    const fin = await run!.finish({ score, correct, headline });
    summary = { headline, metric: pct(score), metricLabel: "score", delta: fin.delta, best: fin.best, clean: correct && mode === "check", xp: fin.xp, assistance: assistanceText(mode), rows };
    status = headline;
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }
  onDestroy(() => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
  });
</script>

<DrillShell
  title="Aerophone"
  hue="aerophone"
  blurb={skill === "scales" ? "Scales and arpeggios in any key, in time: every fingering, the octave key at the right moment." : skill === "tonguing" ? "Slurred and tongued notes on purpose: a tongued note stops the air, a slurred one changes key with the air still going." : skill === "register" ? "Across the break and over the octave keys, back and forth, with no glitch notes in between." : skill === "trills" ? "Two fingerings back and forth as fast and even as you can." : "Vibrato with the bite, pulsed in time: so many pulses a click."}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={timed && stepNow !== null ? (stepNow + 1) / line.length : 0}
  clock={timed || skill === "vibrato" ? { bpm, beatsPerBar: 4 } : null}
  ondemo={playDemo}
  onstart={start}
  onstop={stop}
  blocked={timed && !line.length ? "That scale doesn't fit the Aerophone's charted range in this key." : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Mode" select options={modes.map((x) => ({ value: x.id, label: x.label }))} value={skill} onchange={onmode} />
      {#if skill === "scales" || skill === "tonguing"}
        <Choice label="Key" select options={FLAT_NAMES.map((n, p) => ({ value: p, label: n }))} value={s.key} onchange={(v) => cfg.set({ key: v })} />
      {/if}
      {#if skill === "scales"}
        <Choice label="Scale" select options={AERO_SCALES.map((x) => ({ value: x.id as string, label: x.label }))} value={s.scale} onchange={(v) => cfg.set({ scale: v })} />
        <Choice label="Notes a click" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={perBeat} onchange={(v) => cfg.set({ perBeat: v })} />
        <Choice
          label="Grade speed (NZMEB saxophone)"
          select
          options={[{ value: "", label: "None" }, ...AERO_GRADE_SPEEDS.map((g) => ({ value: g.id as string, label: g.label }))]}
          value=""
          onchange={(v) => {
            const g = AERO_GRADE_SPEEDS.find((x) => x.id === v);
            if (g) {
              cfg.set({ perBeat: g.perBeat });
              settings.update({ bpm: g.bpm });
            }
          }}
        />
      {:else if skill === "tonguing"}
        <Choice label="Pattern" select options={TONGUING.map((x) => ({ value: x.id as string, label: x.label }))} value={s.tongue} onchange={(v) => cfg.set({ tongue: v })} />
      {:else if skill === "register"}
        <Choice label="Crossing" select options={REGISTER_PAIRS.map((x) => ({ value: x.id as string, label: x.label }))} value={s.pair} onchange={(v) => cfg.set({ pair: v })} />
      {:else if skill === "trills"}
        <Choice label="Trill" select options={TRILL_PAIRS.map((x) => ({ value: x.id as string, label: x.label }))} value={s.trill} onchange={(v) => cfg.set({ trill: v })} />
      {:else}
        <Choice label="Rate" select options={VIBRATO_SETS.map((x) => ({ value: x.id as string, label: x.label }))} value={s.vib} onchange={(v) => cfg.set({ vib: v })} />
        <Choice label="Note" options={[62, 67, 69, 74].map((m) => ({ value: m, label: noteName(m) }))} value={s.vibNote} onchange={(v) => cfg.set({ vibNote: v })} />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">Tempo comes from the practice strip{skill === "vibrato" ? " except here, where the rate sets it" : ""}. Thresholds are starting values to tune on your Aerophone.</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && timed && stepNow !== null}
      <Stat label="Note" value={`${stepNow + 1} of ${line.length}`} />
    {:else if phase === "running" && !timed}
      <Stat label="Time" value={firstAt === null ? "waiting" : `${((now - firstAt) / 1000).toFixed(1)} s`} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_14rem]" data-testid="aero-skills" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-line={line.join(",")} data-step-ms={Math.round(stepMs)}>
      <div class="flex min-w-0 flex-col gap-3">
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Aerophone mode">
          {#each modes as x (x.id)}
            <button type="button" class="min-h-11 rounded-full px-4 text-sm font-semibold {skill === x.id ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/10 text-ws-stage-ink hover:bg-ws-stage-ink/20'}" aria-pressed={skill === x.id} onclick={() => phase !== "running" && onmode(x.id)}>{x.label}</button>
          {/each}
        </div>
        {#if timed}
          <ol class="flex flex-wrap gap-1.5" aria-label="The line">
            {#each line as n, i (i)}
              {@const nowHere = stepNow === i}
              <li class="flex min-h-12 min-w-11 flex-col items-center justify-center rounded-lg px-1.5 text-sm font-semibold {nowHere ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/8'}" aria-current={nowHere ? "step" : undefined}>
                {#if marks.length}<span class="text-[10px] font-bold opacity-70" title={marks[i] === "T" ? "tongued" : "slurred"}>{marks[i] === "T" ? "T" : "⌒"}{#if joins.length && joins[i] !== undefined}{joins[i] === marks[i] ? " ✓" : " ✕"}{/if}</span>{/if}
                {fingeringFor(n)?.name ?? noteName(n)}
              </li>
            {/each}
          </ol>
          {#if marks.length}<p class="text-xs text-ws-stage-soft">T: tongue it (stop the air); ⌒: slur into it from the note before.</p>{/if}
        {:else if skill === "trills"}
          <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-lg font-semibold">{trillPair.notes.map((m) => fingeringFor(m)?.name).join(" ⇄ ")}</p>
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">Hold {noteName(s.vibNote)} steadily and pulse the bite {vib.pulses} times a click: the click plays at {vib.bpm} BPM. The bite reaches the app as pitch bend.</p>
        {/if}
      </div>
      <div class="flex flex-col items-center gap-2">
        {#if mode === "practice" && target !== null}
          <AerophoneKeys midi={target} heldMidi={sounding} compact />
          <p class="text-center font-display text-2xl font-semibold">{fingeringFor(target)?.name ?? noteName(target)}</p>
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">Check: fingering hidden.</p>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="aerophone" /></div>
  {/snippet}
</DrillShell>
