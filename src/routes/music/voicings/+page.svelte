<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { FLAT_NAMES, noteName, pc, pcOf } from "@repo/music-core";
  import { KEY_CYCLE } from "@repo/music-core/content/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { Transport, benchFromUrl, sounding, spanOf, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { gradeItem, voicingItems, type ItemGrade, type Variant, type VoicingItem } from "$lib/music/drills/piano/voicings";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";

  const VARIANTS: { value: Variant; label: string }[] = [
    { value: "major", label: "Major ii-V-I" },
    { value: "minor", label: "Minor ii-V-i" },
    { value: "altered", label: "Altered dominants" },
    { value: "inversions", label: "Closest chords, I IV V I" },
    { value: "voice-leading", label: "Guide tones through the keys" },
    { value: "cadence", label: "Cadences I IV I V7 I" },
    { value: "cadence-minor", label: "Minor cadences i iv i V7 i" },
  ];

  let mode = $state<DrillMode>(benchFromUrl({ min: 40, max: 200 }));
  const cfg = new DrillSetup("voicings", {
    variant: "major" as string,
    key: 0,
    keys: 3,
    strict: false as boolean,
    position: "A" as string,
  });
  const s = $derived(cfg.value);
  const variant = $derived((VARIANTS.some((v) => v.value === s.variant) ? s.variant : "major") as Variant);
  const monophonic = $derived(settings.value.activeInstrument === "aerophone" || settings.value.activeInstrument === "voice");
  const items = $derived(
    voicingItems({ variant, keyPc: pc(s.key), keys: variant === "inversions" ? 1 : s.keys, startPosition: s.position === "B" ? "B" : "A", arpeggio: monophonic }),
  );
  const span = $derived(spanOf(items.flatMap((i) => i.show.map((n) => n.midi))));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let index = $state(0);
  let grades = $state<(ItemGrade | null)[]>([]);
  let summary = $state<RunSummary | null>(null);
  let collected = $state<number[]>([]);
  let collectedMode = $state(false);
  const transport = new Transport();
  const flashes = new Flashes();
  const held = new Set<number>();
  let peak: number[] = [];
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let advance: ReturnType<typeof setTimeout> | undefined;
  let promptAt = 0;

  const current = $derived<VoicingItem | undefined>(items[index]);
  const group = $derived(items.filter((i) => i.group === (current ?? items[0])?.group));

  // Demo: the current key's chords, two beats each, root with them.
  const demoNotes = $derived<TimedNote[]>(
    group.flatMap((it, k) => (monophonic ? it.show.map((n, j) => ({ midi: n.midi, beat: k * 2 + j * 0.5, dur: 0.5, hand: n.hand })) : it.show.map((n) => ({ midi: n.midi, beat: k * 2, dur: 1.8, hand: n.hand })))),
  );
  const demoIndex = $derived(transport.beat === null ? null : Math.min(group.length - 1, Math.floor(transport.beat / 2)));

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    const lab = (h: "left" | "right") => ({ label: h === "left" ? "L" : "R", role: h });
    if (transport.playing) {
      for (const n of sounding(demoNotes, transport.beat)) out[n.midi] = { demo: true, ...lab(n.hand!) };
      return out;
    }
    if (mode !== "practice" || phase === "results" || !current) return out;
    for (const n of current.show) out[n.midi] = { target: true, ...lab(n.hand) };
    return out;
  });

  const variantLabel = $derived(VARIANTS.find((v) => v.value === variant)!.label);
  const summaryLine = $derived(
    variant === "inversions"
      ? `${variantLabel} in ${FLAT_NAMES[pc(s.key)]}, ${s.strict ? "strict" : "notes collected"}`
      : `${variantLabel} from ${FLAT_NAMES[pc(s.key)]}, ${s.keys === 12 ? "all 12 keys" : `${s.keys} key${s.keys > 1 ? "s" : ""}`}, ${s.strict ? "strict" : "notes collected"}${monophonic ? ", arpeggio" : ""}`,
  );
  const setupKey = $derived(`voicings:${variant}:${pc(s.key)}:${variant === "inversions" ? 1 : s.keys}:${s.strict ? "strict" : "collected"}:${monophonic ? "arp" : "chord"}:${s.position}`);
  const skills = $derived([...new Set(items.flatMap((i) => i.skillIds))]);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = `Listen: ${group.map((g) => g.symbol).join(", ")}, lit as each chord sounds.`;
    await transport.demo(demoNotes, 80);
  }

  function prompt() {
    collected = [];
    peak = [];
    collectedMode = !s.strict || monophonic;
    promptAt = performance.now();
    if (current) status = `Play ${current.symbol}.`;
  }

  function onEvent(e: NoteEvent) {
    if (phase !== "running" || !current || advance) return;
    if (e.kind === "noteoff") {
      held.delete(e.midi);
      if (!collectedMode && held.size === 0 && peak.length >= 2) grade(peak);
      return;
    }
    held.add(e.midi);
    collected = [...collected, e.midi];
    // On-screen keys play one note at a time: those notes are collected, never "held together".
    if (e.source !== "midi") collectedMode = true;
    if (held.size > peak.length) peak = [...held];
    const item = current;
    if (monophonic) {
      if (new Set(collected).size >= item.count) grade(collected);
      return;
    }
    const pool = collectedMode ? collected : [...held];
    if (item.pcs.every((p) => pool.some((m) => pc(m) === p))) {
      clearTimeout(settle);
      // Let the rest of a struck chord arrive before judging it.
      settle = setTimeout(() => grade(collectedMode ? collected : [...held]), collectedMode ? 0 : 70);
    }
  }

  function grade(played: number[]) {
    const item = current;
    if (!item || advance) return;
    clearTimeout(settle);
    const g = gradeItem(item, played, { strict: s.strict && !collectedMode, arpeggio: monophonic });
    grades[index] = g;
    if (mode === "practice") for (const m of new Set(played)) flashes.add(m, item.pcs.includes(pc(m)) ? "correct" : "wrong", 600);
    status = g.correct ? `${item.symbol}: right.` : `${item.symbol}: ${g.note}.`;
    void run!.attempt({
      promptId: item.id,
      correct: g.correct,
      partialCredit: g.score,
      metrics: g.metrics,
      source: runSource(cap?.notes ?? []),
      instrument: runInstrument(cap?.notes ?? []) ?? null,
      skillIds: item.skillIds,
      target: item.show.map((n) => n.midi),
      response: [...played],
      latencyMs: Math.round(performance.now() - promptAt),
    });
    advance = setTimeout(() => {
      advance = undefined;
      held.clear();
      if (index + 1 >= items.length) void finish();
      else {
        index += 1;
        prompt();
      }
    }, 450);
  }

  function skip() {
    grade(collectedMode ? collected : peak);
  }

  function start(_ctx: RunContext) {
    transport.stop();
    summary = null;
    index = 0;
    grades = items.map(() => null);
    held.clear();
    flashes.clear();
    run = practice.beginRun({
      exerciseId: "voicing-drill",
      setupKey,
      skillIds: skills,
      capabilities: ["harmony"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: variant === "altered" ? 0.75 : variant === "minor" ? 0.65 : variant === "inversions" ? 0.35 : variant === "cadence" ? 0.45 : variant === "cadence-minor" ? 0.5 : 0.55,
      instrument: settings.value.activeInstrument,
      params: { variant, key: pc(s.key), keys: s.keys, strict: s.strict, arpeggio: monophonic },
    });
    cap = capture(performance.now(), (e) => (e.kind === "noteon" || e.kind === "noteoff") && onEvent(e));
    prompt();
  }

  async function finish() {
    if (phase !== "running") return;
    cap?.stop();
    const done = grades.filter((g): g is ItemGrade => !!g);
    const score = items.length ? done.reduce((a, g) => a + g.score, 0) / items.length : 0;
    const right = done.filter((g) => g.correct).length;
    const correct = right === items.length && items.length > 0;
    phase = "results";
    const fin = await run!.finish({ score, correct, headline: `${right} of ${items.length} chords right` });
    const worst = items.find((_, i) => !grades[i]?.correct);
    const notes = cap?.notes ?? [];
    const onScreen = notes.some((n) => n.source !== "midi");
    summary = {
      headline: correct
        ? mode === "check"
          ? `All ${items.length} chords right from memory.`
          : `All ${items.length} chords right. Try it in Check to count it.`
        : worst
          ? `${right} of ${items.length} right. ${worst.symbol} needs another look: ${grades[items.indexOf(worst)]?.note ?? "skipped"}.`
          : `${right} of ${items.length} right.`,
      metric: `${right}/${items.length}`,
      metricLabel: "chords right",
      delta: fin.delta,
      best: fin.best,
      clean: correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Score", value: score, text: pct(score) },
        { label: "Right notes", value: done.length ? done.filter((g) => g.missing.length === 0).length / items.length : 0, text: `${done.filter((g) => g.missing.length === 0).length} of ${items.length} chords` },
        monophonic
          ? { label: "Held together (arpeggio mode)", notMeasured: true }
          : onScreen || !s.strict
            ? { label: onScreen ? "Held together (on-screen keys)" : "Held together (notes collected)", notMeasured: true }
            : { label: "Held together", text: "Strict: graded on the held chord" },
      ],
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(settle);
    clearTimeout(advance);
    advance = undefined;
    cap?.stop();
    phase = "ready";
    index = 0;
    status = "Stopped. The chords you finished are recorded; the rest were not.";
  }

  onDestroy(() => {
    clearTimeout(settle);
    clearTimeout(advance);
    cap?.stop();
    transport.stop();
  });

  const nameOf = (m: number) => noteName(m, "flat", false);
</script>

<svelte:head><title>Voicings | Woodshed</title></svelte:head>

<DrillShell
  title="ii-V-I voicings"
  hue="piano"
  blurb="Rootless jazz voicings through the keys, closest-chord inversions, cadences in every key, and guide-tone voice leading. Untimed: take the time to find each chord."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={items.length ? index / items.length : 0}
  ondemo={playDemo}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Choice label="Variant" select options={VARIANTS} value={variant} onchange={(v) => cfg.set({ variant: v })} />
      <Choice label="Start key" select options={KEY_CYCLE.map((k) => ({ value: pcOf(k) ?? 0, label: k }))} value={pc(s.key)} onchange={(v) => cfg.set({ key: v })} />
      {#if variant !== "inversions"}
        <Choice
          label="Keys"
          options={[
            { value: 1, label: "One" },
            { value: 3, label: "Three" },
            { value: 12, label: "All 12" },
          ]}
          value={s.keys}
          onchange={(v) => cfg.set({ keys: v })}
        />
      {/if}
      <Choice
        label="Chord mode"
        options={[
          { value: "strict", label: "Strict, held" },
          { value: "collected", label: "Notes collected" },
        ]}
        value={s.strict ? "strict" : "collected"}
        onchange={(v) => cfg.set({ strict: v === "strict" })}
      />
      {#if variant === "major"}
        <Choice
          label="First position"
          options={[
            { value: "A", label: "A (3 5 7 9)" },
            { value: "B", label: "B (7 9 3 5)" },
          ]}
          value={s.position}
          onchange={(v) => cfg.set({ position: v })}
        />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      Strict grades the chord you hold, with no extra notes. Notes collected tolerates extras and doesn't need the notes held together.
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label="Chord" value="{index + 1} of {items.length}" />
      <Stat label="Right so far" value={grades.filter((g) => g?.correct).length} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <ol class="mb-3 flex flex-wrap gap-2" aria-label="Chord chart">
      {#each group as it (it.id)}
        {@const i = items.indexOf(it)}
        {@const g = grades[i]}
        {@const now = transport.playing ? demoIndex === group.indexOf(it) : phase === "running" && i === index}
        <li
          class="chart-cell flex min-h-14 min-w-24 flex-col justify-center rounded-lg border px-3 py-1.5 {now ? 'border-instr bg-instr/20' : 'border-ws-stage-ink/15'}"
          aria-current={now ? "step" : undefined}
        >
          <span class="font-display text-xl font-semibold">{it.symbol}</span>
          <span class="text-xs text-ws-stage-soft">
            {#if g}{g.correct ? "✓ right" : `✕ ${g.note}`}{:else if now}now{:else}&nbsp;{/if}
          </span>
        </li>
      {/each}
      {#if items.length > group.length}<li class="self-center text-sm text-ws-stage-soft">{group[0]?.group} of {new Set(items.map((i) => i.group)).size} keys</li>{/if}
    </ol>
    {#if current && mode === "practice"}
      <div class="mb-3 text-sm">
        <p class="font-medium">{current.name}</p>
        {#if current.hint}<p class="text-ws-stage-soft">{current.hint}</p>{/if}
        {#if current.guide}<p class="text-ws-stage-soft">From {current.guide.fromMidi.map(nameOf).join(" and ")}: find the nearest {current.symbol} 3rd and 7th.</p>{/if}
      </div>
    {:else if current && mode === "check"}
      <p class="mb-3 text-sm text-ws-stage-soft">
        Check mode: the voicing and the hints are hidden. {current.guide ? `From ${current.guide.fromMidi.map(nameOf).join(" and ")}, find the ${current.symbol} guide tones.` : `Play ${current.symbol}, root in the left hand.`}
      </p>
    {/if}
    <Piano low={span.low} high={span.high} {marks} {flashes} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand root marked L, right hand notes R." />
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ws-stage-soft">
      <p class="min-w-0 max-w-prose">
        {#if monophonic}
          Arpeggio mode: {settings.value.activeInstrument === "aerophone" ? "the Aerophone" : "your voice"} plays one note at a time, so each voicing is graded as an arpeggio. Play the root first, then the other tones in any order.
        {:else if phase === "running" && collectedMode}
          Notes collected: {collected.length ? collected.map(nameOf).join(" ") : "nothing yet"}. Held together is not measured{s.strict ? " for on-screen keys" : ""}.
        {:else}
          Keys show L for the left-hand root and R for the right hand. Voicings carry no authored fingering.
        {/if}
      </p>
      {#if phase === "running"}<button type="button" class={btnStage} onclick={skip}>Grade what I played</button>{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if variant === "inversions"}
            <button type="button" class={btn} onclick={() => { cfg.set({ key: s.key === 0 ? 7 : 0 }); phase = "ready"; }}>Same in {s.key === 0 ? "G" : "C"}</button>
          {/if}
        {/snippet}
      </Results>
      <ol class="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Chord by chord">
        {#each items as it, i (it.id)}
          {@const g = grades[i]}
          <li class="flex items-baseline justify-between gap-3 rounded-lg border border-ws-line bg-ws-surface px-3 py-2 text-sm">
            <span class="font-semibold">{it.group !== it.symbol && variant !== "inversions" ? `${it.symbol} in ${it.group}` : it.symbol}</span>
            <span class={g?.correct ? "text-success" : "text-ws-soft"}>
              {g ? (g.correct ? "✓ right" : `✕ ${g.note}${g.missing.length ? `, missing ${g.missing.map((p) => FLAT_NAMES[p]).join(" ")}` : ""}`) : "not played"}
            </span>
          </li>
        {/each}
      </ol>
    {/if}
  {/snippet}
</DrillShell>
