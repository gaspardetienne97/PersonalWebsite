<script lang="ts" module>
  export interface HighwayLane {
    id: string;
    label: string;
    color: string;
  }
  export interface HighwayNote {
    lane: number;
    /** ms from the downbeat */
    atMs: number;
    kind: "accent" | "normal" | "ghost";
  }
</script>

<script lang="ts">
  // The notes coming at you: one coloured lane per pad, the notes sliding
  // right to left onto the hit line, each judged as it passes (Perfect,
  // Early, Late, Miss), the count-in counted down on top. Accents are tall,
  // ghosts small and hollow. The play-along apps' view (Melodics' highway).
  import { JUDGEMENT_TEXT, type Judgement } from "./lanes";

  let {
    lanes,
    notes,
    now,
    beatMs,
    beatsPerBar = 4,
    lengthMs,
    judged = {},
    flash = null,
    countIn = null,
    label = "Notes coming up",
  }: {
    lanes: HighwayLane[];
    notes: HighwayNote[];
    /** ms from the downbeat, at the hit line. */
    now: number;
    beatMs: number;
    beatsPerBar?: number;
    lengthMs: number;
    judged?: Record<number, Judgement>;
    /** The latest judgement, shown at the hit line; `key` restarts its animation. */
    flash?: { judgement: Judgement | "extra"; ms?: number; key: number } | null;
    /** Beats left in the count-in. */
    countIn?: number | null;
    label?: string;
  } = $props();

  let width = $state(600);
  // Two beats behind the line, six ahead (a bar and a half of reading at 4/4).
  const BEHIND = 1.2;
  const AHEAD = 6;
  const HIT = $derived(width * (BEHIND / (BEHIND + AHEAD)));
  const px = $derived(width / ((BEHIND + AHEAD) * beatMs));
  const xOf = (ms: number) => HIT + (ms - now) * px;
  const visible = $derived(
    notes.map((n, i) => ({ ...n, i })).filter((n) => n.atMs > now - BEHIND * beatMs - beatMs && n.atMs < now + AHEAD * beatMs + beatMs),
  );
  const beats = $derived.by(() => {
    const first = Math.ceil((now - BEHIND * beatMs) / beatMs);
    const last = Math.floor((now + AHEAD * beatMs) / beatMs);
    const out: { beat: number; bar: boolean; end: boolean }[] = [];
    for (let b = first; b <= last; b++) out.push({ beat: b, bar: b % beatsPerBar === 0, end: Math.abs(b * beatMs - lengthMs) < 1 });
    return out;
  });
  const sixteenth = $derived(beatMs / 4);
</script>

