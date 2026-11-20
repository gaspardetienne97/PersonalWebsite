<script lang="ts">
  // The reading setup, shared by flashcards and sight-reading. The instrument is
  // the practice strip's, and the range follows the level, the clefs and the
  // instrument, so neither is a control here.
  import { CLIMB, levelMeter, levelsFor, READING_LEVELS, READING_METERS, readingLevel, readingLevelId, readingRungs } from "@repo/music-core/content/reading";
  import { noteName } from "@repo/music-core";
  import Choice from "#lib/music/components/Choice.svelte";
  import type { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { m } from "@repo/i18n/messages.js";
  import { FOLLOWER_NAME, FRET_POSITIONS, keyLabel, type ReadingSetup } from "./reading";

  /** `oneLine`: one treble staff (fretted instruments and the Aerophone). `limits`: the written range the instrument reads. */
  let {
    cfg,
    activity,
    fretted,
    oneLine = fretted,
    instrument,
    limits,
  }: { cfg: DrillSetup<ReadingSetup>; activity: "flashcards" | "sight-reading"; fretted: boolean; oneLine?: boolean; instrument: string; limits: [number, number] } = $props();
  const s = $derived(cfg.value);
  // Tapping reads only the rhythm, so every level's rhythms are open to any instrument.
  const levels = $derived(activity === "sight-reading" && s.follower === "tap" && !s.climb ? READING_LEVELS : levelsFor(instrument));
  const level = $derived(readingLevel(readingLevelId(s.level)));
  const climbing = $derived(activity === "sight-reading" && !!s.climb);
  const rungs = $derived(readingRungs(instrument));
  // Every level and climb key pair is a rung; a key off the climb starts at the level's first.
  const rung = $derived(Math.max(0, rungs.findIndex((r) => r.level === level.id && r.key === s.key), rungs.findIndex((r) => r.level === level.id)));
  // Range by note: the naturals the instrument reads, and the level's own range first.
  const naturals = $derived(Array.from({ length: limits[1] - limits[0] + 1 }, (_, i) => limits[0] + i).filter((n) => !noteName(n).includes("#")));
  const rangeOptions = (label: string) => [{ value: 0, label }, ...naturals.map((n) => ({ value: n, label: noteName(n) }))];
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <Choice
    label={m.music_drills_reading_setup_level()}
    setupKey="level"
    options={levels.map((l) => ({ value: l.id, label: l.label, hint: m.music_drills_reading_setup_level_hint({ description: l.description, rhythm: l.rhythm }) }))}
    value={level.id}
    onchange={(v) => {
      const l = readingLevel(readingLevelId(v));
      cfg.set({
        level: v,
        clefs: oneLine ? "treble" : l.recommendedClefs.join(","),
        key: l.recommendedKeys.includes(s.key) ? s.key : l.recommendedKeys[0],
        meter: levelMeter(l.id, s.meter),
        measures: l.measures ?? s.measures,
      });
    }}
  />
  <Choice label={m.music_drills_reading_setup_key()} setupKey="key" options={level.recommendedKeys.map((k) => ({ value: k, label: keyLabel(k) }))} value={s.key} onchange={(v) => cfg.set({ key: v })} />
  {#if !oneLine && !climbing}
    <Choice
      label={m.music_drills_reading_setup_clefs()}
      setupKey="clefs"
      options={[
        { value: "treble", label: m.music_drills_reading_setup_clef_treble() },
        { value: "bass", label: m.music_drills_reading_setup_clef_bass() },
        { value: "treble,bass", label: m.music_drills_reading_setup_clef_both() },
        ...(activity === "flashcards" ? [{ value: "crossed", label: m.music_drills_reading_setup_clef_crossed(), hint: m.music_drills_reading_setup_clef_crossed_hint() }] : []),
      ]}
      value={s.clefs}
      onchange={(v) => cfg.set({ clefs: v })}
    />
  {/if}
  {#if activity === "flashcards"}
    <Choice
      label={m.music_drills_reading_setup_card()}
      setupKey="kind"
      options={[
        { value: "note", label: m.music_drills_reading_setup_card_note() },
        { value: "chord", label: m.music_drills_reading_setup_card_triad() },
        ...(oneLine ? [] : [{ value: "satb", label: m.music_drills_reading_setup_card_satb(), hint: m.music_drills_reading_setup_card_satb_hint() }]),
      ]}
      value={s.kind}
      onchange={(v) => cfg.set({ kind: v })}
    />
    {#if s.kind === "note"}
      <Choice
        label={m.music_drills_reading_setup_accidentals()}
        setupKey="accidentals"
        options={[
          { value: "off", label: m.music_drills_reading_off(), hint: m.music_drills_reading_setup_accidentals_off_hint() },
          { value: "on", label: m.music_drills_reading_on(), hint: m.music_drills_reading_setup_accidentals_on_hint() },
        ]}
        value={s.accidentals ? "on" : "off"}
        onchange={(v) => cfg.set({ accidentals: v === "on" })}
      />
    {/if}
    <Choice
      label={m.music_drills_reading_setup_answer()}
      setupKey="answer"
      options={[
        { value: "choice", label: m.music_drills_reading_setup_answer_name() },
        { value: "play", label: m.music_drills_reading_setup_answer_play() },
      ]}
      value={s.answer}
      onchange={(v) => cfg.set({ answer: v })}
    />
  {:else}
    <Choice
      label={m.music_drills_reading_setup_run()}
      setupKey="session"
      options={[
        { value: "one", label: m.music_drills_reading_setup_run_one() },
        { value: "climb", label: m.music_drills_reading_setup_run_climb() },
      ]}
      value={s.climb ? "climb" : "one"}
      onchange={(v) => {
        if (v === "one") return cfg.set({ climb: false });
        // The climb keeps time, four bars a phrase, from the rung the level and key are on.
        const r = rungs[rung];
        cfg.set({ climb: true, follower: "performance", measures: CLIMB.measures, level: r.level, key: r.key, clefs: oneLine ? "treble" : r.clefs.join(",") });
      }}
    />
    {#if !climbing}
      <Choice
        label={m.music_drills_reading_setup_pace()}
        setupKey="follower"
        options={[
          { value: "wait", label: FOLLOWER_NAME.wait, hint: m.music_drills_reading_setup_wait_hint() },
          { value: "performance", label: FOLLOWER_NAME.performance, hint: m.music_drills_reading_setup_perf_hint() },
          { value: "tap", label: FOLLOWER_NAME.tap, hint: m.music_drills_reading_setup_tap_hint() },
        ]}
        value={s.follower}
        onchange={(v) => cfg.set({ follower: v })}
      />
      {#if s.follower === "tap"}
        <Choice
          label={m.music_drills_reading_setup_kick()}
          setupKey="kick"
          options={[
            { value: "off", label: m.music_drills_reading_off() },
            { value: "on", label: m.music_drills_reading_setup_kick_on(), hint: m.music_drills_reading_setup_kick_hint() },
          ]}
          value={s.kick ? "on" : "off"}
          onchange={(v) => cfg.set({ kick: v === "on" })}
        />
      {/if}
    {/if}
    <Choice
      label={m.music_drills_reading_setup_meter()}
      setupKey="meter"
      options={level.meters.map((mt) => ({ value: mt, label: READING_METERS[mt].label }))}
      value={levelMeter(level.id, s.meter)}
      onchange={(v) => cfg.set({ meter: v })}
    />
    {#if !climbing}
      <Choice label={m.music_drills_reading_setup_bars()} setupKey="measures" options={[1, 2, 4, 8, 12, 16].map((n) => ({ value: n, label: String(n) }))} value={s.measures} onchange={(v) => cfg.set({ measures: v })} />
    {/if}
    <Choice
      label={m.music_drills_reading_setup_look_ahead()}
      setupKey="mask"
      options={[
        { value: 0, label: m.music_drills_reading_off() },
        { value: 2, label: m.music_drills_reading_setup_beats({ count: 2 }), hint: m.music_drills_reading_setup_mask2_hint() },
        { value: 4, label: m.music_drills_reading_setup_beats({ count: 4 }), hint: m.music_drills_reading_setup_mask4_hint() },
      ]}
      value={s.mask}
      onchange={(v) => cfg.set({ mask: v })}
    />
    <Choice
      label={m.music_drills_reading_setup_look_first()}
      setupKey="look"
      options={[
        { value: 0, label: m.music_drills_reading_off() },
        { value: 30, label: m.music_drills_reading_setup_30s(), hint: m.music_drills_reading_setup_30s_hint() },
      ]}
      value={s.look}
      onchange={(v) => cfg.set({ look: v })}
    />
    {#if climbing || s.follower === "performance"}
      <Choice
        label={m.music_drills_reading_setup_timing()}
        setupKey="strictness"
        options={[
          { value: "relaxed", label: m.music_drills_reading_setup_relaxed(), hint: m.music_drills_reading_setup_relaxed_hint() },
          { value: "normal", label: m.music_drills_reading_setup_normal() },
          { value: "strict", label: m.music_drills_reading_setup_strict(), hint: m.music_drills_reading_setup_strict_hint() },
        ]}
        value={s.strictness}
        onchange={(v) => cfg.set({ strictness: v })}
      />
    {/if}
  {/if}
  {#if fretted && FRET_POSITIONS[instrument] && activity === "sight-reading"}
    <Choice
      label={m.music_drills_reading_setup_position()}
      setupKey="position"
      options={FRET_POSITIONS[instrument].map((p) => ({ value: p.value, label: p.label, hint: m.music_drills_reading_setup_frets_hint({ from: p.frets[0], to: p.frets[1] }) }))}
      value={FRET_POSITIONS[instrument].some((p) => p.value === s.position) ? s.position : FRET_POSITIONS[instrument][0].value}
      onchange={(v) => cfg.set({ position: v })}
    />
  {/if}
  {#if !climbing}
    <Choice label={m.music_drills_reading_setup_lowest()} setupKey="low" options={rangeOptions(m.music_drills_reading_setup_levels_own())} value={s.low} onchange={(v) => cfg.set({ low: v })} />
    <Choice label={m.music_drills_reading_setup_highest()} setupKey="high" options={rangeOptions(m.music_drills_reading_setup_levels_own())} value={s.high} onchange={(v) => cfg.set({ high: v })} />
  {/if}
  {#if fretted && (activity === "sight-reading" || s.answer === "play")}
    <Choice
      label={m.music_drills_reading_setup_mic()}
      setupKey="input"
      options={[
        { value: "keys", label: m.music_drills_reading_off(), hint: m.music_drills_reading_setup_mic_off_hint() },
        { value: "mic", label: m.music_drills_reading_on(), hint: m.music_drills_reading_setup_mic_on_hint() },
      ]}
      value={s.input}
      onchange={(v) => cfg.set({ input: v })}
    />
  {/if}
</div>
{#if activity === "sight-reading"}
  <p class="mt-3 text-sm text-ws-soft">
    {m.music_drills_reading_setup_tempo_note()}{#if climbing}
      {m.music_drills_reading_setup_climb_note({ rung: rung + 1, total: rungs.length, label: rungs[rung].label, pass: Math.round(CLIMB.pass * 100), strikes: CLIMB.strikes })}{/if}
  </p>
{/if}
