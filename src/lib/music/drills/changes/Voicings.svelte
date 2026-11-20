<script lang="ts">
  import { CHANGES_TITLE, changesTrainer, shortStage } from "./modes";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { FLAT_NAMES, noteName, pc, pcOf } from "@repo/music-core";
  import { GOSPEL_PROGRESSIONS, KEY_CYCLE } from "@repo/music-core/content/piano";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { jazzVoicingLesson } from "@repo/music-core/lessons/tier1";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Piano from "#lib/music/components/Piano.svelte";
  import StaffFold from "#lib/music/notation/StaffFold.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import type { SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btn } from "#lib/music/components/ui.ts";
  import { Transport, toWritten, benchFromUrl, sounding, spanOf, type TimedNote } from "#lib/music/drills/piano/transport.svelte.ts";
  import { gradeItem, isJazzType, voicingItems, type ItemGrade, type Variant, type VoicingItem } from "#lib/music/drills/piano/voicings.ts";
  import { JAZZ_VOICING_TYPES, UPPER_TUNES } from "@repo/music-core/content/jazz-voicings";
  import { TUNES } from "@repo/music-core/content/tunes";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { m } from "@repo/i18n/messages.js";

  const VARIANTS: { value: Variant; label: string; tab: string }[] = [
    { value: "major", label: m.music_drills_voicings_v_major(), tab: m.music_drills_voicings_v_major() },
    { value: "minor", label: m.music_drills_voicings_v_minor(), tab: m.music_drills_voicings_v_minor() },
    { value: "altered", label: m.music_drills_voicings_v_altered(), tab: m.music_drills_voicings_tab_altered() },
    { value: "inversions", label: m.music_drills_voicings_v_inversions(), tab: m.music_drills_voicings_tab_inversions() },
    { value: "voice-leading", label: m.music_drills_voicings_v_voice_leading(), tab: m.music_drills_voicings_tab_voice_leading() },
    { value: "cadence", label: m.music_drills_voicings_v_cadence(), tab: m.music_drills_voicings_tab_cadence() },
    { value: "cadence-minor", label: m.music_drills_voicings_v_cadence_minor(), tab: m.music_drills_voicings_tab_cadence_minor() },
    { value: "gospel", label: m.music_drills_voicings_v_gospel(), tab: m.music_drills_voicings_tab_gospel() },
  ];
  const KEY_STEPS = [
    { value: 1, label: m.music_drills_voicings_step_one() },
    { value: 3, label: m.music_drills_voicings_step_three() },
    { value: 12, label: m.music_drills_voicings_step_all() },
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
  const tight = $derived(spanOf(items.flatMap((i) => i.show.map((n) => n.midi)), 0, false));

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

  /** Beside Stop on a phone: the chord to find now. */
  const cue = $derived(phase === "running" && current ? (mode === "practice" ? m.music_drills_voicings_cue : m.music_drills_voicings_cue_hidden)({ n: index + 1, total: items.length, symbol: current.symbol }) : "");
  const variantLabel = $derived(jazzType?.label ?? VARIANTS.find((v) => v.value === variant)!.label);
  const keyName = (p: number) => KEY_CYCLE.find((k) => pcOf(k) === pc(p)) ?? FLAT_NAMES[pc(p)];
  /** What the key picker names for a jazz type: a major key, a dorian tonic or a blues. */
  const keyWord = $derived(jazzType?.key === "dorian" ? (variant === "sus" ? m.music_drills_voicings_kw_set_from() : m.music_drills_voicings_kw_dorian_on()) : jazzType?.key === "blues" ? m.music_drills_voicings_kw_blues_in() : variant === "inversions" ? m.music_drills_voicings_kw_key() : m.music_drills_voicings_kw_start_key());
  const summaryLine = $derived<SetupClause[]>([
    onTune
      ? { text: m.music_drills_voicings_summary_tune({ label: variantLabel, tune: tune.name }), focus: "tune" }
      : {
          text: (variant === "inversions" ? m.music_drills_voicings_summary_in : jazzType?.key === "dorian" && variant !== "sus" ? m.music_drills_voicings_summary_from_dorian : m.music_drills_voicings_summary_from)({ label: variant === "gospel" ? gospel.label : variantLabel, key: keyName(s.key) }),
          focus: variant === "gospel" ? "progression" : "key",
        },
    ...(oneKey ? [] : [{ text: s.keys === 12 ? m.music_drills_voicings_summary_all_keys() : m.music_drills_voicings_summary_keys({ count: s.keys }), focus: "keys" }]),
    ...(variant === "major" ? [{ text: m.music_drills_voicings_summary_position({ position: s.position }), focus: "position" }] : []),
    ...(monophonic ? [{ text: m.music_drills_voicings_summary_arpeggios() }] : []),
  ]);
  const setupKey = $derived(`voicings:${variant}:${pc(s.key)}:${oneKey ? 1 : s.keys}:${monophonic ? "arp" : "chord"}:${s.position}${variant === "gospel" ? `:${gospel.id}` : ""}${onTune ? `:${tune.id}` : ""}`);
  // The staff in the current key's signature (minor variants in the minor key's).
  const keyFifths = $derived(group[0] ? signatureFor(group[0].keyPc, group[0].minor ? "natural-minor" : "major") : 0);
  const skills = $derived([...new Set(items.flatMap((i) => i.skillIds))]);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = m.music_drills_voicings_demo({ chords: group.map((g) => g.symbol).join(", ") });
    await transport.demo(demoNotes, 80);
  }

  function prompt() {
    collected = [];
    peak = [];
    // Held and strict on MIDI; on-screen keys and one-note instruments collect the notes instead.
    collectedMode = monophonic;
    promptAt = performance.now();
    if (current) status = m.music_drills_voicings_play({ symbol: current.symbol });
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
    status = g.correct ? m.music_drills_voicings_status_right({ symbol: item.symbol }) : m.music_drills_voicings_status_note({ symbol: item.symbol, note: g.note });
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
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const worst = items.find((_, i) => !grades[i]?.correct);
    const notes = cap?.notes ?? [];
    const onScreen = notes.some((n) => n.source !== "midi");
    summary = {
      headline: correct
        ? mode === "check"
          ? m.music_drills_voicings_h_all_check({ count: items.length })
          : m.music_drills_voicings_h_all({ count: items.length })
        : worst
          ? m.music_drills_voicings_h_worst({ right, total: items.length, symbol: worst.symbol, note: grades[items.indexOf(worst)]?.note ?? m.music_drills_voicings_skipped() })
          : m.music_drills_voicings_h_some({ right, total: items.length }),
      metric: `${right}/${items.length}`,
      metricLabel: m.music_drills_voicings_metric_label(),
      delta: fin.delta,
      best: fin.best,
      clean: correct && mode === "check",
      xp: fin.xp,
      mode,
      cleanMeans: m.music_drills_voicings_clean_means(),
      rows: [
        { label: m.music_drills_voicings_row_score(), value: score, text: pct(score) },
        { label: m.music_drills_voicings_row_right_notes(), value: done.length ? done.filter((g) => g.missing.length === 0).length / items.length : 0, text: m.music_drills_voicings_row_right_notes_text({ n: done.filter((g) => g.missing.length === 0).length, total: items.length }) },
        monophonic
          ? { label: m.music_drills_voicings_row_held_arp(), notMeasured: true }
          : onScreen
            ? { label: m.music_drills_voicings_row_held_screen(), notMeasured: true }
            : { label: m.music_drills_voicings_row_scoring(), text: m.music_drills_voicings_row_scoring_text() },
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
    status = m.music_drills_voicings_stopped();
  }

  onDestroy(() => {
    clearTimeout(settle);
    clearTimeout(advance);
    cap?.stop();
    transport.stop();
  });

  const nameOf = (n: number) => noteName(n, "flat", false);
  /** "A and B", "A and B and C", each pair joined by the locale's "and". */
  const andList = (xs: string[]) => (xs.length ? xs.reduce((a, b) => m.music_drills_voicings_and({ a, b })) : "");
</script>

<DrillShell
  lesson={lessonRef}
  title={CHANGES_TITLE}
  trainer={changesTrainer("voicings")}
  hue="piano"
  blurb={m.music_drills_voicings_blurb()}
  summary={summaryLine}
  tabs={[...VARIANTS.map((v) => ({ id: v.value as string, label: v.tab })), { id: "jazz", label: m.music_drills_voicings_tab_jazz() }]}
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
  {cue}
>
  {#snippet setup()}
    {#if jazzType}
      <div class="mb-4">
        <Choice
          label={m.music_drills_voicings_choice_voicing()}
          setupKey="jazz"
          options={[...JAZZ_VOICING_TYPES.filter((t) => t.key !== "tune").map((t) => ({ value: t.id as string, label: t.label })), { value: "tune", label: m.music_drills_voicings_on_tunes_changes() }]}
          value={onTune ? "tune" : jazzType.id}
          onchange={(v) => {
            const id = v === "tune" ? (TUNE_TYPES.find((t) => t.id === s.jazz)?.id ?? "upper") : v;
            cfg.set({ variant: id, jazz: id });
          }}
        />
        {#if onTune}
          <div class="mt-2"><Choice label={m.music_drills_voicings_choice_on_tune()} setupKey="tune-voicing" options={TUNE_TYPES.map((t) => ({ value: t.id as string, label: t.label }))} value={jazzType.id} onchange={(v) => cfg.set({ variant: v, jazz: v })} /></div>
        {/if}
        <p class="mt-2 max-w-prose text-sm text-ws-soft">{jazzType.about}</p>
      </div>
    {/if}
    <div class="grid gap-4 sm:grid-cols-3">
      {#if onTune}
        <Choice label={m.music_drills_voicings_choice_tune()} setupKey="tune" options={tuneList.map((t) => ({ value: t.id, label: t.name }))} value={tune.id} onchange={(v) => cfg.set({ tune: v })} />
      {:else}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
          <span class="font-medium">{keyWord}</span>
          <KeyPicker label={keyWord} value={pc(s.key)} name={keyName} onchange={(p) => cfg.set({ key: p })} />
        </div>
      {/if}
      {#if !oneKey}
        <Choice
          label={m.music_drills_voicings_choice_keys()}
          setupKey="keys"
          options={[
            { value: 1, label: m.music_drills_voicings_keys_one() },
            { value: 3, label: m.music_drills_voicings_keys_three() },
            { value: 12, label: m.music_drills_voicings_keys_all() },
          ]}
          value={s.keys}
          onchange={(v) => cfg.set({ keys: v })}
        />
      {/if}
      {#if variant === "gospel"}
        <Choice label={m.music_drills_voicings_choice_progression()} setupKey="progression" options={GOSPEL_PROGRESSIONS.map((p) => ({ value: p.id, label: p.label, hint: p.about }))} value={gospel.id} onchange={(v) => cfg.set({ progression: v })} />
      {/if}
      {#if variant === "major"}
        <Choice
          label={m.music_drills_voicings_choice_position()}
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
    <p class="mt-3 text-sm text-ws-soft">{m.music_drills_voicings_setup_note()}</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label={m.music_drills_voicings_stat_chord()} value={m.music_drills_voicings_n_of({ n: index + 1, total: items.length })} />
      <Stat label={m.music_drills_voicings_stat_right()} value={grades.filter((g) => g?.correct).length} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if mode === "practice" || transport.playing || phase === "results"}
      <StaffFold live={phase === "running"} aside={head}><LineNotation maxZoom={shortStage.current ? 1 : 1.1} notes={toWritten(demoNotes).map((n) => (monophonic ? n : { ...n, durationBeats: 2 }))} title={`voicings-${group[0]?.group}`} {keyFifths} cursorBeat={transport.beat ?? (phase === "running" && current ? group.indexOf(current) * 2 : null)} /></StaffFold>
    {:else}
      <div class="mb-3 flex">{@render head()}</div>
    {/if}
    <div class="flex flex-col" data-dock="instrument">
      <Piano low={span.low} high={span.high} fit={tight} {marks} {flashes} fill={phase === "running"} label={m.music_drills_voicings_piano_label({ low: noteName(span.low), high: noteName(span.high) })} />
    </div>
    <!-- One row under the keys: what the marks mean, then the note about how the chord is heard. -->
    <div class="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm text-ws-stage-soft">
      {#if mode === "practice" && phase !== "results"}
        <!-- What the marks on the keys mean, each with its own shape so colour is never the only cue. -->
        <ul class="flex flex-wrap gap-x-4 gap-y-1" aria-label={m.music_drills_voicings_key_marks()}>
          <li class="flex items-center gap-1.5"><span class="key-mark target" aria-hidden="true">R</span>{m.music_drills_voicings_mark_play()}</li>
          <li class="flex items-center gap-1.5"><span class="key-mark right" aria-hidden="true">✓</span>{m.music_drills_voicings_mark_right()}</li>
          <li class="flex items-center gap-1.5"><span class="key-mark wrong" aria-hidden="true">✕</span>{m.music_drills_voicings_mark_wrong()}</li>
        </ul>
      {/if}
      <p class="min-w-0 max-w-prose flex-[1_1_18rem]">
        {#if monophonic}
          {settings.value.activeInstrument === "aerophone" ? m.music_drills_voicings_arp_aerophone() : m.music_drills_voicings_arp_voice()}
        {:else if phase === "running" && collectedMode}
          {m.music_drills_voicings_collected({ notes: collected.length ? collected.map(nameOf).join(" ") : m.music_drills_voicings_nothing_yet() })}
        {:else if mode === "check" && phase === "running"}
          {m.music_drills_voicings_hidden_check()}
        {:else}
          {jazzType ? m.music_drills_voicings_keys_show_jazz() : m.music_drills_voicings_keys_show()}
        {/if}
      </p>
      {#if phase === "running"}
        <!-- The chord grades itself once all its notes are held; this is the way on when it will not. -->
        <span class="flex flex-wrap items-center gap-x-2">
          <span>{m.music_drills_voicings_stuck()}</span>
          <button type="button" class="min-h-11 rounded-full px-2 font-medium text-ws-stage-ink underline underline-offset-4 hover:bg-ws-stage-ink/10" onclick={skip}>{m.music_drills_voicings_score_played()}</button>
        </span>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} {figure}>
        {#snippet actions()}
          {#if variant === "inversions"}
            <button type="button" class={btn} onclick={() => { cfg.set({ key: s.key === 0 ? 7 : 0 }); phase = "ready"; }}>{m.music_drills_voicings_same_in({ key: s.key === 0 ? "G" : "C" })}</button>
          {/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>

{#snippet head()}
  <!-- The chart and what to play on it share one row (and the staff's fold), so the staff and the keys keep the height. -->
  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
    <ol class="flex flex-wrap gap-2" aria-label={m.music_drills_voicings_chord_chart()}>
      {#each group as it (it.id)}
        {@const i = items.indexOf(it)}
        {@const g = grades[i]}
        {@const now = transport.playing ? demoIndex === group.indexOf(it) : phase === "running" && i === index}
        <li
          class="chart-cell flex min-h-14 min-w-24 flex-col justify-center rounded-lg border px-3 py-1.5 {now ? 'border-instr bg-instr/20' : 'border-ws-stage-ink/15'}"
          aria-current={now ? "step" : undefined}
        >
          <span class="font-display text-xl font-semibold">{it.symbol}</span>
          <span class="text-sm text-ws-stage-soft">
            {#if g}{g.correct ? m.music_drills_voicings_cell_right() : `✕ ${g.note}`}{:else if now}{m.music_drills_voicings_cell_now()}{:else}&nbsp;{/if}
          </span>
        </li>
      {/each}
      {#if items.length > group.length}<li class="self-center text-sm text-ws-stage-soft">{m.music_drills_voicings_group_of({ group: group[0]?.group ?? "", count: new Set(items.map((i) => i.group)).size })}</li>{/if}
    </ol>
    {#if current && mode === "practice"}
      <!-- While the demo plays, the words follow the chord that is sounding, not the one the run would start on. -->
      {@const told = (transport.playing && demoIndex !== null ? group[demoIndex] : undefined) ?? current}
      <div class="min-w-0 flex-[1_1_16rem] text-sm">
        <p class="font-medium">{told.name}</p>
        {#if told.hint}<p class="text-ws-stage-soft">{told.hint}</p>{/if}
        {#if told.guide}<p class="text-ws-stage-soft">{m.music_drills_voicings_guide_hint({ notes: andList(told.guide.fromMidi.map(nameOf)), symbol: told.symbol })}</p>{/if}
      </div>
    {:else if current && mode === "check"}
      <p class="min-w-0 flex-[1_1_16rem] text-sm text-ws-stage-soft">
        {m.music_drills_voicings_check_hidden()} {current.ask ?? (current.guide ? m.music_drills_voicings_check_guide({ notes: andList(current.guide.fromMidi.map(nameOf)), symbol: current.symbol }) : m.music_drills_voicings_check_play({ symbol: current.symbol }))}
      </p>
    {/if}
  </div>
{/snippet}

<!-- One list of the run, chord by chord, under the breakdown. -->
{#snippet figure()}
  <!-- Nothing heard: no per-chord verdicts, so silence never reads as a row of wrong chords. -->
  {#if summary && summary.heard !== false}
  <ol class="grid gap-2 sm:grid-cols-2" aria-label={m.music_drills_voicings_chord_by_chord()}>
    {#each items as it, i (it.id)}
      {@const g = grades[i]}
      <li class="flex flex-col gap-2 rounded-lg border border-ws-line bg-ws-surface px-3 py-2 text-sm">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-semibold">{it.group !== it.symbol && variant !== "inversions" ? m.music_drills_voicings_symbol_in({ symbol: it.symbol, group: it.group }) : it.symbol}</span>
          <span class={g?.correct ? "text-success" : "text-ws-soft"}>
            {g ? (g.correct ? m.music_drills_voicings_cell_right() : g.missing.length ? m.music_drills_voicings_cell_missed({ notes: g.missing.map((p) => FLAT_NAMES[p]).join(" ") }) : `✕ ${g.note}`) : m.music_drills_voicings_not_played()}
          </span>
        </div>
        <!-- Each played chord drawn as it should sit: ✓ on the notes you had, the missed ones named in a red ring. -->
        {#if g}
          {@const ms = it.show.map((n) => n.midi)}
          <Piano
            low={Math.min(...ms) - 2}
            high={Math.max(...ms) + 2}
            fit={{ low: Math.min(...ms), high: Math.max(...ms) }}
            missing={it.show.filter((n) => g.missing.includes(pc(n.midi))).map((n) => n.midi)}
            marks={Object.fromEntries(it.show.filter((n) => !g.missing.includes(pc(n.midi))).map((n) => [n.midi, { target: true, label: "✓" }]))}
            interactive={false}
            names="none"
            minKey={18}
            compact
            label={g.correct ? m.music_drills_voicings_label_right({ symbol: it.symbol }) : g.missing.length ? m.music_drills_voicings_label_missing({ symbol: it.symbol, notes: g.missing.map((p) => FLAT_NAMES[p]).join(", ") }) : m.music_drills_voicings_label_wants({ symbol: it.symbol })}
          />
        {/if}
      </li>
    {/each}
  </ol>
  {/if}
{/snippet}

<style>
  .key-mark {
    display: grid;
    place-items: center;
    min-width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 800;
  }
  .key-mark.target {
    color: #17120c;
    background: var(--hand-right);
  }
  .key-mark.right {
    color: white;
    background: var(--success);
  }
  .key-mark.wrong {
    color: var(--on-destructive, white);
    background: var(--destructive);
  }
</style>
