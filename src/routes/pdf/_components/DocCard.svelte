<script lang="ts">
  import Clock from "@lucide/svelte/icons/clock";
  import Play from "@lucide/svelte/icons/play";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import {
    byline,
    isSample,
    lengthLine,
    markMatches,
    type NarrationModel,
    type NarratorDoc,
  } from "@repo/pdf-core/domain";

  import Cover from "./Cover.svelte";
  import Equalizer from "./Equalizer.svelte";
  import Pill from "./Pill.svelte";
  import ProgressRing from "./ProgressRing.svelte";

  let {
    doc,
    model,
    progress,
    row = false,
    listening = false,
    query = "",
    onopen,
    onremove,
  }: {
    doc: NarratorDoc;
    model: NarrationModel;
    progress: number;
    /** A phone-width row (small cover beside the text) instead of a tile. */
    row?: boolean;
    /** This is the document the continue card offers. */
    listening?: boolean;
    /** The library search, so the letters that matched are marked. */
    query?: string;
    onopen: (id: string) => void;
    onremove: (id: string) => void;
  } = $props();

  let hover = $state(false);
  let menu = $state(false);
  let confirming = $state(false);
  let more = $state<HTMLButtonElement | null>(null);
  let actions = $state<HTMLDivElement | null>(null);
  let card = $state<HTMLDivElement | null>(null);

  function closeMenu() {
    if (!menu) return;
    menu = false;
    more?.focus();
  }

  /** Back out of the confirmation, with focus back on the button that led to it. */
  function keep() {
    if (!confirming) return;
    confirming = false;
    more?.focus();
  }

  const line = $derived(byline(doc));
  const length = $derived(lengthLine(model.total, progress));
  const words = $derived(
    m.narrator_library_words({ count: model.tokens.length, shown: formatNumber(model.tokens.length) }),
  );
</script>

<!-- The menu and the question close on a press anywhere else. No fixed backdrop: see AGENTS.md.
     Not on the pointer leaving: the menu hangs past a row, so the pointer is often outside. -->
<svelte:window
  onpointerdown={(e) => {
    if (menu && !actions?.contains(e.target as Node)) menu = false;
    if (confirming && !card?.contains(e.target as Node)) confirming = false;
  }}
/>

