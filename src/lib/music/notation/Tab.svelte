<script lang="ts">
  import type { Score } from "@repo/music-core";
  import type { BeatRange, TabTuning } from "./groups";
  import { drawTab } from "./engrave";
  import NotationFrame, { type FrameProps } from "./NotationFrame.svelte";

  let {
    score,
    voiceIds,
    range,
    tuning,
    fill = false,
    selection = $bindable(null),
    ...rest
  }: FrameProps & {
    score: Score;
    voiceIds?: string[] | null;
    range?: BeatRange | null;
    /** openStrings string 1 (highest) first; `name` is used in messages. */
    tuning: TabTuning & { name?: string };
    /** Spread a short line across the whole width. */
    fill?: boolean;
  } = $props();
</script>

<NotationFrame
  {...rest}
  bind:selection
  label="Tab, {score.title}"
  scoreBpm={score.bpm}
  draw={(VF, host, width) => drawTab(VF, host, { score, voiceIds, range, width, tuning, fill })}
  fallback={(reason) =>
    `Tab can't show this music for ${tuning.name ?? "this tuning"}: ${reason}. The staff and falling notes show every note.`}
/>