<div class="highway" role="img" aria-label={label} bind:clientWidth={width} style:--lanes={lanes.length}>
  <div class="labels" aria-hidden="true">
    {#each lanes as l (l.id)}
      <span class="lane-label" style:--c={l.color}>{l.label}</span>
    {/each}
  </div>
  <div class="track">
    {#each lanes as l, li (l.id)}
      <div class="lane" style:--c={l.color} style:top="{(li / lanes.length) * 100}%" style:height="{100 / lanes.length}%"></div>
    {/each}
    {#each beats as b (b.beat)}
      <span class="beat" class:bar={b.bar} class:end={b.end} style:left="{xOf(b.beat * beatMs)}px"></span>
    {/each}
    {#each visible as n (n.i)}
      {@const j = judged[n.i]}
      {@const c = lanes[n.lane]?.color}
      <span
        class="note"
        data-kind={n.kind}
        data-judged={j}
        style:--c={c}
        style:left="{xOf(n.atMs)}px"
        style:top="{((n.lane + 0.5) / lanes.length) * 100}%"
        style:width="{Math.max(12, sixteenth * px * 0.82)}px"
      ></span>
    {/each}
    <span class="hitline" style:left="{HIT}px" aria-hidden="true"></span>
    {#if flash}
      {#key flash.key}
        <span class="flash" data-kind={flash.judgement} style:left="{HIT}px" aria-live="polite">
          {flash.judgement === "extra" ? "Extra" : JUDGEMENT_TEXT[flash.judgement]}{#if flash.ms !== undefined && (flash.judgement === "early" || flash.judgement === "late")}<small> {Math.abs(Math.round(flash.ms))} ms</small>{/if}
        </span>
      {/key}
    {/if}
    {#if countIn}
      {#key countIn}<span class="count" aria-live="assertive">{countIn}</span>{/key}
    {/if}
  </div>
</div>

<style>
  .highway {
    display: grid;
    grid-template-columns: 5.6rem minmax(0, 1fr);
    height: calc(var(--lanes) * 2.8rem + 0.8rem);
    min-height: 7rem;
    border-radius: 1rem;
    overflow: hidden;
    background: linear-gradient(180deg, #17151c, #0f0e13);
    box-shadow: inset 0 1px 0 #ffffff12;
    color: #ece8f2;
  }
  .labels {
    display: grid;
    grid-template-rows: repeat(var(--lanes), minmax(0, 1fr));
    padding: 0.4rem 0;
    border-right: 1px solid #ffffff14;
  }
  .lane-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding-left: 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lane-label::before {
    content: "";
    flex: none;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: var(--c);
  }
  .track {
    position: relative;
    margin: 0.4rem 0;
    overflow: hidden;
  }
  .lane {
    position: absolute;
    inset-inline: 0;
    border-bottom: 1px solid #ffffff0a;
    background: linear-gradient(90deg, color-mix(in oklch, var(--c) 10%, transparent), transparent 30%);
  }
  .beat {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #ffffff12;
  }
  .beat.bar {
    background: #ffffff30;
  }
  .beat.end {
    width: 3px;
    background: #ffffff60;
  }
  .note {
    position: absolute;
    height: 62%;
    max-height: 1.8rem;
    transform: translate(-50%, -50%);
    border-radius: 0.45rem;
    background: var(--c);
    box-shadow: 0 0 12px color-mix(in oklch, var(--c) 55%, transparent);
  }
  .note[data-kind="accent"] {
    height: 82%;
    max-height: 2.2rem;
    box-shadow:
      0 0 18px color-mix(in oklch, var(--c) 75%, transparent),
      inset 0 0 0 2px #ffffff70;
  }
  .note[data-kind="ghost"] {
    height: 34%;
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--c);
  }
  .note[data-judged="perfect"] {
    background: white;
    box-shadow: 0 0 22px color-mix(in oklch, var(--c) 90%, white);
    opacity: 0.85;
  }
  .note[data-judged="early"],
  .note[data-judged="late"] {
    outline: 2px solid var(--warn);
    opacity: 0.8;
  }
  .note[data-judged="miss"] {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--destructive);
    opacity: 0.6;
  }
  .hitline {
    position: absolute;
    top: -0.4rem;
    bottom: -0.4rem;
    width: 3px;
    transform: translateX(-50%);
    background: white;
    box-shadow: 0 0 14px #ffffffaa;
  }
  .flash {
    position: absolute;
    top: 0.2rem;
    z-index: 1;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: #0f0e13d0;
    transform: translateX(-50%);
    font-weight: 800;
    font-size: 0.95rem;
    letter-spacing: 0.02em;
    pointer-events: none;
    animation: pop 600ms ease-out both;
    white-space: nowrap;
  }
  .flash small {
    font-size: 0.7rem;
    font-weight: 600;
  }
  .flash[data-kind="perfect"] {
    color: var(--success);
  }
  .flash[data-kind="early"],
  .flash[data-kind="late"] {
    color: var(--warn);
  }
  .flash[data-kind="miss"],
  .flash[data-kind="extra"] {
    color: var(--destructive);
  }
  .count {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 4rem;
    font-weight: 900;
    color: white;
    text-shadow: 0 0 24px #ffffff80;
    animation: count 500ms ease-out both;
    pointer-events: none;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 8px) scale(0.8);
    }
    30% {
      opacity: 1;
      transform: translate(-50%, 0) scale(1.08);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -10px) scale(1);
    }
  }
  @keyframes count {
    from {
      opacity: 0;
      transform: scale(1.6);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash,
    .count {
      animation: none;
    }
  }
  :global(html[data-reduce-motion]) .flash,
  :global(html[data-reduce-motion]) .count {
    animation: none;
  }
</style>
