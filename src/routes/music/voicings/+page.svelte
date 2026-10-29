<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { FLAT_NAMES, noteName, pc, pcOf } from "@repo/music-core";
  import { GOSPEL_PROGRESSIONS, KEY_CYCLE } from "@repo/music-core/content/piano";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { jazzVoicingLesson } from "@repo/music-core/lessons/tier1";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { Transport, toWritten, benchFromUrl, sounding, spanOf, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { gradeItem, isJazzType, voicingItems, type ItemGrade, type Variant, type VoicingItem } from "$lib/music/drills/piano/voicings";
  import { JAZZ_VOICING_TYPES, UPPER_TUNES } from "@repo/music-core/content/jazz-voicings";
  import { TUNES } from "@repo/music-core/content/tunes";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun } from "$lib/music/advance.svelte";

  const VARIANTS: { value: Variant; label: string; tab: string }[] = [
    { value: "major", label: "Major ii-V-I", tab: "Major ii-V-I" },
    { value: "minor", label: "Minor ii-V-i", tab: "Minor ii-V-i" },
    { value: "altered", label: "Altered dominants", tab: "Altered" },
    { value: "inversions", label: "Closest chords, I IV V I", tab: "Closest chords" },
    { value: "voice-leading", label: "Guide tones through the keys", tab: "Guide tones" },
    { value: "cadence", label: "Cadences I IV I V7 I", tab: "Cadences" },
    { value: "cadence-minor", label: "Minor cadences i iv i V7 i", tab: "Minor cadences" },
    { value: "gospel", label: "Gospel and ballad chords", tab: "Gospel" },
  ];
  const KEY_STEPS = [
    { value: 1, label: "One key" },
    { value: 3, label: "Three keys" },
    { value: 12, label: "All 12 keys" },
  ];

  let mode = $state<DrillMode>(benchFromUrl({ min: 40, max: 200 }));
  const cfg = new DrillSetup("voicings", {
    variant: "major" as string,
    key: 0,
    keys: 3,
    position: "A" as string,
    /** Gospel: which progression. */
    progression: GOSPEL_PROGRESSIONS[0].id as string,
    /** The jazz voicing type the Jazz types tab opens on (`variant=jazz` opens it too). */
    jazz: "so-what" as string,
    /** Upper structures: the tune whose dominants are voiced. */
    tune: UPPER_TUNES[0].id as string,
  });
  const s = $derived(cfg.value);
  const lastJazz = $derived(isJazzType(s.jazz) ? s.jazz : "so-what");
  const variant = $derived((s.variant === "jazz" ? lastJazz : VARIANTS.some((v) => v.value === s.variant) || isJazzType(s.variant) ? s.variant : "major") as Variant);
  const jazzType = $derived(JAZZ_VOICING_TYPES.find((t) => t.id === variant));
  const onTune = $derived(jazzType?.key === "tune");
  // The jazz types tab keeps its lesson on open; every other tab gets a card on the first Check.
  const CARDS: Partial<Record<string, string>> = { major: "voicings.rootless", minor: "voicings.minor", altered: "voicings.altered", inversions: "voicings.inversions", "voice-leading": "voicings.guide-tones", cadence: "voicings.cadence", "cadence-minor": "voicings.cadence-minor" };
  /** Upper structures need a dominant; quartal and slash voicings run on any tune. */
  const tuneList = $derived(variant === "upper" ? UPPER_TUNES : TUNES);
  const tune = $derived(tuneList.find((t) => t.id === s.tune) ?? tuneList[0]);
  /** The voicing picker: the key-based types, then one entry for the types on a tune (a second row picks which). */
  const TUNE_TYPES = JAZZ_VOICING_TYPES.filter((t) => t.key === "tune");
  /** One key only: the closest chords, and a tune's own changes. */
  const oneKey = $derived(variant === "inversions" || onTune);
  const gospel = $derived(GOSPEL_PROGRESSIONS.find((p) => p.id === s.progression) ?? GOSPEL_PROGRESSIONS[0]);
  const monophonic = $derived(settings.value.activeInstrument === "aerophone" || settings.value.activeInstrument === "voice");
  const cardId = $derived(variant === "gospel" ? `voicings.gospel.${gospel.id}` : CARDS[variant]);
  const lessonRef = $derived(jazzType ? { lessons: jazzVoicingLesson(jazzType.id) } : cardId ? { lessons: conceptCard(cardId, { arpeggio: monophonic }), trigger: "check" as const } : null);
  const items = $derived(
    voicingItems({ variant, keyPc: pc(s.key), keys: oneKey ? 1 : s.keys, startPosition: s.position === "B" ? "B" : "A", arpeggio: monophonic, progression: gospel.id, tune: tune.id }),
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

  const variantLabel = $derived(jazzType?.label ?? VARIANTS.find((v) => v.value === variant)!.label);
  const keyName = (p: number) => KEY_CYCLE.find((k) => pcOf(k) === pc(p)) ?? FLAT_NAMES[pc(p)];
  /** What the key picker names for a jazz type: a major key, a dorian tonic or a blues. */
  const keyWord = $derived(jazzType?.key === "dorian" ? (variant === "sus" ? "Set from" : "Dorian on") : jazzType?.key === "blues" ? "Blues in" : variant === "inversions" ? "Key" : "Start key");
  const summaryLine = $derived<SetupClause[]>([
    onTune
      ? { text: `${variantLabel}: ${tune.name}`, focus: "tune" }
      : { text: `${variant === "gospel" ? gospel.label : variantLabel} ${variant === "inversions" ? "in" : "from"} ${keyName(s.key)}${jazzType?.key === "dorian" && variant !== "sus" ? " dorian" : ""}`, focus: variant === "gospel" ? "progression" : "key" },
    ...(oneKey ? [] : [{ text: s.keys === 12 ? "all 12 keys" : `${s.keys} key${s.keys > 1 ? "s" : ""}`, focus: "keys" }]),
    ...(variant === "major" ? [{ text: `starting in position ${s.position}`, focus: "position" }] : []),
    ...(monophonic ? [{ text: "as arpeggios" }] : []),
  ]);
  const setupKey = $derived(`voicings:${variant}:${pc(s.key)}:${oneKey ? 1 : s.keys}:${monophonic ? "arp" : "chord"}:${s.position}${variant === "gospel" ? `:${gospel.id}` : ""}${onTune ? `:${tune.id}` : ""}`);
  // The staff in the current key's signature (minor variants in the minor key's).
  const keyFifths = $derived(group[0] ? signatureFor(group[0].keyPc, group[0].minor ? "natural-minor" : "major") : 0);
  const skills = $derived([...new Set(items.flatMap((i) => i.skillIds))]);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = `Listen: ${group.map((g) => g.symbol).join(", ")}, lit as each chord sounds.`;
    await transport.demo(demoNotes, 80);
  }

  function prompt() {
    collected = [];
    peak = [];
    // Held and strict on MIDI; on-screen keys and one-note instruments collect the notes instead.
    collectedMode = monophonic;
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
    const g = gradeItem(item, played, { strict: !collectedMode, arpeggio: monophonic });
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
      difficulty: variant === "altered" ? 0.75 : variant === "minor" ? 0.65 : variant === "inversions" ? 0.35 : variant === "cadence" ? 0.45 : variant === "cadence-minor" ? 0.5 : variant === "gospel" ? 0.5 : variant === "sevenths" ? 0.4 : jazzType ? 0.7 : 0.55,
      instrument: settings.value.activeInstrument,
      params: { variant, key: pc(s.key), keys: oneKey ? 1 : s.keys, arpeggio: monophonic, ...(variant === "gospel" ? { progression: gospel.id } : {}), ...(onTune ? { tune: tune.id } : {}) },
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
          : onScreen
            ? { label: "Held together (on-screen keys)", notMeasured: true }
            : { label: "Held together", text: "Strict: graded on the held chord" },
      ],
      // Untimed: the ladder is one key, three, then all 12. Inversions has one key only.
      advance:
        !oneKey && notes.some((n) => n.kind === "noteon")
          ? await nextRun(`voicings.${variant}.${pc(s.key)}.${monophonic ? "arp" : "chord"}.${s.position}`, { steps: KEY_STEPS, step: Math.max(0, KEY_STEPS.findIndex((k) => k.value === s.keys)) }, { score, correct }, ({ step }) => step !== undefined && cfg.set({ keys: KEY_STEPS[step].value }))
          : undefined,
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
  lesson={lessonRef}
  title="Voicings"
  hue="piano"
  blurb="Rootless jazz voicings through the keys, closest-chord inversions, cadences in every key, guide-tone voice leading, and jazz piano voicing types from So What chords to locked hands. Untimed: take the time to find each chord."
  summary={summaryLine}
  tabs={[...VARIANTS.map((v) => ({ id: v.value as string, label: v.tab })), { id: "jazz", label: "Jazz types" }]}
  tab={jazzType ? "jazz" : variant}
  ontab={(id) => cfg.set({ variant: id === "jazz" ? lastJazz : id })}
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
    {#if jazzType}
      <div class="mb-4">
        <Choice
          label="Voicing"
          setupKey="jazz"
          options={[...JAZZ_VOICING_TYPES.filter((t) => t.key !== "tune").map((t) => ({ value: t.id as string, label: t.label })), { value: "tune", label: "On a tune's changes" }]}
          value={onTune ? "tune" : jazzType.id}
          onchange={(v) => {
            const id = v === "tune" ? (TUNE_TYPES.find((t) => t.id === s.jazz)?.id ?? "upper") : v;
            cfg.set({ variant: id, jazz: id });
          }}
        />
        {#if onTune}
          <div class="mt-2"><Choice label="On the tune" setupKey="tune-voicing" options={TUNE_TYPES.map((t) => ({ value: t.id as string, label: t.label }))} value={jazzType.id} onchange={(v) => cfg.set({ variant: v, jazz: v })} /></div>
        {/if}
        <p class="mt-2 max-w-prose text-sm text-ws-soft">{jazzType.about}</p>
      </div>
    {/if}
    <div class="grid gap-4 sm:grid-cols-3">
      {#if onTune}
        <Choice label="Tune" setupKey="tune" options={tuneList.map((t) => ({ value: t.id, label: t.name }))} value={tune.id} onchange={(v) => cfg.set({ tune: v })} />
      {:else}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
          <span class="font-medium">{keyWord}</span>
          <KeyPicker label={keyWord} value={pc(s.key)} name={keyName} onchange={(p) => cfg.set({ key: p })} />
        </div>
      {/if}
      {#if !oneKey}
        <Choice
          label="Keys"
          setupKey="keys"
          options={[
            { value: 1, label: "One" },
            { value: 3, label: "Three" },
            { value: 12, label: "All 12" },
          ]}
          value={s.keys}
          onchange={(v) => cfg.set({ keys: v })}
        />
      {/if}
      {#if variant === "gospel"}
        <Choice label="Progression" setupKey="progression" options={GOSPEL_PROGRESSIONS.map((p) => ({ value: p.id, label: p.label, hint: p.about }))} value={gospel.id} onchange={(v) => cfg.set({ progression: v })} />
      {/if}
      {#if variant === "major"}
        <Choice
          label="First position"
          setupKey="position"
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
      Over MIDI each chord is graded as you hold it, with no extra notes. On-screen keys collect the notes one at a time; a one-note instrument plays each voicing as an arpeggio.
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
    {#if mode === "practice" || transport.playing || phase === "results"}
      <div class="mb-3"><LineNotation notes={toWritten(demoNotes).map((n) => (monophonic ? n : { ...n, durationBeats: 2 }))} title={`voicings-${group[0]?.group}`} {keyFifths} cursorBeat={transport.beat ?? (phase === "running" && current ? group.indexOf(current) * 2 : null)} /></div>
    {/if}
    {#if current && mode === "practice"}
      <div class="mb-3 text-sm">
        <p class="font-medium">{current.name}</p>
        {#if current.hint}<p class="text-ws-stage-soft">{current.hint}</p>{/if}
        {#if current.guide}<p class="text-ws-stage-soft">From {current.guide.fromMidi.map(nameOf).join(" and ")}: find the nearest {current.symbol} 3rd and 7th.</p>{/if}
      </div>
    {:else if current && mode === "check"}
      <p class="mb-3 text-sm text-ws-stage-soft">
        Check mode: the voicing and the hints are hidden. {current.ask ?? (current.guide ? `From ${current.guide.fromMidi.map(nameOf).join(" and ")}, find the ${current.symbol} guide tones.` : `Play ${current.symbol}, root in the left hand.`)}
      </p>
    {/if}
    <Piano low={span.low} high={span.high} {marks} {flashes} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand root marked L, right hand notes R." />
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ws-stage-soft">
      <p class="min-w-0 max-w-prose">
        {#if monophonic}
          Arpeggio mode: {settings.value.activeInstrument === "aerophone" ? "the Aerophone" : "your voice"} plays one note at a time, so each voicing is graded as an arpeggio. Play the root first, then the other tones in any order.
        {:else if phase === "running" && collectedMode}
          Notes collected: {collected.length ? collected.map(nameOf).join(" ") : "nothing yet"}. On-screen keys play one at a time, so held together is not measured.
        {:else}
          Keys show L for the {jazzType ? "left hand" : "left-hand root"} and R for the right hand. Voicings carry no authored fingering.
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
