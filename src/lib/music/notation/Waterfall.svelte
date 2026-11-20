<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Falling notes over a keyboard. A dark lane per key, lined up with the keys
  // under it (black-key lanes shaded, guides before each C and F), bar lines
  // with their numbers, and each note a rounded bar as wide as its key in its
  // hand's colour. The lane scrolls with `beat`, which the parent drives from
  // the clock the audio runs on, and ends where the keyboard begins: a bar
  // lights its key's lane as it reaches the hit line.
  import { noteName, type Score } from "@repo/music-core";
  import { settings } from "#lib/music/runtime/index.ts";
  import { selectedVoices, voiceSides, whiteKeyLayout } from "./groups";
  import { fallingNotes, gridInView, inView, laneGuides, sounding } from "./falling";
  import type { GroupState } from "./NotationFrame.svelte";

  /** Fewest pixels a beat gets, so a quarter note stands taller than it is wide. */
  const MIN_BEAT_PX = 48;
  /** A bar is this share of its lane, centred, and never wider than BAR_MAX_PX (slim, as MuseScore draws them). */
  const BAR_SHARE = 0.6;
  const BAR_MAX_PX = 28;

  let {
    score,
    voiceIds,
    low,
    high,
    beat,
    lookaheadBeats = 8,
    groupStates = {},
    height = "min(44dvh, 22rem)",
    labels = "none",
    legend = true,
    playing = true,
    hits = {},
  }: {
    score: Score;
    voiceIds?: string[] | null;
    low: number;
    high: number;
    /** Current position in beats, driven by the parent clock. */
    beat: number;
    lookaheadBeats?: number;
    groupStates?: Record<number, GroupState>;
    height?: string;
    /** Written on each bar where it fits: the note's name or its finger. */
    labels?: "none" | "names" | "fingers";
    /** Name the hands' colours above the lane. */
    legend?: boolean;
    /** False while the lane rests: nothing glows at the hit line. */
    playing?: boolean;
    /** Keys just played, right or wrong: a ring bursts from the key's lane at the hit line. */
    hits?: Record<number, "correct" | "wrong">;
  } = $props();

  const keys = $derived(whiteKeyLayout(low, high));
  const lanes = $derived(Object.values(keys).filter((k) => k.black));
  const guides = $derived(laneGuides(keys));
  const notes = $derived(fallingNotes(score, voiceIds, keys));

  // Reduced motion: the lane moves a beat at a time instead of gliding.
  let prefersStill = $state(false);
  $effect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    prefersStill = mq.matches;
    const on = () => (prefersStill = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });
  const now = $derived(prefersStill || settings.value.reduceMotion ? Math.floor(beat + 1e-6) : beat);

  // ponytail: filters every note per frame; window by index if scores get long.
  let laneH = $state(0);
  let laneW = $state(0);
  // A beat never gets less than MIN_BEAT_PX: a short lane shows fewer beats than asked rather than squashing them.
  const look = $derived(laneH ? Math.min(lookaheadBeats, laneH / MIN_BEAT_PX) : lookaheadBeats);
  const visible = $derived(notes.filter((n) => inView(n, now, look)));
  const lit = $derived(playing ? visible.filter((n) => sounding(n, now)) : []);
  const grid = $derived(gridInView(score, now, look));
  const bursts = $derived(Object.entries(hits).flatMap(([m, kind]) => (keys[Number(m)] ? [{ key: keys[Number(m)], kind }] : [])));

  const pct = (b: number) => `${(b / look) * 100}%`;
  const labelOf = (n: (typeof notes)[number]) =>
    labels === "names" ? noteName(n.midi, "flat", false) : labels === "fingers" && n.finger !== undefined ? String(n.finger) : "";
  // A label needs about 14 px each way to read.
  const fits = (n: (typeof notes)[number]) => (n.dur / look) * laneH - 2 >= 14 && Math.min(n.width * BAR_SHARE * laneW, BAR_MAX_PX) >= 12;

  const hands = $derived(new Set(notes.map((n) => n.side)));
  const voices = $derived(selectedVoices(score, voiceIds));
  const side = $derived(voiceSides(score, voiceIds));
  const legendItems = $derived(
    hands.size < 2
      ? []
      : voices.some((v) => v.hand)
        ? [
            { side: "right", name: m.music_shell_aero_right_hand() },
            { side: "left", name: m.music_shell_aero_left_hand() },
          ]
        : voices.slice(0, 2).map((v) => ({ side: side[v.id], name: v.name })),
  );
</script>

