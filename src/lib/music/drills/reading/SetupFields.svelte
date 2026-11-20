<script lang="ts">
  // The reading setup, shared by flashcards and sight-reading. The instrument is
  // the practice strip's, and the range follows the level, the clefs and the
  // instrument, so neither is a control here.
  import { CLIMB, levelMeter, levelsFor, READING_LEVELS, READING_METERS, readingLevel, readingLevelId, readingRungs } from "@repo/music-core/content/reading";
  import { noteName } from "@repo/music-core";
  import Choice from "#lib/music/components/Choice.svelte";
  import type { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { FOLLOWER_NAME, FRET_POSITIONS, type ReadingSetup } from "./reading";

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
  const naturals = $derived(Array.from({ length: limits[1] - limits[0] + 1 }, (_, i) => limits[0] + i).filter((m) => !noteName(m).includes("#")));
  const rangeOptions = (label: string) => [{ value: 0, label }, ...naturals.map((m) => ({ value: m, label: noteName(m) }))];
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <Choice
    label="Level"
    setupKey="level"
    options={levels.map((l) => ({ value: l.id, label: l.label, hint: `${l.description} Rhythm: ${l.rhythm}.` }))}
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
  <Choice label="Key" setupKey="key" options={level.recommendedKeys.map((k) => ({ value: k, label: k }))} value={s.key} onchange={(v) => cfg.set({ key: v })} />
  {#if !oneLine && !climbing}
    <Choice
      label="Clefs"
      setupKey="clefs"
      options={[
        { value: "treble", label: "Treble" },
        { value: "bass", label: "Bass" },
        { value: "treble,bass", label: "Both" },
        ...(activity === "flashcards" ? [{ value: "crossed", label: "Crossed", hint: "Middle notes on either clef: the left hand reads treble, the right hand bass." }] : []),
      ]}
      value={s.clefs}
      onchange={(v) => cfg.set({ clefs: v })}
    />
  {/if}
  {#if activity === "flashcards"}
    <Choice
      label="Card"
      setupKey="kind"
      options={[
        { value: "note", label: "Single note" },
        { value: "chord", label: "Triad" },
        ...(oneLine ? [] : [{ value: "satb", label: "Four-part chord", hint: "A chord in chorale spacing across both staves, named as its triad." }]),
      ]}
      value={s.kind}
      onchange={(v) => cfg.set({ kind: v })}
    />
    {#if s.kind === "note"}
      <Choice
        label="Accidentals"
        setupKey="accidentals"
        options={[
          { value: "off", label: "Off", hint: "The key's own notes." },
          { value: "on", label: "On", hint: "Sharps, flats and naturals beside the key's notes." },
        ]}
        value={s.accidentals ? "on" : "off"}
        onchange={(v) => cfg.set({ accidentals: v === "on" })}
      />
    {/if}
    <Choice
      label="Answer by"
      setupKey="answer"
      options={[
        { value: "choice", label: "Naming it" },
        { value: "play", label: "Playing it" },
      ]}
      value={s.answer}
      onchange={(v) => cfg.set({ answer: v })}
    />
  {:else}
    <Choice
      label="Run"
      setupKey="session"
      options={[
        { value: "one", label: "One phrase" },
        { value: "climb", label: "Climb the levels" },
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
        label="Pace"
        setupKey="follower"
        options={[
          { value: "wait", label: FOLLOWER_NAME.wait, hint: "The cursor waits until you play the right notes. Guided, so it never changes your skill scores." },
          { value: "performance", label: FOLLOWER_NAME.performance, hint: "The cursor moves with the click. Your timing is scored." },
          { value: "tap", label: FOLLOWER_NAME.tap, hint: "Keep time with any key, the Tap button or Space. Only the rhythm is scored." },
        ]}
        value={s.follower}
        onchange={(v) => cfg.set({ follower: v })}
      />
      {#if s.follower === "tap"}
        <Choice
          label="Kick lane"
          setupKey="kick"
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "Kick every beat", hint: "A kick on every quarter under the rhythm: a kick pad (MIDI 36) or the Kick button. Both are scored." },
          ]}
          value={s.kick ? "on" : "off"}
          onchange={(v) => cfg.set({ kick: v === "on" })}
        />
      {/if}
    {/if}
    <Choice
      label="Meter"
      setupKey="meter"
      options={level.meters.map((m) => ({ value: m, label: READING_METERS[m].label }))}
      value={levelMeter(level.id, s.meter)}
      onchange={(v) => cfg.set({ meter: v })}
    />
    {#if !climbing}
      <Choice label="Bars" setupKey="measures" options={[1, 2, 4, 8, 12, 16].map((n) => ({ value: n, label: String(n) }))} value={s.measures} onchange={(v) => cfg.set({ measures: v })} />
    {/if}
    <Choice
      label="Look-ahead"
      setupKey="mask"
      options={[
        { value: 0, label: "Off" },
        { value: 2, label: "2 beats", hint: "Played notes hide and only the next 2 beats show, so your eyes stay ahead of your hands." },
        { value: 4, label: "4 beats", hint: "Played notes hide and only the next 4 beats show." },
      ]}
      value={s.mask}
      onchange={(v) => cfg.set({ mask: v })}
    />
    <Choice
      label="Look first"
      setupKey="look"
      options={[
        { value: 0, label: "Off" },
        { value: 30, label: "30 seconds", hint: "Start opens after 30 seconds: find the key, the meter and the hardest bar, and hum bar 1." },
      ]}
      value={s.look}
      onchange={(v) => cfg.set({ look: v })}
    />
    {#if climbing || s.follower === "performance"}
      <Choice
        label="Timing"
        setupKey="strictness"
        options={[
          { value: "relaxed", label: "Relaxed", hint: "A note a little early or late still counts as on time." },
          { value: "normal", label: "Normal" },
          { value: "strict", label: "Strict", hint: "Only a note close to the beat counts as on time." },
        ]}
        value={s.strictness}
        onchange={(v) => cfg.set({ strictness: v })}
      />
    {/if}
  {/if}
  {#if fretted && FRET_POSITIONS[instrument] && activity === "sight-reading"}
    <Choice
      label="Position"
      setupKey="position"
      options={FRET_POSITIONS[instrument].map((p) => ({ value: p.value, label: p.label, hint: `Frets ${p.frets[0]} to ${p.frets[1]}.` }))}
      value={FRET_POSITIONS[instrument].some((p) => p.value === s.position) ? s.position : FRET_POSITIONS[instrument][0].value}
      onchange={(v) => cfg.set({ position: v })}
    />
  {/if}
  {#if !climbing}
    <Choice label="Lowest note" setupKey="low" options={rangeOptions("The level's")} value={s.low} onchange={(v) => cfg.set({ low: v })} />
    <Choice label="Highest note" setupKey="high" options={rangeOptions("The level's")} value={s.high} onchange={(v) => cfg.set({ high: v })} />
  {/if}
  {#if fretted && (activity === "sight-reading" || s.answer === "play")}
    <Choice
      label="Microphone"
      setupKey="input"
      options={[
        { value: "keys", label: "Off", hint: "Answer on the screen or over MIDI." },
        { value: "mic", label: "On", hint: "Play your instrument into the microphone." },
      ]}
      value={s.input}
      onchange={(v) => cfg.set({ input: v })}
    />
  {/if}
</div>
{#if activity === "sight-reading"}
  <p class="mt-3 text-sm text-ws-soft">
    Set the tempo in the top bar (40 to 200 BPM).{#if climbing}
      The climb keeps time, four bars a phrase, starting at level {rung + 1} of {rungs.length} ({rungs[rung].label}). {Math.round(CLIMB.pass * 100)}% or better moves up a level, less is a strike, and {CLIMB.strikes} strikes end it.{/if}
  </p>
{/if}
