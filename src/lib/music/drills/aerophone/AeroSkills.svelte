<script lang="ts">
  // Aerophone technique beyond the lessons and breath holds (docs/research/
  // pads-aerophone-gaps.md): timed scales and arpeggios in any key, tonguing
  // patterns told apart by the breath, register crossings, trills, and bite
  // vibrato at a rate. The lines are graded by order and evenness; the rest by
  // their own measures in content/aero-skills.
  import { onDestroy } from "svelte";
  import type { ControlEvent, NoteEvent } from "@repo/music-core";
  import { clamp, noteName } from "@repo/music-core";
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
    tonguingVerdict,
  } from "@repo/music-core/content/aero-skills";
  import { gradeLine, type LineResult } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import AerophoneKeys from "$lib/music/components/AerophoneKeys.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { transposeFifths, writtenOffset } from "@repo/music-core/theory/transposition";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import { btn } from "$lib/music/components/ui";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { benchFromUrl } from "$lib/music/drills/piano/transport.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
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
  const bpm = $derived(skill === "vibrato" ? vib.bpm : clamp(settings.value.bpm, 30, 240));
  const perBeat = $derived(skill === "scales" ? ([1, 2, 4].includes(s.perBeat) ? s.perBeat : 1) : 2);
  const stepMs = $derived(60000 / bpm / perBeat);
  const trillPair = $derived(TRILL_PAIRS.find((p) => p.id === s.trill) ?? TRILL_PAIRS[0]);
  const regPair = $derived(REGISTER_PAIRS.find((p) => p.id === s.pair) ?? REGISTER_PAIRS[0]);
  // The material is written for the fingering chart (keys, pairs and notes as
  // read); the run is concert, what the AE-20 sends in its reading key.
  const shift = $derived(writtenOffset("aerophone", settings.value));
  const concert = (written: readonly number[]) => written.map((m) => m - shift);
  const trillNotes = $derived(concert(trillPair.notes));
  const vibNote = $derived(s.vibNote - shift);

  /** The notes to play in time (scales, tonguing and crossings), concert. */
  const line = $derived(concert(skill === "scales" ? scaleLine(s.scale, s.key) : skill === "tonguing" ? scaleLine("major", s.key) : skill === "register" ? crossingLine(s.pair) : []));
  const marks = $derived(skill === "tonguing" ? tonguingMarks(s.tongue, line.length) : []);
  const timed = $derived(line.length > 0);
  /** The written line's key signature: the scale's own (arpeggios their key's), the major key for tonguing, none for crossings. */
  const scaleKind = $derived(skill === "tonguing" ? "major" : s.scale === "major-arpeggio" ? "major" : s.scale === "minor-arpeggio" ? "natural-minor" : s.scale);
  const signature = $derived(skill === "scales" || skill === "tonguing" ? (scaleKind === "chromatic" ? 0 : signatureFor(s.key, scaleKind)) : 0);
  /** A concert note by its written name: spelled by the key in scales and tonguing (Db major reads Db, not C#), the chart's spelling elsewhere. */
  const spell = (midi: number) => (skill === "scales" || skill === "tonguing" ? noteName(midi + shift, signature < 0 ? "flat" : "sharp") : (fingeringFor(midi + shift)?.name ?? noteName(midi + shift)));
  const keyName = (pc: number) => noteName(pc, (scaleKind === "chromatic" ? 0 : signatureFor(pc, scaleKind)) < 0 ? "flat" : "sharp", false);

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
  const target = $derived(timed ? line[stepNow ?? 0] : skill === "trills" ? trillNotes[0] : skill === "vibrato" ? vibNote : null);

  const summaryLine = $derived<SetupClause[]>(
    skill === "scales"
      ? [{ text: `${keyName(s.key)} ${AERO_SCALES.find((x) => x.id === s.scale)?.label.toLowerCase()}`, focus: "scale" }, { text: "up and down" }, { text: `${bpm} BPM` }, { text: `${perBeat === 1 ? "a note" : `${perBeat} notes`} a click`, focus: "perBeat" }]
      : skill === "tonguing"
        ? [{ text: `${keyName(s.key)} major`, focus: "key" }, { text: `${TONGUING.find((t) => t.id === s.tongue)?.label.toLowerCase()}`, focus: "tongue" }, { text: `${bpm} BPM` }, { text: "eighths" }]
        : skill === "register"
          ? [{ text: regPair.label, focus: "pair" }, { text: `back and forth in eighths at ${bpm} BPM` }]
          : skill === "trills"
            ? [{ text: `Trill ${trillPair.label}`, focus: "trill" }, { text: `${TRILL_SECONDS} seconds, as fast and even as you can` }]
            : [{ text: `Bite vibrato on ${spell(vibNote)}`, focus: "vibNote" }, { text: vib.label.toLowerCase(), focus: "vib" }, { text: "the rate sets the tempo" }],
  );
  const summaryText = $derived(summaryLine.map((c) => c.text).join(", "));
  let demo = $state<{ stop(): void; playing: boolean } | null>(null);
  function stopDemo() {
    demo?.stop();
    demo = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes = timed
      ? line.map((midi, i) => ({ midi, time: (i * stepMs) / 1000, duration: (stepMs * (marks[i + 1] === "S" ? 1 : 0.8)) / 1000 }))
      : skill === "trills"
        ? Array.from({ length: 24 }, (_, i) => ({ midi: trillNotes[i % 2], time: i * 0.125, duration: 0.12 }))
        : [{ midi: vibNote, time: 0, duration: VIBRATO.seconds }];
    const handle = audio.playSequence(notes);
    demo = handle;
    status = "Listen: how it goes. Not scored.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
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
    stopDemo();
    summary = null;
    lineResult = null;
    joins = [];
    firstAt = null;
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: `technique.aerophone.${skill}`,
      setupKey: `aero:${summaryText}`,
      skillIds: aerophoneSkills(skill as AerophoneMode),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: skill === "scales" ? 0.4 + perBeat * 0.05 : skill === "register" ? 0.55 : skill === "trills" ? 0.5 : 0.5,
      instrument: "aerophone",
      params: { skill, bpm, setup: summaryText },
    });
    cap = capture(timed ? ctx.downbeat - stepMs / 2 : performance.now(), (e) => onEvent(e as NoteEvent | ControlEvent));
    status = timed ? "Play in time with the click." : skill === "trills" ? `Trill ${trillPair.label}: the clock starts on your first note.` : `Hold ${spell(vibNote)} and pulse the bite ${vib.pulses} times a click.`;
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
      const slips = r.metrics.flatMap((mt) => (mt.kind === "pitch" && mt.actualMidi !== undefined && mt.actualMidi !== mt.expectedMidi ? [octaveSlip(mt.expectedMidi + shift, mt.actualMidi + shift)] : [])).filter(Boolean);
      score = r.score;
      correct = r.correct;
      rows = [
        { label: "Notes right", value: r.pitch, text: `${r.clean} of ${r.total}` },
        { label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(r.evennessErrorMs)} ms off` },
        { label: "Stray notes between fingerings", text: String(strays) },
      ];
      if (skill === "register") {
        // Evenness still counts: an uneven crossing is not a clean one.
        const g = glitches(notes, concert(regPair.notes));
        correct = r.correct && g <= 1;
        rows[2] = { label: "Glitches across the break", text: `${g}${g <= 1 ? "" : ": move the fingers and the thumb together"}` };
      }
      if (skill === "tonguing") {
        const got = joinTypes(notes, controls);
        joins = got;
        const breathSeen = controls.some((c) => c.kind === "cc" && c.controller === 2);
        const t = tonguingScore(marks, got);
        ({ score, correct } = tonguingVerdict(r, t, breathSeen));
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
      const t = gradeTrill(notes, trillNotes);
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
    summary = { headline, metric: pct(score), metricLabel: "score", delta: fin.delta, best: fin.best, clean: correct && mode === "check", xp: fin.xp, assistance: assistanceText(mode), rows, advance: ons.length ? await advanceAfter(score, correct) : undefined };
    status = headline;
  }

  /** Scales climb the tempo, then notes a click; the others move through their lists. */
  const PER_BEAT_STEPS = [
    { label: "One note a click", goal: 120 },
    { label: "Two notes a click", goal: 92 },
    { label: "Four notes a click", goal: 72 },
  ];
  function advanceAfter(score: number, correct: boolean) {
    const run = { score, correct };
    const list = <T extends { id: string; label: string }>(xs: readonly T[], at: string) => ({ steps: xs.map((x) => ({ label: x.label })), step: Math.max(0, xs.findIndex((x) => x.id === at)) });
    if (skill === "scales")
      return nextRun(`aero.scales.${s.scale}.${s.key}`, { bpm, tempo: { min: 40, goal: 120 }, steps: PER_BEAT_STEPS, step: [1, 2, 4].indexOf(perBeat) }, run, tempoAnd((i) => cfg.set({ perBeat: [1, 2, 4][i] })));
    if (skill === "tonguing") return nextRun(`aero.tonguing.${s.key}`, { bpm, tempo: { min: 40, goal: 120 }, ...list(TONGUING, s.tongue) }, run, tempoAnd((i) => cfg.set({ tongue: TONGUING[i].id })));
    if (skill === "register") return nextRun("aero.register", { bpm, tempo: { min: 40, goal: 100 }, ...list(REGISTER_PAIRS, s.pair) }, run, tempoAnd((i) => cfg.set({ pair: REGISTER_PAIRS[i].id })));
    if (skill === "trills") return nextRun("aero.trills", list(TRILL_PAIRS, s.trill), run, ({ step }) => step !== undefined && cfg.set({ trill: TRILL_PAIRS[step].id }));
    return nextRun(`aero.vibrato.${s.vibNote}`, list(VIBRATO_SETS, s.vib), run, ({ step }) => step !== undefined && cfg.set({ vib: VIBRATO_SETS[step].id }));
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
    stopDemo();
  });
</script>

<DrillShell
  title="Aerophone"
  hue="aerophone"
  blurb={skill === "scales" ? "Scales and arpeggios in any key, in time: every fingering, the octave key at the right moment." : skill === "tonguing" ? "Slurred and tongued notes on purpose: a tongued note stops the air, a slurred one changes key with the air still going." : skill === "register" ? "Across the break and over the octave keys, back and forth, with no glitch notes in between." : skill === "trills" ? "Two fingerings back and forth as fast and even as you can." : "Vibrato with the bite, pulsed in time: so many pulses a click."}
  summary={summaryLine}
  tabs={modes}
  tab={skill}
  ontab={onmode}
  modeNotes={{ practice: "The line and the fingering shown. Practice, not a test.", check: "Fingering hidden. Counts toward mastery." }}
  bind:phase
  bind:mode
  bind:status
  progress={timed && stepNow !== null ? (stepNow + 1) / line.length : 0}
  clock={timed || skill === "vibrato" ? { bpm, beatsPerBar: 4 } : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  blocked={timed && !line.length ? "That scale doesn't fit the Aerophone's charted range in this key." : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if skill === "scales" || skill === "tonguing"}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
          <span class="font-medium">Key</span>
          <KeyPicker label="Key" value={s.key} name={keyName} onchange={(v) => cfg.set({ key: v })} />
        </div>
      {/if}
      {#if skill === "scales"}
        <Choice label="Scale" options={AERO_SCALES.map((x) => ({ value: x.id as string, label: x.label }))} value={s.scale} onchange={(v) => cfg.set({ scale: v })} setupKey="scale" />
        <div class="flex min-w-0 flex-col gap-3">
          <Choice label="Notes a click" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={perBeat} onchange={(v) => cfg.set({ perBeat: v })} setupKey="perBeat" />
          <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-label="Grade speeds (NZMEB saxophone)">
            <span class="text-ws-soft">Grade speeds (NZMEB saxophone): one tap sets the tempo and the notes a click.</span>
            <div class="flex flex-wrap gap-1.5">
              {#each AERO_GRADE_SPEEDS as g (g.id)}
                <button type="button" class={btn} aria-pressed={bpm === g.bpm && perBeat === g.perBeat} onclick={() => {
                  cfg.set({ perBeat: g.perBeat });
                  void settings.update({ bpm: g.bpm });
                }}>{g.label}</button>
              {/each}
            </div>
          </div>
        </div>
      {:else if skill === "tonguing"}
        <Choice label="Pattern" options={TONGUING.map((x) => ({ value: x.id as string, label: x.label, detail: x.group.split("").join(" ") }))} value={s.tongue} onchange={(v) => cfg.set({ tongue: v })} setupKey="tongue" />
      {:else if skill === "register"}
        <Choice label="Crossing" options={REGISTER_PAIRS.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail || undefined }))} value={s.pair} onchange={(v) => cfg.set({ pair: v })} setupKey="pair" />
      {:else if skill === "trills"}
        <Choice label="Trill" options={TRILL_PAIRS.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail || undefined }))} value={s.trill} onchange={(v) => cfg.set({ trill: v })} setupKey="trill" />
      {:else}
        <Choice label="Rate" options={VIBRATO_SETS.map((x) => ({ value: x.id as string, label: x.label }))} value={s.vib} onchange={(v) => cfg.set({ vib: v })} setupKey="vib" />
        <Choice label="Note" options={[62, 67, 69, 74].map((m) => ({ value: m, label: spell(m - shift) }))} value={s.vibNote} onchange={(v) => cfg.set({ vibNote: v })} setupKey="vibNote" />
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && timed && stepNow !== null}
      <Stat label="Note" value={`${stepNow + 1} of ${line.length}`} />
    {:else if phase === "running" && !timed}
      <Stat label="Time" value={firstAt === null ? "waiting" : `${((now - firstAt) / 1000).toFixed(1)} s`} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid items-start gap-5 {skill === 'trills' ? '' : 'md:grid-cols-[minmax(0,1fr)_14rem]'}" data-testid="aero-skills" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-line={line.join(",")} data-step-ms={Math.round(stepMs)}>
      <div class="flex min-w-0 flex-col gap-3">
        {#if timed}
          {#if skill === "register" && regPair.detail}<p class="text-sm text-ws-stage-soft">{regPair.label}: {regPair.detail}.</p>{/if}
          {#if mode === "practice" || phase === "results"}
            <LineNotation notes={line.map((midi, i) => ({ midi, startBeat: i / perBeat, durationBeats: 1 / perBeat }))} title={summaryText} cursorBeat={stepNow === null ? null : stepNow / perBeat} keyFifths={transposeFifths(signature, -shift)} instrument="aerophone" />
          {/if}
          <ol class="flex flex-wrap gap-1.5" aria-label="The line">
            {#each line as n, i (i)}
              {@const nowHere = stepNow === i}
              <li class="flex min-h-12 min-w-11 flex-col items-center justify-center rounded-lg px-1.5 text-sm font-semibold {nowHere ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/8'}" aria-current={nowHere ? "step" : undefined}>
                {#if marks.length}<span class="text-[10px] font-bold opacity-70" title={marks[i] === "T" ? "tongued" : "slurred"}>{marks[i] === "T" ? "T" : "⌒"}{#if joins.length && joins[i] !== undefined}{joins[i] === marks[i] ? " ✓" : " ✕"}{/if}</span>{/if}
                {spell(n)}
              </li>
            {/each}
          </ol>
          {#if marks.length}<p class="text-xs text-ws-stage-soft">T: tongue it (stop the air); ⌒: slur into it from the note before.</p>{/if}
        {:else if skill === "trills"}
          <p class="text-sm text-ws-stage-soft">Trill {trillPair.label}{trillPair.detail ? ` (${trillPair.detail})` : ""}: move only the finger that changes.</p>
          {#if mode === "practice"}
            <!-- The two fingerings side by side, the one sounding lit. -->
            <div class="flex flex-wrap justify-center gap-4">
              {#each trillNotes as n (n)}
                <div class="flex flex-col items-center gap-1 {sounding === n ? '' : 'opacity-80'}">
                  <AerophoneKeys midi={n} heldMidi={sounding} compact />
                  <p class="text-center font-display text-2xl font-semibold">{spell(n)}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">Check: fingering hidden.</p>
          {/if}
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">Hold {spell(vibNote)} steadily and pulse the bite {vib.pulses} times a click: the click plays at {vib.bpm} BPM. The bite reaches the app as pitch bend.</p>
        {/if}
      </div>
      {#if skill !== "trills"}
        <div class="flex flex-col items-center gap-2">
          {#if mode === "practice" && target !== null}
            <AerophoneKeys midi={target} heldMidi={sounding} compact />
            <p class="text-center font-display text-2xl font-semibold">{spell(target)}</p>
          {:else}
            <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">Check: fingering hidden.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="aerophone" /></div>
  {/snippet}
</DrillShell>
