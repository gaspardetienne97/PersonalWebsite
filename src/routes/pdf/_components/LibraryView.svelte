<script lang="ts">
  import BookOpen from "@lucide/svelte/icons/book-open";
  import FileText from "@lucide/svelte/icons/file-text";
  import Mic from "@lucide/svelte/icons/mic";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import Quote from "@lucide/svelte/icons/quote";
  import Search from "@lucide/svelte/icons/search";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Type from "@lucide/svelte/icons/type";
  import Upload from "@lucide/svelte/icons/upload";
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { authorName, fmtLong, isSample, type DocKind, type NarratorDoc } from "@repo/pdf-core/domain";
  import type { NarratorLibrary } from "@repo/pdf-core/stores/library";

  import logoUrl from "../logo-G.svg";
  import Btn from "./Btn.svelte";
  import Cover from "./Cover.svelte";
  import DocCard from "./DocCard.svelte";
  import Notice from "./Notice.svelte";
  import Pill from "./Pill.svelte";

  let {
    library,
    onopen,
    onadd,
  }: {
    library: NarratorLibrary;
    onopen: (id: string) => void;
    /** Opens the add modal, on a given tab when a format shortcut was pressed. */
    onadd: (tab?: DocKind) => void;
  } = $props();

  // One switch for the phone layout: documents become rows and the continue card goes compact.
  const phone = new MediaQuery("(max-width: 560px)");

  const SHORTCUTS = [
    { id: "pdf", icon: FileText, label: "PDF" },
    { id: "epub", icon: BookOpen, label: "EPUB" },
    { id: "txt", icon: Type, label: m.narrator_add_tab_txt() },
    { id: "paste", icon: Quote, label: m.narrator_kind_paste() },
  ] as const;

  /** How long the Undo notice stays after a removal. */
  const UNDO_MS = 8000;

  let query = $state("");

  const q = $derived(query.trim().toLowerCase());
  const filtered = $derived(
    q ? library.docs.filter((d) => (d.title + d.author).toLowerCase().includes(q)) : library.docs,
  );
  const inProgress = $derived(library.inProgress);
  const empty = $derived(library.docs.length === 0);
  const firstSample = $derived(library.docs.find(isSample));
  // The invitation is for a listener who has added nothing yet.
  const invite = $derived(!inProgress && library.docs.every(isSample));
  const onlySamples = $derived(!empty && library.docs.every(isSample));

  function heroChapter(doc: NarratorDoc) {
    const model = library.modelFor(doc);
    const pos = library.progressOf(doc) * model.total;
    return model.chapters.find((c) => pos < c.end) ?? model.chapters[0];
  }

  const percent = (value: number) =>
    formatNumber(Math.max(0.01, value), { style: "percent", maximumFractionDigits: 0 });

  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  function holdUndo() {
    clearTimeout(undoTimer);
  }
  function startUndo() {
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => library.forgetRemoved(), UNDO_MS);
  }
  function remove(id: string) {
    library.remove(id);
    startUndo();
  }
  function undo() {
    clearTimeout(undoTimer);
    library.undoRemove();
  }
  onDestroy(() => {
    clearTimeout(undoTimer);
    library.forgetRemoved();
  });
</script>

