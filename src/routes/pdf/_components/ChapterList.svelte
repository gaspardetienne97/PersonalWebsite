<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { fmtLong, type NarrationModel } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    model,
    chapterIndex,
    playing,
    onseek,
  }: {
    model: NarrationModel;
    chapterIndex: number;
    playing: boolean;
    onseek: (index: number) => void;
  } = $props();
</script>

<div class="list">
  {#each model.chapters as chapter, i (chapter.ci)}
    {@const active = i === chapterIndex}
    <button class="row" class:active aria-current={active ? "true" : undefined} onclick={() => onseek(i)}>
      <span class="num">{String(i + 1).padStart(2, "0")}</span>
      <span class="main">
        <span class="title">{chapter.title}</span>
        {#if active}
          <!-- The word as well as the bars: colour and movement are never the only mark. -->
          <span class="now">
            <Equalizer color="var(--n-accent)" size={12} active={playing} />
            {playing ? m.narrator_chapter_playing() : m.narrator_chapter_paused()}
          </span>
        {/if}
      </span>
      <span class="dur">{fmtLong(chapter.end - chapter.start)}</span>
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
    font-size: 12px;
    width: 20px;
    flex-shrink: 0;
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
    font-size: 12px;
    font-weight: 600;
    color: var(--n-fg-1);
  }
  .dur {
    font-size: 13px;
    color: var(--n-fg-2);
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
