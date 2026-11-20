<script lang="ts" module>
  // How far ahead and what the bars say, kept per browser for every falling-notes view.
  const KEY = "woodshed.falling";
  function saved(): { bars?: number; labels?: string } {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {
      return {};
    }
  }
  export const fallingPrefs = $state({ bars: 2, labels: "none" as "none" | "names" | "fingers" });
  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    const s = saved();
    if ([1, 2, 4].includes(s.bars ?? 0)) fallingPrefs.bars = s.bars!;
    if (s.labels === "names" || s.labels === "fingers" || s.labels === "none") fallingPrefs.labels = s.labels;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(fallingPrefs));
    } catch {
      /* private window: the choice lasts this page */
    }
  }
</script>

<script lang="ts">
  // Falling notes with the keyboard right under them, in one block that
  // scrolls sideways together on a phone: the lanes sit over the keys because
  // both are laid out from the same white-key grid. Keys light as their bar
  // reaches them, unless the drill has its own mark for that key.
  import { onMount } from "svelte";
  import type { Score } from "@repo/music-core";
  import Piano from "#lib/music/components/Piano.svelte";
  import type { CellMarks, Flashes } from "#lib/music/components/feedback.svelte.ts";
  import Waterfall from "./Waterfall.svelte";
  import { barBeats, whiteKeyLayout } from "./groups";
  import { fallingNotes, sounding } from "./falling";
  import type { GroupState } from "./NotationFrame.svelte";

  let {
    score,
    voiceIds = null,
    low,
    high,
    beat,
    rest = 0,
    groupStates = {},
    marks = {},
    flashes,
    height = "min(44dvh, 22rem)",
    label = "Piano keyboard under the falling notes",
    minKey = 30,
  }: {
    score: Score;
    voiceIds?: string[] | null;
    low: number;
    high: number;
    /** The clock in score beats; null when nothing is playing. */
    beat: number | null;
    /** Where the lane rests when nothing plays. */
    rest?: number;
    groupStates?: Record<number, GroupState>;
    marks?: Record<number, CellMarks>;
    flashes?: Flashes;
    height?: string;
    label?: string;
    minKey?: number;
  } = $props();

  onMount(load);
  const keys = $derived(whiteKeyLayout(low, high));
  const whites = $derived(Object.values(keys).filter((k) => !k.black).length);
  const notes = $derived(fallingNotes(score, voiceIds, keys));
  const at = $derived(beat ?? rest);
  const barLen = $derived(barBeats(score.meter));
  // The lane grows with the look ahead (48 px a beat, up to about half the screen), past which it shows fewer beats.
  const look = $derived(fallingPrefs.bars * barLen);
  const fingered = $derived(notes.some((n) => n.finger !== undefined));
  const labels = $derived(fallingPrefs.labels === "fingers" && !fingered ? "none" : fallingPrefs.labels);

  // While playing, a key lights in its hand's colour as its bar reaches it.
  const lit = $derived.by(() => {
    if (beat === null) return marks;
    const out = { ...marks };
    for (const n of notes) if (!out[n.midi] && sounding(n, beat)) out[n.midi] = { demo: true, role: n.side };
    return out;
  });

  // Keys flashing right or wrong burst at the hit line too.
  const hits = $derived.by(() => {
    const out: Record<number, "correct" | "wrong"> = {};
    for (let m = low; m <= high; m++) {
      const f = flashes?.get(m);
      if (f) out[m] = f;
    }
    return out;
  });

  // On a narrow screen, keep the next bar's notes in view.
  let scroller = $state<HTMLDivElement>();
  const span = $derived.by(() => {
    const soon = notes.filter((n) => n.start + n.dur > at && n.start < at + barLen);
    return soon.length ? `${Math.min(...soon.map((n) => n.x))}:${Math.max(...soon.map((n) => n.x + n.width))}` : "";
  });
  let viewW = $state(0);
  $effect(() => {
    if (!scroller || !span || !viewW || scroller.scrollWidth <= viewW) return;
    const [lo, hi] = span.split(":").map(Number);
    const inner = scroller.scrollWidth - 16;
    const left = 8 + lo * inner;
    const right = 8 + hi * inner;
    const view = scroller.scrollLeft;
    if (left >= view && right <= view + scroller.clientWidth) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    scroller.scrollTo({ left: (left + right) / 2 - scroller.clientWidth / 2, behavior: still ? "auto" : "smooth" });
  });

  const pick = (patch: Partial<typeof fallingPrefs>) => {
    Object.assign(fallingPrefs, patch);
    save();
  };
  const seg = "min-h-9 rounded-full px-3 text-sm font-medium";
  const on = "bg-ws-stage-ink text-ws-stage";
  const off = "text-ws-stage-soft hover:text-ws-stage-ink";
</script>

<div class="flex min-w-0 flex-col gap-2" data-testid="falling-notes">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-1 rounded-full bg-ws-stage-ink/8 p-1" role="group" aria-label="Look ahead">
      <span class="px-2 text-sm text-ws-stage-soft">Look ahead</span>
      {#each [1, 2, 4] as b (b)}
        <button type="button" class="{seg} {fallingPrefs.bars === b ? on : off}" aria-pressed={fallingPrefs.bars === b} onclick={() => pick({ bars: b })}>{b} bar{b === 1 ? "" : "s"}</button>
      {/each}
    </div>
    <div class="flex items-center gap-1 rounded-full bg-ws-stage-ink/8 p-1" role="group" aria-label="On the notes">
      {#each [{ id: "none", text: "Plain" }, { id: "names", text: "Names" }, ...(fingered ? [{ id: "fingers", text: "Fingers" }] : [])] as o (o.id)}
        <button type="button" class="{seg} {labels === o.id ? on : off}" aria-pressed={labels === o.id} onclick={() => pick({ labels: o.id as typeof fallingPrefs.labels })}>{o.text}</button>
      {/each}
    </div>
  </div>
  <div bind:this={scroller} bind:clientWidth={viewW} class="overflow-x-auto overscroll-x-contain rounded-xl">
    <div style:min-width="{whites * minKey + 16}px">
      <div class="px-2">
        <Waterfall {score} {voiceIds} {low} {high} beat={at} lookaheadBeats={look} {groupStates} height="max({height}, min({look * 48}px, 55dvh))" {labels} playing={beat !== null} {hits} />
      </div>
      <Piano {low} {high} marks={lit} {flashes} {minKey} {label} />
    </div>
  </div>
</div>
