<script lang="ts">
  import { fmt, type NarrationModel, type NarratorDoc } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    model,
    doc,
    chapterIndex,
    onseek,
    compact = false,
  }: {
    model: NarrationModel;
    doc: NarratorDoc;
    chapterIndex: number;
    onseek: (index: number) => void;
    compact?: boolean;
  } = $props();
</script>

<div class="list">
  {#each model.chapters as chapter, i (chapter.ci)}
    {@const active = i === chapterIndex}
    <button class="row" class:active class:compact onclick={() => onseek(i)}>
      <span class="num" style:color={active ? doc.accent : "var(--n-fg-3)"}>
        {String(i + 1).padStart(2, "0")}
      </span>
      <span class="title" class:active>{chapter.title}</span>
      {#if active}
        <Equalizer color={doc.accent} size={13} />
      {/if}
      <span class="dur">{fmt(chapter.end - chapter.start)}</span>
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
    text-align: left;
    padding: 11px 12px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    background: transparent;
    transition: background 200ms var(--n-ease-out);
  }
  .row.compact {
    padding: 9px 10px;
  }
  .row:hover {
    background: var(--n-bg-1);
  }
  .row.active {
    background: var(--n-bg-2);
  }
  .num {
    font-family: var(--n-font-mono);
    font-size: 12px;
    width: 18px;
  }
  .title {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--n-fg-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title.active {
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .dur {
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-3);
  }
</style>