{#snippet marked(text: string)}
  {#each markMatches(text, query) as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet tag()}
  {#if listening}
    <Pill class="tag-listening" accent="var(--n-fg-0)">
      <Equalizer size={11} active={false} />
      {m.narrator_library_listening_tag()}
    </Pill>
  {:else if isSample(doc)}
    <Pill accent="var(--n-fg-1)">{m.narrator_library_sample_tag()}</Pill>
  {/if}
{/snippet}

<!-- The whole card is a convenience click target; the title button carries the
     accessible/keyboard affordance so nested buttons keep their roles. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={card}
  class="card"
  class:row
  class:hover
  class:confirming
  class:listening
  class:menu-open={menu}
  onclick={() => !confirming && onopen(doc.id)}
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    if (menu) closeMenu();
    else keep();
  }}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
>
  <div class="art">
    <Cover {doc} size={row ? 56 : 132} radius={row ? 8 : 12} />
  </div>
  <div class="meta">
    <button class="title" onclick={() => onopen(doc.id)}><span>{@render marked(doc.title)}</span></button>
    {#if line}
      <div class="author">{@render marked(line)}</div>
    {/if}
    <div class="foot">
      <span class="fact" class:played={progress > 0}>
        {#if progress > 0}
          <ProgressRing value={progress} size={16} stroke={2.5} color="var(--n-accent-app, var(--n-brand-blue))" />
        {:else}
          <Clock size={14} strokeWidth={1.75} />
        {/if}
        {length}
      </span>
      <span class="fact">{words}</span>
      {@render tag()}
    </div>
  </div>
  {#if row}
    <!-- The row itself opens the document; this says so. -->
    <span class="play-mark" aria-hidden="true"><Play size={15} strokeWidth={2} /></span>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="actions" bind:this={actions} onclick={(e) => e.stopPropagation()}>
    <button
      bind:this={more}
      class="more"
      title={m.narrator_doc_more_title()}
      aria-label={m.narrator_doc_more({ title: doc.title })}
      aria-expanded={menu}
      onclick={() => (menu = !menu)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
      </svg>
    </button>
    {#if menu}
      <div class="menu" role="group" aria-label={m.narrator_doc_more({ title: doc.title })}>
        <button {@attach (node) => node.focus()} onclick={() => onopen(doc.id)}>
          <Play size={16} strokeWidth={1.75} />
          {progress > 0 ? m.narrator_library_resume() : m.narrator_doc_listen()}
        </button>
        <button
          class="danger"
          aria-label={m.narrator_doc_remove_label({ title: doc.title })}
          onclick={() => {
            menu = false;
            confirming = true;
          }}
        >
          <Trash2 size={16} strokeWidth={1.75} />
          {m.narrator_doc_remove_title()}
        </button>
      </div>
    {/if}
  </div>

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
        <!-- Focus moves here, so a keyboard press on Remove lands on the safe answer. -->
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
    gap: 14px;
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
  /* The document the continue card offers: an edge in the progress colour, beside its tag. */
  .card.listening {
    border-color: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 55%, transparent);
  }
  /* An open menu hangs past the card: keep it over the cards that follow. */
  .card.menu-open {
    z-index: 6;
  }
  .art {
    position: relative;
    flex-shrink: 0;
  }
  .card :global(.tag-listening) {
    border-color: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 60%, transparent);
    background: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 22%, var(--n-bg-1));
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
    font-size: 13.5px;
    line-height: 1.35;
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The letters a search matched: a filled mark and an underline, so not by colour alone. */
  mark {
    background: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 38%, transparent);
    color: var(--n-fg-0);
    border-radius: 3px;
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
  }
  /* Length, then the word count, then the one tag a card may carry. The button for more sits
     at their right. */
  .foot {
    display: flex;
    align-items: center;
    align-content: center;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: auto;
    padding: 12px 52px 0 0;
    min-height: 56px;
    box-sizing: content-box;
  }
  .fact {
    font-size: 13.5px;
    color: var(--n-fg-2);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .fact.played {
    color: var(--n-fg-0);
    font-weight: 600;
  }
  .actions {
    position: absolute;
    right: 10px;
    bottom: 10px;
    cursor: default;
  }
  .more {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
    cursor: pointer;
    transition:
      background 160ms var(--n-ease-out),
      border-color 160ms var(--n-ease-out);
  }
  .more:hover,
  .more[aria-expanded="true"] {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
  }
  .menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 7;
    min-width: 210px;
    display: flex;
    flex-direction: column;
    padding: 6px;
    border-radius: 12px;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-3);
    box-shadow: var(--n-shadow-lg);
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--n-fg-0);
    font-size: 14px;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--n-bg-3);
  }
  /* The danger red, lightened until it passes 4.5:1 on the menu. The bin says it too. */
  .menu .danger {
    color: color-mix(in srgb, var(--n-danger) 62%, #fff);
  }
  .more:focus-visible,
  .menu button:focus-visible,
  .title:focus-visible,
  .cancel:focus-visible,
  .remove:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }

  /* Phone: a row. Small cover, the text, a play mark, and the button for more at the right. */
  .card.row {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 12px 62px 12px 12px;
    min-height: 98px;
  }
  .card.row.hover {
    transform: none;
  }
  .row .foot {
    padding: 6px 0 0;
    min-height: 0;
    gap: 4px 10px;
  }
  .play-mark {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
    padding-left: 2px;
    border: 1.5px solid var(--n-border-3);
    color: var(--n-fg-0);
  }
  .row .actions {
    top: 50%;
    right: 10px;
    bottom: auto;
    transform: translateY(-50%);
  }
  .row .menu {
    top: calc(100% + 6px);
    bottom: auto;
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
  @media (prefers-reduced-motion: reduce) {
    .card,
    .more {
      transition: none;
    }
    .card.hover {
      transform: none;
    }
  }
</style>
