<script lang="ts">
  import Clock from "@lucide/svelte/icons/clock";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import {
    byline,
    fmtLong,
    formatLabel,
    isSample,
    type NarrationModel,
    type NarratorDoc,
  } from "@repo/pdf-core/domain";

  import Cover from "./Cover.svelte";
  import Pill from "./Pill.svelte";
  import ProgressRing from "./ProgressRing.svelte";

  let {
    doc,
    model,
    progress,
    row = false,
    onopen,
    onremove,
  }: {
    doc: NarratorDoc;
    model: NarrationModel;
    progress: number;
    /** A phone-width row (small cover beside the text) instead of a tile. */
    row?: boolean;
    onopen: (id: string) => void;
    onremove: (id: string) => void;
  } = $props();

  let hover = $state(false);
  let confirming = $state(false);
  let bin = $state<HTMLButtonElement | null>(null);

  /** Back out of the confirmation, with focus back on the bin that opened it. */
  function keep() {
    if (!confirming) return;
    confirming = false;
    bin?.focus();
  }

  const line = $derived(byline(doc));
  // Anything played shows as at least 1%, so a ring is never beside "0%".
  const percent = $derived(
    formatNumber(Math.max(0.01, progress), { style: "percent", maximumFractionDigits: 0 }),
  );
</script>

<!-- The whole card is a convenience click target; the title button carries the
     accessible/keyboard affordance so nested buttons keep their roles. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="card"
  class:row
  class:hover
  class:confirming
  onclick={() => !confirming && onopen(doc.id)}
  onkeydown={(e) => e.key === "Escape" && keep()}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => {
    hover = false;
    confirming = false;
  }}
>
  <div class="art">
    <Cover {doc} size={row ? 56 : 150} radius={row ? 8 : 12} />
  </div>
  <div class="meta">
    <button class="title" onclick={() => onopen(doc.id)}><span>{doc.title}</span></button>
    {#if line}
      <div class="author">{line}</div>
    {/if}
    <div class="foot">
      <div class="facts">
        <span class="fact"><Clock size={13} strokeWidth={1.5} />{fmtLong(model.total)}</span>
        {#if progress > 0}
          <span class="fact played">
            <ProgressRing value={progress} size={16} stroke={2.5} color="var(--n-accent-app, var(--n-brand-blue))" />
            {percent}
          </span>
        {/if}
      </div>
      <div class="tags">
        <Pill>{formatLabel(doc)}</Pill>
        {#if isSample(doc)}
          <Pill accent="var(--n-fg-1)">{m.narrator_library_sample_tag()}</Pill>
        {/if}
      </div>
    </div>
  </div>
  <button
    bind:this={bin}
    class="trash"
    class:visible={hover && !confirming}
    title={m.narrator_doc_remove_title()}
    aria-label={m.narrator_doc_remove_label({ title: doc.title })}
    onclick={(e) => {
      e.stopPropagation();
      confirming = true;
    }}
  >
    <Trash2 size={16} strokeWidth={1.5} />
  </button>

  {#if confirming}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
    <div
      class="confirm"
      role="group"
      aria-label={m.narrator_doc_confirm_title({ title: doc.title })}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="confirm-icon"><Trash2 size={20} strokeWidth={1.5} /></div>
      <div class="confirm-title">{m.narrator_doc_confirm_title({ title: doc.title })}</div>
      <div class="confirm-sub">{m.narrator_doc_confirm_sub()}</div>
      <div class="confirm-actions">
        <!-- Focus moves here, so a keyboard press on the bin lands on the safe answer. -->
        <button class="cancel" {@attach (node) => node.focus()} onclick={keep}>
          {m.narrator_cancel()}
        </button>
        <button class="remove" onclick={() => onremove(doc.id)}>{m.narrator_doc_remove()}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px;
    border-radius: 14px;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
    box-shadow: var(--n-shadow-sm);
  }
  .card.hover {
    transform: translateY(-3px);
    background: var(--n-bg-2);
    box-shadow: var(--n-shadow-md);
    border-color: var(--n-border-2);
  }
  .art {
    position: relative;
    flex-shrink: 0;
  }
  .trash {
    position: absolute;
    /* Over the cover's top corner: the cover is 150 wide, centred in the tile. */
    top: 22px;
    right: calc(50% - 69px);
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: rgba(2, 6, 24, 0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-1);
    cursor: pointer;
    transition: opacity 160ms var(--n-ease-out);
    opacity: 0;
  }
  /* Any focus shows it, so the keyboard reaches a bin it can see. */
  .trash.visible,
  .trash:focus {
    opacity: 1;
  }
  /* A touch screen has no hover to reveal it, and needs a bigger target. */
  @media (hover: none), (any-pointer: coarse) {
    .trash {
      opacity: 1;
      width: 44px;
      height: 44px;
      top: 18px;
      right: calc(50% - 73px);
    }
  }
  .trash:hover {
    color: var(--n-danger);
    border-color: var(--n-danger);
  }
  .trash:focus-visible,
  .title:focus-visible,
  .cancel:focus-visible,
  .remove:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }
  .meta {
    width: 100%;
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    text-align: left;
  }
  .title {
    font-weight: 700;
    font-size: 15px;
    line-height: 1.3;
    color: var(--n-fg-0);
    background: none;
    border: none;
    border-radius: 4px;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    min-width: 0;
  }
  .title span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .author {
    color: var(--n-fg-2);
    font-size: 13px;
    line-height: 1.35;
    margin-top: 3px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: auto;
    padding-top: 12px;
  }
  .facts,
  .tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 12px;
  }
  .tags {
    gap: 6px;
  }
  .fact {
    font-size: 13px;
    color: var(--n-fg-2);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .fact.played {
    color: var(--n-fg-1);
    font-weight: 600;
  }

  /* Phone: a row. Small cover, the text, and the bin always in reach at the right. */
  .card.row {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 12px 60px 12px 12px;
    min-height: 100px;
  }
  .card.row.hover {
    transform: none;
  }
  .row .author {
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  .row .foot {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin-top: 0;
    padding-top: 8px;
  }
  .row .trash {
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    opacity: 1;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-color: transparent;
    color: var(--n-fg-2);
  }

  .confirm {
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 18px;
    background: rgba(8, 12, 28, 0.94);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--n-border-2);
    cursor: default;
  }
  .confirm-icon {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: rgba(239, 68, 68, 0.14);
    color: var(--n-danger);
  }
  .confirm-title {
    font-weight: 700;
    font-size: 15px;
    line-height: 1.3;
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .confirm-sub {
    font-size: 13px;
    color: var(--n-fg-2);
    text-align: center;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .cancel,
  .remove {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--n-font-sans);
  }
  .cancel {
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
  }
  .remove {
    border: 1px solid transparent;
    /* The danger red, darkened until white text on it passes 4.5:1. */
    background: color-mix(in srgb, var(--n-danger) 78%, #000);
    color: #fff;
  }
  /* In a row there is no height for the icon and the second line: the question, then two
     buttons a thumb can hit. */
  .card.row.confirming {
    min-height: 124px;
  }
  .row .confirm {
    align-items: stretch;
    padding: 12px;
    gap: 8px;
  }
  .row .confirm-icon,
  .row .confirm-sub {
    display: none;
  }
  .row .confirm-title {
    text-align: left;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .row .confirm-actions {
    margin-top: 0;
  }
  .row .cancel,
  .row .remove {
    flex: 1;
  }
</style>