<div class="page">
  <header class="bar">
    <div class="brand">
      <!-- Narrator runs full screen outside the site chrome; its logo is the way home. -->
      <a href="/" class="home-link" aria-label={m.narrator_library_home()}>
        <img src={logoUrl} width="30" height="30" alt="" />
      </a>
      <div class="wordmark">
        <h1>narrator</h1>
        <span>{m.narrator_library_tagline()}</span>
      </div>
    </div>
    <div class="search-wrap">
      <Search size={16} strokeWidth={1.5} style="color: var(--n-fg-2)" />
      <input bind:value={query} placeholder={m.narrator_library_search()} aria-label={m.narrator_library_search()} />
    </div>
    <a class="icon-btn" href="/pdf/settings" title={m.narrator_voice_settings()} aria-label={m.narrator_voice_settings()}>
      <SlidersHorizontal size={18} strokeWidth={1.5} />
    </a>
    <Btn variant="primary" onclick={() => onadd()}>
      <Plus size={18} strokeWidth={1.5} /> <span class="add-label">{m.narrator_add_document()}</span>
    </Btn>
  </header>

  <main class="main">
    {#if !q}
      {#if inProgress}
        {@const doc = inProgress}
        {@const model = library.modelFor(doc)}
        {@const progress = library.progressOf(doc)}
        {@const ch = heroChapter(doc)}
        {@const author = authorName(doc)}
        <section class="hero" aria-label={m.narrator_library_continue()}>
          <Cover {doc} size={phone.current ? 64 : 132} radius={phone.current ? 10 : 16} />
          <div class="hero-body">
            <div class="hero-text">
              <div class="eyebrow">{m.narrator_library_continue()}</div>
              <h2>{doc.title}</h2>
              <p class="hero-sub">{author}{author && ch ? " · " : ""}{ch ? ch.title : ""}</p>
            </div>
            <div class="hero-progress">
              <div class="track"><div style:width="{progress * 100}%"></div></div>
              <span class="hero-percent">{percent(progress)}</span>
              <span>{m.narrator_library_time_left({ time: fmtLong(model.total * (1 - progress)) })}</span>
            </div>
            <div class="hero-actions">
              <Btn variant="primary" class="hero-main" onclick={() => onopen(doc.id)}>
                <Play size={18} strokeWidth={1.5} /> {m.narrator_library_resume()}
              </Btn>
              {#if doc.voice}
                <Pill class="hero-voice"><Mic size={13} strokeWidth={1.5} /> {doc.voice}</Pill>
              {/if}
            </div>
          </div>
        </section>
      {:else if invite}
        <div class="add-hero-border">
          <section class="add-hero" aria-labelledby="n-invite-title">
            <div class="add-hero-glow"></div>
            <div class="add-hero-icon"><Upload size={44} strokeWidth={1.5} style="color: #fff" /></div>
            <div class="hero-body">
              <div class="eyebrow invite-eyebrow">{m.narrator_library_get_started()}</div>
              <h2 id="n-invite-title">{m.narrator_library_add_first()}</h2>
              <p class="add-hero-sub">
                {m.narrator_library_add_first_sub()}
              </p>
              <div class="hero-actions">
                <Btn variant="primary" class="hero-main" onclick={() => onadd()}>
                  <Plus size={18} strokeWidth={1.5} /> {m.narrator_add_document()}
                </Btn>
                {#if firstSample}
                  {@const sample = firstSample}
                  <Btn class="hero-main" onclick={() => onopen(sample.id)}>
                    <Play size={16} strokeWidth={1.5} /> {m.narrator_library_try_sample()}
                  </Btn>
                {/if}
              </div>
              <div class="shortcuts" role="group" aria-labelledby="n-shortcuts-label">
                <span class="shortcuts-label" id="n-shortcuts-label">{m.narrator_library_shortcuts()}</span>
                <div class="shortcut-list">
                  {#each SHORTCUTS as s (s.id)}
                    <button class="shortcut" onclick={() => onadd(s.id)}>
                      <s.icon size={16} strokeWidth={1.5} />
                      {s.label}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </section>
        </div>
      {/if}
    {/if}

    <div class="lib-head">
      <h3>{m.narrator_library_heading()}</h3>
      <span>{m.narrator_library_count({ count: filtered.length })}</span>
      {#if onlySamples && !q}
        <p class="samples-note">{m.narrator_library_samples_note()}</p>
      {/if}
    </div>

    {#if empty && !q}
      <div class="empty quiet">
        <div class="empty-text">
          <div class="empty-title">{m.narrator_library_empty_title()}</div>
          <div class="empty-sub">{m.narrator_library_empty_sub()}</div>
        </div>
        <Btn onclick={() => library.restoreSamples()}>{m.narrator_library_restore_samples()}</Btn>
      </div>
    {:else if filtered.length === 0}
      <div class="empty" role="status">
        <div class="empty-icon"><Search size={26} strokeWidth={1.5} style="color: var(--n-fg-2)" /></div>
        <div class="empty-title">{m.narrator_library_no_match_title({ query: query.trim() })}</div>
        <div class="empty-sub">{m.narrator_library_no_match_sub()}</div>
        <Btn class="empty-add" onclick={() => (query = "")}>{m.narrator_library_clear_search()}</Btn>
      </div>
    {:else}
      <div class="grid" class:rows={phone.current}>
        {#each filtered as doc (doc.id)}
          <DocCard
            {doc}
            model={library.modelFor(doc)}
            progress={library.progressOf(doc)}
            row={phone.current}
            {onopen}
            onremove={remove}
          />
        {/each}
        <!-- With the invitation above, a second "Add document" in the page would repeat it. -->
        {#if !q && !invite}
          <button class="add-card" onclick={() => onadd()}>
            <div class="add-card-icon"><Plus size={24} strokeWidth={1.5} /></div>
            <div class="add-card-text">
              <div class="add-card-title">{m.narrator_add_document()}</div>
              <div class="add-card-sub">{m.narrator_library_add_card_sub()}</div>
            </div>
          </button>
        {/if}
      </div>
    {/if}
  </main>

  {#if library.removed}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="toast" onpointerenter={holdUndo} onpointerleave={startUndo} onfocusin={holdUndo} onfocusout={startUndo}>
      <Notice tone="info" actions={[{ label: m.narrator_library_undo(), onclick: undo, primary: true }]}>
        {m.narrator_library_removed({ title: library.removed.doc.title })}
      </Notice>
    </div>
  {/if}
</div>

<style>
  .page {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .bar {
    height: 64px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 clamp(16px, 4vw, 48px);
    background: rgba(2, 6, 24, 0.72);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    border-bottom: 1px solid var(--n-border-1);
  }
  .home-link {
    display: flex;
    border-radius: 8px;
  }
  .home-link:focus-visible,
  .icon-btn:focus-visible,
  .shortcut:focus-visible,
  .add-card:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 3px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .wordmark {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }
  .wordmark h1 {
    margin: 0;
    font-family: var(--n-font-sans);
    font-weight: 800;
    font-size: 19px;
    letter-spacing: -0.025em;
    color: var(--n-fg-0);
  }
  .wordmark span {
    font-family: var(--n-font-mono);
    font-size: 12px;
    color: var(--n-fg-2);
    letter-spacing: 0.08em;
    margin-top: 3px;
    white-space: nowrap;
  }
  .search-wrap {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 14px;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    border-radius: 999px;
    width: min(280px, 30vw);
  }
  .search-wrap input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--n-fg-0);
    font-family: var(--n-font-sans);
    font-size: 14px;
    padding: 0;
  }
  .search-wrap input::placeholder {
    color: var(--n-fg-2);
  }
  /* The site's forms plugin rings every focused text input, square. The pill shows focus instead. */
  .search-wrap input:focus {
    box-shadow: none;
  }
  .search-wrap:focus-within {
    border-color: var(--n-brand-blue);
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
    transition: all 160ms var(--n-ease-out);
  }
  .icon-btn:hover {
    color: var(--n-fg-0);
    border-color: var(--n-border-2);
    background: var(--n-bg-2);
  }
  .main {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(20px, 4vw, 40px) clamp(16px, 4vw, 48px);
    display: flex;
    flex-direction: column;
    gap: 28px;
    flex: 1;
  }
  .eyebrow {
    font-family: var(--n-font-mono);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--n-fg-1);
  }
  .invite-eyebrow {
    font-weight: 700;
    color: var(--n-link);
  }
  .hero {
    display: flex;
    gap: 28px;
    align-items: center;
    padding: 24px;
    border-radius: 20px;
    background: var(--n-glass-bg);
    backdrop-filter: var(--n-glass-blur);
    -webkit-backdrop-filter: var(--n-glass-blur);
    border: 1px solid var(--n-glass-border);
    box-shadow: var(--n-shadow-lg);
  }
  .hero-body {
    flex: 1;
    min-width: 0;
    position: relative;
  }
  .hero-text {
    min-width: 0;
  }
  .hero-body h2 {
    margin: 8px 0 4px;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--n-fg-0);
    overflow-wrap: anywhere;
  }
  .hero-sub {
    margin: 0;
    color: var(--n-fg-2);
    font-size: 15px;
  }
  .hero-progress {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 20px;
    font-size: 14px;
    color: var(--n-fg-1);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .hero-progress .track {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: var(--n-bg-3);
    overflow: hidden;
    max-width: 360px;
  }
  /* One colour for progress everywhere. A document's own colour stays on its cover. */
  .hero-progress .track div {
    height: 100%;
    border-radius: 999px;
    background: var(--n-accent-app, var(--n-brand-blue));
  }
  .hero-percent {
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .hero-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    flex-wrap: wrap;
    align-items: center;
  }
  .add-hero-border {
    border-radius: 21px;
    padding: 1.5px;
    background: var(--n-brand-gradient);
    box-shadow: var(--n-shadow-lg), var(--n-brand-glow);
  }
  .add-hero {
    display: flex;
    gap: 28px;
    align-items: center;
    padding: 24px;
    border-radius: 20px;
    position: relative;
    overflow: hidden;
    background: linear-gradient(150deg, #0e1733 0%, var(--n-bg-1) 68%);
  }
  .add-hero-glow {
    position: absolute;
    top: -60px;
    right: -40px;
    width: 280px;
    height: 220px;
    border-radius: 999px;
    background: var(--n-brand-gradient-soft);
    filter: blur(80px);
    pointer-events: none;
  }
  .add-hero-icon {
    width: 132px;
    height: 174px;
    border-radius: 16px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--n-brand-gradient);
    box-shadow:
      var(--n-brand-glow),
      inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .add-hero-sub {
    margin: 0;
    color: var(--n-fg-1);
    font-size: 15px;
    max-width: 520px;
  }
  .shortcuts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 16px;
  }
  .shortcuts-label {
    font-size: 14px;
    color: var(--n-fg-2);
  }
  .shortcut-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .shortcut {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--n-border-2);
    background: rgba(2, 6, 24, 0.4);
    color: var(--n-fg-0);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 160ms var(--n-ease-out);
  }
  .shortcut:hover {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.12);
  }
  .lib-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 8px 0 -8px;
  }
  .lib-head h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .lib-head span {
    font-size: 14px;
    color: var(--n-fg-2);
  }
  .samples-note {
    flex-basis: 100%;
    margin: 0;
    font-size: 14px;
    color: var(--n-fg-1);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 24px;
  }
  .grid.rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .add-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    border-radius: 14px;
    border: 1.5px dashed rgba(18, 145, 250, 0.4);
    background: rgba(18, 145, 250, 0.05);
    cursor: pointer;
    min-height: 240px;
    transition: all 200ms var(--n-ease-out);
    font-family: inherit;
  }
  .add-card:hover {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.12);
  }
  .add-card-icon {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--n-brand-gradient);
    color: #fff;
    transition: all 200ms var(--n-ease-out);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .add-card:hover .add-card-icon {
    box-shadow:
      var(--n-brand-glow),
      inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  }
  .add-card-title {
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .add-card-sub {
    font-size: 13px;
    color: var(--n-fg-2);
    text-align: center;
    max-width: 180px;
  }
  .rows .add-card {
    flex-direction: row;
    justify-content: flex-start;
    min-height: 68px;
    padding: 10px 12px;
  }
  .rows .add-card-icon {
    width: 44px;
    height: 44px;
  }
  .rows .add-card-text {
    text-align: left;
  }
  .rows .add-card-sub {
    text-align: left;
    max-width: none;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 56px 24px;
    border: 1.5px dashed var(--n-border-2);
    border-radius: 16px;
    background: var(--n-bg-1);
  }
  /* The empty library: one quiet line under the invitation, with the way to get the samples back. */
  .empty.quiet {
    flex-direction: row;
    justify-content: space-between;
    gap: 12px 24px;
    padding: 18px 20px;
    border: 1px solid var(--n-border-1);
  }
  .empty-icon {
    width: 60px;
    height: 60px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--n-bg-2);
    margin-bottom: 4px;
  }
  .empty-title {
    font-weight: 600;
    color: var(--n-fg-0);
    text-align: center;
    overflow-wrap: anywhere;
  }
  .empty-sub {
    font-size: 14px;
    color: var(--n-fg-2);
    max-width: 320px;
    text-align: center;
  }
  .quiet .empty-title,
  .quiet .empty-sub {
    text-align: left;
    max-width: none;
  }
  .empty :global(.empty-add) {
    margin-top: 6px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: max(20px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(460px, calc(100vw - 32px));
    z-index: 40;
    border-radius: 12px;
    box-shadow: var(--n-shadow-lg);
  }
  /* Below this the bar's contents do not fit one row (the French needs about 730px):
     the search field takes a row of its own. */
  @media (max-width: 720px) {
    .bar {
      height: auto;
      flex-wrap: wrap;
      padding-block: 10px;
      row-gap: 10px;
    }
    .brand {
      margin-right: auto;
    }
    .search-wrap {
      order: 1;
      width: 100%;
    }
    .empty.quiet {
      flex-direction: column;
      align-items: stretch;
    }
  }
  @media (max-width: 560px) {
    /* The plus alone on a phone; the label stays for screen readers. */
    .add-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* Down to 320 px the brand, the settings link and the plus stay on one row, in French too. */
    .bar {
      column-gap: 10px;
    }
    .wordmark span {
      letter-spacing: 0.04em;
    }
    .bar :global(.btn) {
      padding-inline: 12px;
    }
    .main {
      gap: 20px;
      padding-top: 16px;
    }
    /* The continue card: a small cover beside the title, then the bar and Resume full width. */
    .hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      padding: 16px;
      border-radius: 16px;
    }
    .hero .hero-body {
      display: contents;
    }
    .hero h2 {
      margin: 4px 0 2px;
      font-size: 19px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .hero-sub {
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hero-progress,
    .hero .hero-actions {
      grid-column: 1 / -1;
      margin-top: 0;
    }
    .hero-progress {
      gap: 10px;
    }
    .hero :global(.hero-main) {
      width: 100%;
    }
    .hero :global(.hero-voice) {
      display: none;
    }
    /* The invitation: the words and the actions, without the tall tile. */
    .add-hero {
      padding: 20px 16px;
    }
    .add-hero-icon {
      display: none;
    }
    .add-hero h2 {
      font-size: 22px;
      margin-top: 6px;
    }
    .add-hero :global(.hero-main) {
      flex: 1 1 auto;
    }
    .shortcuts {
      flex-direction: column;
      align-items: stretch;
    }
    /* Four small tiles on one line, the icon over the word (a French label takes two lines). */
    .shortcut-list {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .shortcut {
      flex-direction: column;
      gap: 4px;
      min-height: 60px;
      padding: 8px 4px;
      font-size: 13px;
      line-height: 1.2;
      white-space: normal;
      text-align: center;
    }
    .lib-head {
      margin-top: 4px;
    }
  }
</style>
