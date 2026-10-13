<script lang="ts">
  // The reading setup, shared by flashcards and sight-reading. The instrument is
  // the practice strip's, and the range follows the level, the clefs and the
  // instrument, so neither is a control here.
  import { CLIMB, READING_LEVELS, READING_RUNGS, readingLevel } from "@repo/music-core/content/reading";
  import type { ReadingLevelId } from "@repo/music-core/data/index";
  import Choice from "$lib/music/components/Choice.svelte";
  import type { DrillSetup } from "$lib/music/setup.svelte";
  import type { ReadingSetup } from "./reading";

  /** `oneLine`: one treble staff (fretted instruments and the Aerophone). */
  let { cfg, activity, fretted, oneLine = fretted }: { cfg: DrillSetup<ReadingSetup>; activity: "flashcards" | "sight-reading"; fretted: boolean; oneLine?: boolean } = $props();
  const s = $derived(cfg.value);
  const level = $derived(readingLevel((READING_LEVELS.some((l) => l.id === s.level) ? s.level : "primer") as ReadingLevelId));
  const climbing = $derived(activity === "sight-reading" && !!s.climb);
  // Every level and key pair is a rung, since the keys offered are the level's.
  const rung = $derived(Math.max(0, READING_RUNGS.findIndex((r) => r.level === s.level && r.key === s.key)));
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <Choice
    label="Level"
    setupKey="level"
    options={READING_LEVELS.map((l) => ({ value: l.id, label: l.label, hint: `${l.description} Rhythm: ${l.rhythm}.` }))}
    value={s.level}
    onchange={(v) => {
      const l = READING_LEVELS.find((x) => x.id === v)!;
      cfg.set({ level: v, clefs: oneLine ? "treble" : l.recommendedClefs.join(","), key: l.recommendedKeys.includes(s.key) ? s.key : l.recommendedKeys[0] });
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
      ]}
      value={s.clefs}
      onchange={(v) => cfg.set({ clefs: v })}
    />
  {/if}
  {#if activity === "flashcards"}
    <Choice
      label="Prompt"
      setupKey="kind"
      options={[
        { value: "note", label: "Single note" },
        { value: "chord", label: "Triad" },
      ]}
      value={s.kind}
      onchange={(v) => cfg.set({ kind: v })}
    />
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
      label="Session"
      setupKey="session"
      options={[
        { value: "one", label: "One phrase" },
        { value: "climb", label: "Climb the levels" },
      ]}
      value={s.climb ? "climb" : "one"}
      onchange={(v) => {
        if (v === "one") return cfg.set({ climb: false });
        // The climb keeps time, four bars a phrase, from the rung the level and key are on.
        const r = READING_RUNGS[rung];
        cfg.set({ climb: true, follower: "performance", measures: CLIMB.measures, level: r.level, key: r.key, clefs: oneLine ? "treble" : r.clefs.join(",") });
      }}
    />
    {#if !climbing}
      <Choice
        label="Follower"
        setupKey="follower"
        options={[
          { value: "wait", label: "Wait for me", hint: "The cursor holds until you play the right notes. Guided, so it does not count toward mastery." },
          { value: "performance", label: "Keep time", hint: "The cursor runs with the click and grades your timing." },
        ]}
        value={s.follower}
        onchange={(v) => cfg.set({ follower: v })}
      />
    {/if}
    <Choice
      label="Meter"
      setupKey="meter"
      options={[
        { value: "simple", label: "4/4" },
        { value: "compound", label: "6/8" },
      ]}
      value={s.meter}
      onchange={(v) => cfg.set({ meter: v })}
    />
    {#if !climbing}
      <Choice label="Bars" setupKey="measures" options={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))} value={s.measures} onchange={(v) => cfg.set({ measures: v })} />
    {/if}
    {#if climbing || s.follower === "performance"}
      <Choice
        label="Timing window"
        setupKey="strictness"
        options={[
          { value: "relaxed", label: "Relaxed" },
          { value: "normal", label: "Normal" },
          { value: "strict", label: "Strict" },
        ]}
        value={s.strictness}
        onchange={(v) => cfg.set({ strictness: v })}
      />
    {/if}
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
    Tempo comes from the practice strip (40 to 200 BPM).{#if climbing}
      The climb keeps time, four bars a phrase, starting at rung {rung + 1} of {READING_RUNGS.length} ({READING_RUNGS[rung].label}): {Math.round(CLIMB.pass * 100)}% or better moves up a rung, less is a strike, {CLIMB.strikes} strikes end it.{/if}
  </p>
{/if}
