<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import {
    authorName,
    isSample,
    lengthLine,
    markMatches,
    type NarrationModel,
    type NarratorDoc,
    sampleGenre,
  } from "@repo/pdf-core/domain";

  import Cover from "./Cover.svelte";
  import Pill from "./Pill.svelte";

  let {
    doc,
    model,
    progress,
    row = false,
    listening = false,
    query = "",
    onopen,
    onstartover,
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
    /** Forget where listening stopped and open the document at its first word. */
    onstartover: (id: string) => void;
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

  // The line under a row's title, in its two parts: who wrote it, and a sample's genre.
  const by = $derived([authorName(doc), sampleGenre(doc) ?? ""].filter(Boolean));
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

<!-- The document the continue card offers is paused there: nothing plays while the library
     shows. A sample keeps its tag beside that. -->
{#snippet tags()}
  {#if listening}
    <Pill class="tag-paused" accent="var(--n-fg-0)">
      <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
        <rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" />
      </svg>
      {m.narrator_library_paused_tag()}
    </Pill>
  {/if}
  {#if isSample(doc)}
    <Pill accent="var(--n-fg-0)">{m.narrator_library_sample_tag()}</Pill>
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
  {#if row}
    <div class="art">
      <Cover {doc} size={56} radius={8} {progress} />
    </div>
  {:else}
    <!-- The cover is the one place a card writes the title, so the cover is the title button. -->
    <div class="art">
      <button class="title cover-btn" aria-label={doc.title} onclick={() => onopen(doc.id)}>
        <Cover {doc} wide size={136} radius={13} {query} {progress} />
      </button>
      <div class="art-tags">{@render tags()}</div>
    </div>
  {/if}
  <div class="meta">
    {#if row}
      <button class="title" onclick={() => onopen(doc.id)}><span>{@render marked(doc.title)}</span></button>
      {#if by.length}
        <div class="author">
          <div class="author-parts">
            {#each by as part (part)}<span>{@render marked(part)}</span>{/each}
          </div>
        </div>
      {/if}
    {/if}
    <!-- One foot for every document: how long it is, or how much of it is left. The bar that
         goes with it runs along the cover's bottom edge. The word count is the line's tip: beside
         two buttons there is room for one thing, said once. -->
    <div class="foot">
      <span class="fact" class:played={progress > 0} title={words}>{length}</span>
      {#if row}{@render tags()}{/if}
    </div>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="actions" bind:this={actions} onclick={(e) => e.stopPropagation()}>
    <button
      class="play"
      title={progress > 0 ? m.narrator_library_resume() : m.narrator_doc_listen()}
      aria-label={m.narrator_doc_play({ title: doc.title })}
      onclick={() => onopen(doc.id)}
    >
      <Play size={row ? 18 : 16} strokeWidth={2} fill="currentColor" />
    </button>
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
        <!-- The play button beside "More" already resumes a started document: the menu offers
             the other way in, from the first word. -->
        {#if progress > 0}
          <button {@attach (node) => node.focus()} onclick={() => onstartover(doc.id)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
            </svg>
            {m.narrator_doc_start_over()}
          </button>
        {:else}
          <button {@attach (node) => node.focus()} onclick={() => onopen(doc.id)}>
            <Play size={16} strokeWidth={1.75} />
            {m.narrator_doc_listen()}
          </button>
        {/if}
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
  /* A tile: the cover across the top with the title on it, then one foot. */
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-2);
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
    box-shadow: var(--n-shadow-sm);
  }
  .card.hover {
    transform: translateY(-3px);
    background: var(--n-bg-2);
    box-shadow: var(--n-shadow-md);
    border-color: var(--n-border-3);
  }
  /* The document the continue card offers: an edge in the progress colour, beside its tag. */
  .card.listening {
    border-color: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 60%, transparent);
  }
  /* An open menu hangs past the card: keep it over the cards that follow, and over the
     library's "Removed, Undo" bar (z-index 40) when the card is the last one above it. */
  .card.menu-open {
    z-index: 45;
  }
  .art {
    position: relative;
    flex-shrink: 0;
  }
  .cover-btn {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    border-radius: 13px 13px 0 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  /* The tags a card may carry sit in the cover's corner, across from the format. */
  .art-tags {
    position: absolute;
    top: 9px;
    right: 10px;
    display: flex;
    gap: 6px;
    pointer-events: none;
  }
  .card :global(.tag-paused) {
    border-color: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 60%, transparent);
    background: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 22%, var(--n-bg-1));
  }
  .meta {
    width: 100%;
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
    /* The foot is as tall as the buttons at its right, which it leaves room for. */
    min-height: 64px;
    padding: 10px 108px 10px 14px;
  }
  .row .title {
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
  /* Three lines hold the longest sample title beside the two buttons, uncut. */
  .row .title span {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
    /* No last line of one short word ("Ch." then "1"). */
    text-wrap: pretty;
  }
  /* The author, a dot, the genre. Where both do not fit one line the genre takes the next,
     nothing is cut, and the dot before it is clipped away at the row's left edge. */
  .author {
    overflow: hidden;
    color: var(--n-fg-1);
    font-size: 14px;
    line-height: 1.35;
    margin-top: 2px;
  }
  /* Every part carries its dot in a 1em lead, and the line starts 1em to the left: the lead
     of whichever part begins a line falls outside and is clipped. */
  .author-parts {
    display: flex;
    flex-wrap: wrap;
    margin-left: -1em;
  }
  .author span {
    position: relative;
    padding-left: 1em;
    overflow-wrap: anywhere;
  }
  .author span::before {
    content: "·";
    position: absolute;
    left: 0;
    width: 1em;
    text-align: center;
  }
  /* The letters a search matched: bright text on a filled mark, with an underline, so not by
     colour alone. The same mark as on a cover. */
  mark {
    background: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 72%, #000);
    color: var(--n-on-accent, #fff);
    border-radius: 3px;
    padding: 0 1px;
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
  }
  .foot {
    display: flex;
    min-width: 0;
  }
  /* One line where it fits. A longer one ("1 h 2 min left of 1 h 4 min", or the French) takes
     two even lines, inside the height the buttons already give the foot. */
  .fact {
    font-size: 14px;
    line-height: 1.35;
    font-weight: 600;
    color: var(--n-fg-1);
    text-wrap: balance;
    font-variant-numeric: tabular-nums;
  }
  .fact.played {
    color: var(--n-fg-0);
  }
  /* Play, then the button for more, at the foot's right. */
  .actions {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: default;
  }
  .play {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    /* The triangle sits a little right of centre to look centred. */
    padding: 0 0 0 2px;
    background: var(--n-bg-3);
    border: 1.5px solid var(--n-border-3);
    color: var(--n-fg-0);
    cursor: pointer;
    transition:
      background 160ms var(--n-ease-out),
      border-color 160ms var(--n-ease-out);
  }
  .play:hover {
    background: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 30%, var(--n-bg-3));
    border-color: var(--n-accent-app, var(--n-brand-blue));
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
  .play:focus-visible,
  .more:focus-visible,
  .menu button:focus-visible,
  .title:focus-visible,
  .cancel:focus-visible,
  .remove:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }

  /* Phone: a row. Small cover, the text, then play and the button for more at the right. */
  .card.row {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 12px 114px 12px 12px;
    min-height: 98px;
    border-color: var(--n-border-1);
  }
  .card.row.listening {
    border-color: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 60%, transparent);
  }
  .card.row.hover {
    transform: none;
  }
  .row .meta {
    min-height: 0;
    padding: 0;
  }
  /* In a row the tags follow the time. */
  .row .foot {
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    padding-top: 5px;
  }
  .row .play {
    width: 44px;
    height: 44px;
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
    padding: 16px;
    background: rgba(8, 12, 28, 0.94);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--n-border-2);
    cursor: default;
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
    font-size: 14px;
    color: var(--n-fg-1);
    text-align: center;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
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
  /* In a row there is no height for the second line: the question, then two buttons a thumb
     can hit. */
  .card.row.confirming {
    min-height: 124px;
  }
  .row .confirm {
    align-items: stretch;
    padding: 12px;
    gap: 8px;
  }
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
    .play,
    .more {
      transition: none;
    }
    .card.hover {
      transform: none;
    }
  }
</style>
