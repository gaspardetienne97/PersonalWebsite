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
  <!-- The two times in a row, named once. Each row says them again for a screen reader. -->
  <div class="cols" aria-hidden="true">
    <span>{m.narrator_chapter_starts()}</span>
    <span>{m.narrator_chapter_length()}</span>
  </div>
  {#each model.chapters as chapter, i (chapter.ci)}
    {@const active = i === chapterIndex}
    <button class="row" class:active data-row aria-current={active ? "true" : undefined} onclick={() => onseek(i)}>
      <span class="num n-num">{i + 1}</span>
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
            <span class="left n-num"
              >{m.narrator_player_time_left({ time: fmtClock(Math.max(0, chapter.end - pos) / speed) })}</span
            >
          </span>
        {/if}
      </span>
      <!-- Where the chapter starts, as the scrubber counts it, and how long it runs. -->
      <span class="time n-num"><span class="n-sr">{m.narrator_chapter_starts()}</span> {fmtClock(chapter.start)}</span>
      <span class="time n-num"
        ><span class="n-sr">{m.narrator_chapter_length()}</span>
        {length((chapter.end - chapter.start) / speed)}</span
      >
    </button>
  {/each}
</div>

<style>
  /* Number, title, start, length: one set of columns for the heading and every row, as wide
     as the longest time. */
  .list {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto auto;
    column-gap: 14px;
    row-gap: 2px;
  }
  .cols,
  .row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    padding: 8px 12px;
  }
  .cols {
    position: sticky;
    top: 0;
    z-index: 1;
    padding-block: 2px 6px;
    background: var(--n-bg-3);
    border-bottom: 1px solid var(--n-border-2);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--n-fg-1);
    text-align: right;
  }
  .cols span:first-child {
    grid-column: 3;
  }
  .row {
    align-items: center;
    min-height: 48px;
    text-align: left;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    background: transparent;
    scroll-snap-align: end;
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
    font-size: 14px;
    font-weight: 500;
    text-align: right;
    color: var(--n-fg-1);
  }
  .main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  /* The whole title, on as many lines as it takes: the list scrolls. */
  .title {
    font-size: 15px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--n-fg-1);
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
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-1);
  }
  .left {
    font-weight: 500;
  }
  .left::before {
    content: "·";
    margin-right: 6px;
  }
  .time {
    min-width: 40px;
    font-size: 14px;
    font-weight: 500;
    color: var(--n-fg-1);
    text-align: right;
    white-space: nowrap;
  }
  .active .time {
    color: var(--n-fg-0);
  }
</style>
