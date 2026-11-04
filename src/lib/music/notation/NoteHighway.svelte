<script lang="ts" module>
  import { getSetting, putSetting } from "$lib/music/runtime";

  export interface HighwayNote {
    startBeat: number;
    durationBeats: number;
    string: number;
    fret: number;
    /** The fretting finger (1 index to 4 pinky): the pill takes its colour. */
    finger?: number;
    /** A small mark riding on the pill: a picking letter (p i m a), or h, p, slides. */
    tag?: string;
  }
  export interface HighwayChord {
    startBeat: number;
    durationBeats: number;
    /** The strings it sounds on. */
    strings: number[];
    name?: string;
    strum?: "down" | "up" | "mute";
    accent?: boolean;
  }

  // The highway is a preference, not a setup: picked once, it shows in every
  // fretted drill. Kept in the settings table beside the drills' setups.
  const KEY = "music.highway";
  const prefs = $state({ on: false, ahead: 4 });
  let loaded = false;
  function load() {
    if (loaded || typeof indexedDB === "undefined") return;
    loaded = true;
    void getSetting<Partial<typeof prefs>>(KEY, {}).then((v) => Object.assign(prefs, v));
  }
  export const highway = {
    get on() {
      load();
      return prefs.on;
    },
    get ahead() {
      load();
      return prefs.ahead;
    },
    set(patch: Partial<typeof prefs>) {
      Object.assign(prefs, patch);
      void putSetting(KEY, { ...prefs });
    },
  };
  export { viewSwitch };
</script>

