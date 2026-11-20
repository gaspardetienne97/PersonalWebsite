<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
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
  label={m.music_shell_nt_tab_label({ title: score.title })}
  scoreBpm={score.bpm}
  draw={(VF, host, width) => drawTab(VF, host, { score, voiceIds, range, width, tuning, fill })}
  fallback={(reason) =>
    m.music_shell_nt_tab_fallback({ tuning: tuning.name ?? m.music_shell_nt_this_tuning(), reason })}
/>
