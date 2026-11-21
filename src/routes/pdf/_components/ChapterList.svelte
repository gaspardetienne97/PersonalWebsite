<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { fmtClock, fmtLong, type NarrationModel } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    model,
    chapterIndex,
    playing,
    pos,
    speed = 1,
    onseek,
  }: {
    model: NarrationModel;
    chapterIndex: number;
    playing: boolean;
    /** The playhead, for the time left in the current chapter. */
    pos: number;
    speed?: number;
    onseek: (index: number) => void;
  } = $props();

  // To the second while a chapter is short, so three chapters do not all read "1 min".
  const length = (ms: number) => (ms < 600_000 ? fmtClock(ms) : fmtLong(ms));
</script>

<div class="list">
  {#each model.chapters as chapter, i (chapter.ci)}
    {@const active = i === chapterIndex}
    <button class="row" class:active aria-current={active ? "true" : undefined} onclick={() => onseek(i)}>
      <span class="num">{i + 1}</span>
      <span class="main">
        <span class="title">{chapter.title}</span>
        {#if active}
          <!-- The word as well as the bars: colour and movement are never the only mark. -->
          <span class="now">
            {#if playing}
              <Equalizer color="var(--n-accent)" size={12} />
            {:else}
              <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1.5" width="3" height="9" rx="1" />
                <rect x="7" y="1.5" width="3" height="9" rx="1" />
              </svg>
            {/if}
            {playing ? m.narrator_chapter_playing() : m.narrator_chapter_paused()}
            <span class="left"
              >{m.narrator_player_time_left({ time: fmtClock(Math.max(0, chapter.end - pos) / speed) })}</span
            >
          </span>
        {/if}
      </span>
      <span class="dur">{length((chapter.end - chapter.start) / speed)}</span>
    </button>
  {/each}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    text-align: left;
    padding: 8px 12px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    background: transparent;
    transition: background 200ms var(--n-ease-out);
  }
  .row:hover {
    background: var(--n-bg-2);
  }
  .row.active {
    background: var(--n-bg-2);
    box-shadow: inset 3px 0 0 var(--n-accent);
  }
  .num {
    font-family: var(--n-font-mono);
    font-size: 13px;
    width: 20px;
    flex-shrink: 0;
    text-align: right;
    color: var(--n-fg-2);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .title {
    font-size: 15px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--n-fg-1);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .active .title {
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .now {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--n-fg-1);
  }
  .left {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .left::before {
    content: "·";
    margin-right: 6px;
  }
  .dur {
    font-family: var(--n-font-mono);
    font-size: 13px;
    color: var(--n-fg-1);
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
