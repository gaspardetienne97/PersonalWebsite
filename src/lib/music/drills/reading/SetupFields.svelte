<script lang="ts">
  // The reading setup, shared by flashcards and sight-reading.
  import { noteName } from "@repo/music-core";
  import { CLIMB, READING_LEVELS, READING_RUNGS } from "@repo/music-core/content/reading";
  import { KEY_SIGNATURES } from "@repo/music-core/theory/spelling";
  import Choice from "$lib/music/components/Choice.svelte";
  import type { DrillSetup } from "$lib/music/setup.svelte";
  import type { ReadingSetup } from "./reading";

  let { cfg, activity, fretted }: { cfg: DrillSetup<ReadingSetup>; activity: "flashcards" | "sight-reading"; fretted: boolean } = $props();
  const s = $derived(cfg.value);
  const notes = Array.from({ length: 88 }, (_, i) => 21 + i).map((m) => ({ value: m, label: noteName(m) }));
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <Choice
    label="Instrument"
    options={[
      { value: "auto", label: "Practice strip" },
      { value: "piano", label: "Piano" },
      { value: "guitar", label: "Guitar" },
      { value: "ukulele", label: "Ukulele" },
    ]}
    value={s.instrument}
    onchange={(v) => cfg.set({ instrument: v })}
  />
  <Choice label="Level" select options={READING_LEVELS.map((l) => ({ value: l.id, label: `${l.label}: ${l.description}` }))} value={s.level} onchange={(v) => {
    const l = READING_LEVELS.find((x) => x.id === v)!;
    cfg.set({ level: v, clefs: l.recommendedClefs.join(","), key: l.recommendedKeys.includes(s.key) ? s.key : l.recommendedKeys[0], low: l.recommendedRange.lowestMidi, high: l.recommendedRange.highestMidi });
  }} />
  <Choice label="Key" select options={KEY_SIGNATURES.map((k) => ({ value: k.name, label: k.name }))} value={s.key} onchange={(v) => cfg.set({ key: v })} />
  {#if !fretted}
    <Choice
      label="Clefs"
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
    <Choice label="Lowest note" select options={notes} value={s.low} onchange={(v) => cfg.set({ low: v })} />
    <Choice label="Highest note" select options={notes} value={s.high} onchange={(v) => cfg.set({ high: v })} />
    <Choice
      label="Prompt"
      options={[
        { value: "note", label: "Single note" },
        { value: "chord", label: "Triad" },
      ]}
      value={s.kind}
      onchange={(v) => cfg.set({ kind: v })}
    />
    <Choice
      label="Answer by"
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
      options={[
        { value: "one", label: "One phrase" },
        { value: "climb", label: "Climb the levels" },
      ]}
      value={s.climb ? "climb" : "one"}
      onchange={(v) => {
        if (v === "one") return cfg.set({ climb: false });
        // The climb plays in time, four bars a phrase, from the rung the level and key are on.
        const at = Math.max(0, READING_RUNGS.findIndex((r) => r.level === s.level && r.key === s.key));
        const r = READING_RUNGS[at];
        cfg.set({ climb: true, follower: "performance", measures: CLIMB.measures, level: r.level, key: r.key, clefs: fretted ? "treble" : r.clefs.join(",") });
      }}
    />
    <Choice
      label="Follower"
      options={[
        { value: "wait", label: "Wait for me" },
        { value: "performance", label: "Keep time" },
      ]}
      value={s.follower}
      onchange={(v) => cfg.set({ follower: v })}
    />
    <Choice
      label="Meter"
      options={[
        { value: "simple", label: "4/4" },
        { value: "compound", label: "6/8" },
      ]}
      value={s.meter}
      onchange={(v) => cfg.set({ meter: v })}
    />
    <Choice label="Bars" select options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `${n} bar${n > 1 ? "s" : ""}` }))} value={s.measures} onchange={(v) => cfg.set({ measures: v })} />
    {#if s.follower === "performance"}
      <Choice
        label="Timing window"
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
      label="Input"
      options={[
        { value: "keys", label: "On-screen or MIDI" },
        { value: "mic", label: "Microphone" },
      ]}
      value={s.input}
      onchange={(v) => cfg.set({ input: v })}
    />
  {/if}
</div>
{#if activity === "sight-reading"}
  <p class="mt-3 text-sm text-ws-soft">
    Tempo comes from the practice strip (40 to 200 BPM).{#if s.climb}
      The climb keeps time, four bars a phrase: {Math.round(CLIMB.pass * 100)}% or better moves up a rung of {READING_RUNGS.length}, less is a strike, {CLIMB.strikes} strikes end it.{/if}
  </p>
{/if}