<div class="wf">
  {#if legend && legendItems.length}
    <ul class="legend">
      {#each legendItems as l (l.side)}
        <li><span class="swatch {l.side}"></span>{l.name}</li>
      {/each}
    </ul>
  {/if}
  <div class="lane" style:height bind:clientHeight={laneH} bind:clientWidth={laneW} aria-hidden="true">
    {#each lanes as k (k.midi)}
      <div class="blacklane" style:left="{k.x * 100}%" style:width="{k.width * 100}%"></div>
    {/each}
    {#each guides as g (g.x)}
      <div class="guide" class:octave={g.octave} style:left="{g.x * 100}%"></div>
    {/each}
    {#each lit as n (n.key)}
      <div class="glow {n.side}" style:left="{n.x * 100}%" style:width="{n.width * 100}%"></div>
    {/each}
    <div class="layer" style:transform="translateY({(now / look) * 100}%)">
      {#each grid.beatLines as b (b)}
        <div class="beatline" style:bottom={pct(b)}></div>
      {/each}
      {#each grid.barLines as l (l.number)}
        <div class="barline" style:bottom={pct(l.beat)}><span class="tnum">{l.number}</span></div>
      {/each}
      {#each visible as n (n.key)}
        {@const text = labelOf(n)}
        <div
          class="note {n.side}"
          class:black={n.black}
          class:sounding={lit.includes(n)}
          data-state={groupStates[n.group]}
          data-midi={n.midi}
          style:left="calc({(n.x + n.width / 2) * 100}% - {n.black ? 0 : 1}px)"
          style:width="min({n.width * BAR_SHARE * 100}%, {n.black ? BAR_MAX_PX - 4 : BAR_MAX_PX}px)"
          style:bottom={pct(n.start)}
          style:height="calc({pct(n.dur)} - 2px)"
        >
          {#if text && fits(n)}<span>{text}</span>{/if}
        </div>
      {/each}
    </div>
    {#each bursts as b (`${b.key.midi}:${b.kind}`)}
      <div class="burst {b.kind}" style:left="{(b.key.x + b.key.width / 2) * 100}%"></div>
    {/each}
    <div class="hit"></div>
  </div>
</div>

<style>
  .wf {
    --wf-ground: color-mix(in oklch, var(--ws-stage, #17141f) 78%, black);
    --wf-ink: var(--ws-stage-ink, #f3f0fa);
    min-width: 0;
  }
  .lane {
    position: relative;
    overflow: hidden;
    border-radius: 0.625rem 0.625rem 0 0;
    background:
      linear-gradient(to top, color-mix(in oklch, var(--instr, #e9a) 14%, transparent), transparent 18%),
      var(--wf-ground);
  }
  .blacklane {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in oklch, black 30%, transparent);
  }
  .guide {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    margin-left: -1px;
    background: color-mix(in oklch, var(--wf-ink) 7%, transparent);
  }
  .guide.octave {
    background: color-mix(in oklch, var(--wf-ink) 15%, transparent);
  }
  .layer {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .beatline,
  .barline {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
  }
  .beatline {
    background: color-mix(in oklch, var(--wf-ink) 6%, transparent);
  }
  .barline {
    background: color-mix(in oklch, var(--wf-ink) 22%, transparent);
  }
  .barline span {
    position: absolute;
    left: 0.3rem;
    bottom: 2px;
    font-size: 0.8125rem;
    line-height: 1;
    color: color-mix(in oklch, var(--wf-ink) 55%, transparent);
  }
  .note {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 4px;
    transform: translateX(-50%);
    border-radius: 3px;
    background: var(--wf-hand);
    /* A bright leading edge: the bottom reaches the keys first, so it marks where the note starts. */
    box-shadow: inset 0 -2px 0 color-mix(in oklch, var(--wf-hand) 45%, white);
    color: #17120c;
    font-size: 0.8125rem;
    font-weight: 700;
    line-height: 1;
  }
  .note span {
    padding-bottom: 3px;
  }
  .note.right,
  .glow.right,
  .swatch.right {
    --wf-hand: var(--hand-right, oklch(0.76 0.15 60));
  }
  .note.left,
  .glow.left,
  .swatch.left {
    --wf-hand: var(--hand-left, oklch(0.72 0.13 200));
  }
  /* Black-key notes: a darker shade, drawn over the white-key notes with a ring of the ground. */
  .note.black {
    z-index: 1;
    background: color-mix(in oklch, var(--wf-hand) 72%, black);
    color: white;
    box-shadow:
      0 0 0 1.5px var(--wf-ground),
      inset 0 -2px 0 color-mix(in oklch, var(--wf-hand) 70%, white);
  }
  .note.sounding {
    background: color-mix(in oklch, var(--wf-hand) 75%, white);
    box-shadow: 0 0 14px color-mix(in oklch, var(--wf-hand) 70%, transparent);
  }
  .note.black.sounding {
    background: var(--wf-hand);
    color: #17120c;
  }
  .note[data-state="active"] {
    outline: 2px solid var(--wf-ink);
    outline-offset: 1px;
  }
  .note[data-state="correct"] {
    outline: 2px solid var(--success);
    outline-offset: -2px;
  }
  .note[data-state="wrong"] {
    outline: 2px solid var(--destructive);
    outline-offset: -2px;
  }
  .note[data-state="missed"] {
    opacity: 0.35;
  }
  .glow {
    position: absolute;
    bottom: 0;
    height: 2.25rem;
    background: linear-gradient(to top, color-mix(in oklch, var(--wf-hand) 55%, transparent), transparent);
  }
  .burst {
    --wf-judge: var(--success);
    position: absolute;
    bottom: -1.25rem;
    width: 2.5rem;
    height: 2.5rem;
    margin-left: -1.25rem;
    border-radius: 999px;
    border: 3px solid var(--wf-judge);
    box-shadow:
      0 0 14px var(--wf-judge),
      inset 0 0 10px color-mix(in oklch, var(--wf-judge) 60%, transparent);
    opacity: 0;
    animation: wf-burst 420ms ease-out;
    pointer-events: none;
  }
  .burst.wrong {
    --wf-judge: var(--destructive);
  }
  @keyframes wf-burst {
    from {
      transform: scale(0.4);
      opacity: 1;
    }
    to {
      transform: scale(1.7);
      opacity: 0;
    }
  }
  .hit {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: color-mix(in oklch, var(--instr, #e9a) 75%, white);
    box-shadow: 0 0 10px var(--instr, #e9a);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0 0 0.375rem;
    padding: 0;
    list-style: none;
    font-size: 0.8125rem;
    color: var(--ws-stage-soft, inherit);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .swatch {
    width: 0.625rem;
    height: 0.875rem;
    border-radius: 3px;
    background: var(--wf-hand);
  }
</style>