<!-- The written view or the moving one; the highway by default, the piano's waterfall when given. -->
{#snippet viewSwitch(other: string, moving = "Highway", on = highway.on, set = (v: boolean) => highway.set({ on: v }))}
  <div class="inline-flex gap-1 rounded-full bg-ws-stage-ink/10 p-1 text-sm font-medium" role="group" aria-label="View">
    {#each [{ on: false, label: other }, { on: true, label: moving }] as v (v.label)}
      <button
        type="button"
        class="min-h-9 rounded-full px-3.5 {on === v.on ? 'bg-ws-stage-ink text-ws-stage' : 'text-ws-stage-soft hover:text-ws-stage-ink'}"
        aria-pressed={on === v.on}
        onclick={() => set(v.on)}>{v.label}</button
      >
    {/each}
  </div>
{/snippet}

<script lang="ts">
  // A note highway for guitar and ukulele, after Yousician's: a lane per
  // string, notes as pills carrying their fret in the fretting finger's
  // colour, held notes with a tail, chords as one block over their strings
  // with a strum arrow, all scrolling left into a now line. A ball bounces on
  // each onset as it arrives. Driven by `beat` from the caller's clock, the
  // same one its tab cursor reads.
  import { MediaQuery } from "svelte/reactivity";
  import { settings } from "$lib/music/runtime";
  import { NOW_X, ballY, beatX, behindBeats, chordBlock, hitVerdict, inView, laneY, spanX, type Hit, type HitVerdict } from "./highway";

  let {
    notes = [],
    chords = [],
    labels = [],
    strings,
    beat,
    noteHits = {},
    chordHits = {},
    judge = false,
    perfectMs = 50,
    barBeats = 4,
    clickBeats = 1,
  }: {
    notes?: HighwayNote[];
    chords?: HighwayChord[];
    /** Text over the lanes from a beat on (a fingerpicked chord's name). */
    labels?: { beat: number; text: string }[];
    /** Open string names, string 1 first. */
    strings: string[];
    /** Beats from the start on the caller's clock (negative in the count-in); null before a run. */
    beat: number | null;
    /** By note index: the offset in ms (positive late), or a verdict without timing. */
    noteHits?: Record<number, Hit>;
    chordHits?: Record<number, Hit>;
    /** A run is on: a note that passes the line unplayed is missed. */
    judge?: boolean;
    perfectMs?: number;
    barBeats?: number;
    clickBeats?: number;
  } = $props();

  const reduceQuery = new MediaQuery("(prefers-reduced-motion: reduce)");
  const reduce = $derived(reduceQuery.current || settings.value.reduceMotion);
  const ahead = $derived(highway.ahead);
  const n = $derived(strings.length);
  // Before a run, the first notes wait half a beat from the line.
  const now = $derived(beat ?? -0.5);
  const behind = $derived(behindBeats(ahead));
  const x = (b: number) => `${(beatX(b, now, ahead) * 100).toFixed(3)}%`;
  const w = (beats: number) => `max(var(--pill), calc(${(spanX(beats, ahead) * 100).toFixed(3)}% - 3px))`;
  const lane = (s: number) => `calc(var(--sky) + ${laneY(s, n) * n} * var(--lane))`;

  /** Unplayed past its window, in a run: missed. */
  const grace = (d: number) => Math.min(1, Math.max(0.5, d));
  const verdictOf = (hit: Hit | undefined, start: number, dur: number): HitVerdict | undefined =>
    hit !== undefined ? hitVerdict(hit, perfectMs) : judge && now > start + grace(dur) ? "missed" : undefined;

  const shownNotes = $derived(notes.map((note, i) => ({ ...note, i, v: verdictOf(noteHits[i], note.startBeat, note.durationBeats) })).filter((note) => inView(note, now, ahead)));
  const shownChords = $derived(
    chords.map((c, i) => ({ ...c, i, box: chordBlock(c.strings, n), v: verdictOf(chordHits[i], c.startBeat, c.durationBeats) })).filter((c) => inView(c, now, ahead)),
  );
  const shownLabels = $derived(labels.filter((l, i) => l.beat < now + ahead && (labels[i + 1]?.beat ?? Infinity) > now - behind));
  const grid = $derived.by(() => {
    const out: { b: number; bar: boolean }[] = [];
    for (let k = Math.ceil((now - behind) / clickBeats); k * clickBeats < now + ahead; k++) {
      const b = k * clickBeats;
      if (b >= 0) out.push({ b, bar: Math.abs(b / barBeats - Math.round(b / barBeats)) < 1e-6 });
    }
    return out;
  });

  // The ball lands on the top of each onset's highest note or block.
  const onsets = $derived.by(() => {
    const at = new Map<number, number>();
    const put = (b: number, s: number) => at.set(Math.round(b * 1e4), Math.min(at.get(Math.round(b * 1e4)) ?? Infinity, s));
    for (const note of notes) put(note.startBeat, note.string);
    for (const c of chords) put(c.startBeat, Math.min(...c.strings));
    return [...at].sort((a, b) => a[0] - b[0]).map(([k, s]) => ({ beat: k / 1e4, y: laneY(s, n) }));
  });
  // An arc of most of a lane, so a ball landing on string 1 still clears the top.
  const ball = $derived(beat === null ? null : ballY(onsets, now, reduce ? 0 : 0.6 / n));

  // The last thing settled, said once above the line while it is near.
  const WORDS: Record<HitVerdict, string> = { perfect: "Perfect", early: "Early", late: "Late", hit: "Got it", missed: "Missed", wrong: "Wrong" };
  const latest = $derived.by(() => {
    let best: { start: number; v: HitVerdict; key: string } | null = null;
    for (const item of [...shownNotes.map((s) => ({ ...s, key: `n${s.i}` })), ...shownChords.map((c) => ({ ...c, key: `c${c.i}` }))])
      if (item.v && now - item.startBeat < 1.5 && (!best || item.startBeat > best.start)) best = { start: item.startBeat, v: item.v, key: item.key };
    return best;
  });
  const tone = (v: HitVerdict | undefined) => (!v ? undefined : v === "perfect" || v === "hit" ? "good" : v === "early" || v === "late" ? "near" : "bad");
  const fresh = (start: number, v: HitVerdict | undefined) => !reduce && v && tone(v) !== "bad" && now - start < 0.6 && now >= start - 0.25;
</script>

<div class="highway" style:--lanes={n} style:--lane={n > 4 ? "clamp(1.9rem, 6.5vw, 2.25rem)" : "clamp(2.2rem, 8vw, 2.6rem)"}>
  <p class="sr-only">Note highway: each string is a lane, string 1 on top; notes scroll left and are played as they reach the line.</p>
  <div class="road" style:--now="{NOW_X * 100}%" aria-hidden="true" data-testid="note-highway" data-beat={beat === null ? undefined : beat.toFixed(2)}>
    {#each Array.from({ length: n }, (_, k) => k + 1) as s (s)}
      <div class="string" style:top={lane(s)} style:--gauge="{1 + (2 * (s - 1)) / Math.max(1, n - 1)}px"></div>
    {/each}
    {#each grid as g (g.b)}
      <div class="tick" class:bar={g.bar} style:left={x(g.b)}></div>
    {/each}
    {#each shownLabels as l (l.beat)}
      <span class="label" style:left="max({x(l.beat)}, calc({NOW_X * 100}% + 0.5rem))">{l.text}</span>
    {/each}
    {#each shownChords as c (c.i)}
      <div
        class="block"
        class:accent={c.accent}
        data-strum={c.strum}
        data-tone={tone(c.v)}
        data-chord={c.name}
        style:left={x(c.startBeat)}
        style:width={w(c.durationBeats)}
        style:top="calc(var(--sky) + {c.box.top * n} * var(--lane) + 3px)"
        style:height="calc({c.box.height * n} * var(--lane) - 6px)"
      >
        {#if c.name}<span class="name">{c.name}</span>{/if}
        {#if c.strum}<span class="arrow">{c.strum === "down" ? "↓" : c.strum === "up" ? "↑" : "✕"}</span>{/if}
      </div>
      {#if fresh(c.startBeat, c.v)}<span class="bloom" data-tone={tone(c.v)} style:top="calc(var(--sky) + {(c.box.top + c.box.height / 2) * n} * var(--lane))"></span>{/if}
    {/each}
    {#each shownNotes as note (note.i)}
      <div class="note" data-finger={note.finger || undefined} data-tone={tone(note.v)} data-verdict={note.v} style:left={x(note.startBeat)} style:width={w(note.durationBeats)} style:top={lane(note.string)}>
        <span class="tail"></span>
        <span class="head">{note.fret}{#if note.tag}<span class="tag">{note.tag}</span>{/if}</span>
      </div>
      {#if fresh(note.startBeat, note.v)}<span class="bloom" data-tone={tone(note.v)} style:top={lane(note.string)}></span>{/if}
    {/each}
    <div class="past"></div>
    {#each strings as name, k (k)}
      <span class="open" style:top={lane(k + 1)}>{name}</span>
    {/each}
    <div class="now"></div>
    {#if ball !== null}<span class="ball" style:top="max(0px, calc(var(--sky) + {ball * n} * var(--lane) - var(--pill) / 2 - 0.8rem))"></span>{/if}
    {#if latest}
      {#key latest.key}<span class="word" data-tone={tone(latest.v)}>{WORDS[latest.v]}</span>{/key}
    {/if}
  </div>
  <div class="mt-2 flex w-fit items-center gap-1 rounded-full bg-ws-stage-ink/8 p-1 text-sm font-medium" role="group" aria-label="Beats ahead">
    <span class="px-2 whitespace-nowrap text-ws-stage-soft">Beats ahead</span>
    {#each [2, 4, 8] as a (a)}
      <button type="button" class="min-h-9 min-w-10 rounded-full px-3 {ahead === a ? 'bg-ws-stage-ink text-ws-stage' : 'text-ws-stage-soft hover:text-ws-stage-ink'}" aria-pressed={ahead === a} onclick={() => highway.set({ ahead: a })}>{a}</button>
    {/each}
  </div>
</div>

<style>
  .highway {
    --sky: 2rem;
    --pill: calc(var(--lane) * 0.72);
    min-width: 0;
  }
  .road {
    position: relative;
    overflow: hidden;
    height: calc(var(--sky) + var(--lanes) * var(--lane) + 0.4rem);
    border-radius: 0.75rem;
    background:
      linear-gradient(to bottom, transparent var(--sky), oklch(1 0 0 / 0.035) var(--sky)),
      var(--ws-stage-2);
    color: var(--ws-stage-ink);
  }
  .string {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--gauge);
    transform: translateY(-50%);
    background: color-mix(in oklch, var(--ws-stage-ink) 32%, transparent);
  }
  .tick {
    position: absolute;
    top: var(--sky);
    bottom: 0.2rem;
    width: 1px;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
  }
  .tick.bar {
    background: color-mix(in oklch, var(--ws-stage-ink) 26%, transparent);
  }
  .label {
    position: absolute;
    top: 0.2rem;
    font-weight: 700;
    font-size: 0.875rem;
    white-space: nowrap;
    color: var(--ws-stage-soft);
  }
  /* A note: the head carries the fret at its onset; a held note trails a tail. */
  .note {
    --finger: var(--instr);
    position: absolute;
    height: var(--pill);
    transform: translateY(-50%);
  }
  .note[data-finger="1"] {
    --finger: var(--finger-1);
  }
  .note[data-finger="2"] {
    --finger: var(--finger-2);
  }
  .note[data-finger="3"] {
    --finger: var(--finger-3);
  }
  .note[data-finger="4"] {
    --finger: var(--finger-4);
  }
  .tail {
    position: absolute;
    left: calc(var(--pill) / 2);
    right: 0;
    top: 30%;
    bottom: 30%;
    border-radius: 0 999px 999px 0;
    background: color-mix(in oklch, var(--finger) 55%, transparent);
  }
  .head {
    position: absolute;
    left: 0;
    top: 0;
    display: grid;
    place-items: center;
    min-width: var(--pill);
    height: 100%;
    padding: 0 0.3rem;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--finger);
    color: #1b120b;
    font-weight: 800;
    font-size: calc(var(--lane) * 0.4);
    font-variant-numeric: tabular-nums;
    box-shadow: 0 1px 0 oklch(0 0 0 / 0.35);
  }
  .tag {
    position: absolute;
    top: -0.45rem;
    right: -0.45rem;
    display: grid;
    place-items: center;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.15rem;
    border-radius: 999px;
    background: var(--ws-stage-ink);
    color: var(--ws-stage);
    font-size: 0.8125rem;
    font-weight: 800;
    line-height: 1;
  }
  /* A chord: a wash over its strings with a firm edge where it starts. */
  .block {
    position: absolute;
    box-sizing: border-box;
    border-radius: 0.5rem;
    background: color-mix(in oklch, var(--instr) 30%, transparent);
    border: 1.5px solid color-mix(in oklch, var(--instr) 55%, transparent);
    border-left: 4px solid var(--instr);
    color: var(--ws-stage-ink);
  }
  .block.accent {
    background: color-mix(in oklch, var(--instr) 48%, transparent);
  }
  .block[data-strum="mute"] {
    background: repeating-linear-gradient(135deg, color-mix(in oklch, var(--instr) 35%, transparent) 0 4px, transparent 4px 8px);
  }
  .block .name {
    position: absolute;
    top: 0.2rem;
    left: 0.4rem;
    font-weight: 800;
    font-size: 1.0625rem;
    line-height: 1;
    white-space: nowrap;
  }
  .block .arrow {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    text-align: center;
    font-size: calc(var(--lane) * 0.7);
    font-weight: 800;
    line-height: 1;
  }
  .block[data-strum="mute"] .arrow {
    font-size: calc(var(--lane) * 0.5);
  }
  /* Judged: the colour stays the finger's; a ring says how it went, and it dims once past. */
  [data-tone] .head,
  .block[data-tone] {
    outline: 2.5px solid var(--judge);
    outline-offset: 1.5px;
  }
  [data-tone="good"] {
    --judge: color-mix(in oklch, var(--success) 75%, white);
  }
  [data-tone="near"] {
    --judge: var(--warn);
  }
  [data-tone="bad"] {
    --judge: color-mix(in oklch, var(--destructive) 80%, white);
  }
  .note[data-tone="bad"],
  .block[data-tone="bad"] {
    opacity: 0.45;
  }
  [data-tone="bad"] .head,
  .block[data-tone="bad"] {
    outline-style: dashed;
  }
  /* Behind the line: a wash that fades what has passed, under the string names. */
  .past {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--now);
    background: linear-gradient(to right, color-mix(in oklch, var(--ws-stage-2) 92%, transparent), color-mix(in oklch, var(--ws-stage-2) 45%, transparent));
    pointer-events: none;
  }
  .open {
    position: absolute;
    left: 0.5rem;
    transform: translateY(-50%);
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--ws-stage-soft);
  }
  .now {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--now);
    width: 3px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: var(--instr);
    box-shadow: 0 0 12px color-mix(in oklch, var(--instr) 70%, transparent);
  }
  .ball {
    position: absolute;
    left: var(--now);
    width: 0.8rem;
    height: 0.8rem;
    margin-left: -0.4rem;
    border-radius: 50%;
    background: var(--ws-stage-ink);
    box-shadow: 0 0 10px color-mix(in oklch, var(--ws-stage-ink) 50%, transparent);
  }
  .bloom {
    position: absolute;
    left: var(--now);
    width: var(--pill);
    height: var(--pill);
    margin: calc(var(--pill) / -2) 0 0 calc(var(--pill) / -2);
    border-radius: 50%;
    border: 2px solid var(--judge, var(--ws-stage-ink));
    animation: ws-bloom 450ms ease-out forwards;
    pointer-events: none;
  }
  /* Left of the line, where nothing is still to come. */
  .word {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    width: calc(var(--now) - 0.7rem);
    text-align: right;
    white-space: nowrap;
    font-size: 0.8125rem;
    font-weight: 800;
    color: var(--judge);
    animation: ws-rise 180ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .bloom,
    .word {
      animation: none;
    }
  }
</style>
