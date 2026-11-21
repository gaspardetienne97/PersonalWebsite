<script lang="ts">
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Mic from "@lucide/svelte/icons/mic";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Upload from "@lucide/svelte/icons/upload";
  import X from "@lucide/svelte/icons/x";
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import {
    authorName,
    fmtLong,
    isSample,
    lengthLine,
    matchesQuery,
    type NarratorDoc,
  } from "@repo/pdf-core/domain";
  import type { NarratorLibrary } from "@repo/pdf-core/stores/library";

  import logoUrl from "../logo-G.svg";
  import Btn from "./Btn.svelte";
  import Cover from "./Cover.svelte";
  import DocCard from "./DocCard.svelte";
  import Equalizer from "./Equalizer.svelte";
  import Notice from "./Notice.svelte";
  import Pill from "./Pill.svelte";

  let {
    library,
    onopen,
    onadd,
  }: {
    library: NarratorLibrary;
    onopen: (id: string) => void;
    onadd: () => void;
  } = $props();

  // One switch for the phone layout: documents become rows and the continue card goes compact.
  const phone = new MediaQuery("(max-width: 560px)");
  // The invitation has a right half to fill from here up.
  const wide = new MediaQuery("(min-width: 900px)");
  const still = new MediaQuery("(prefers-reduced-motion: reduce)");

  /** How long the Undo notice stays after a removal. */
  const UNDO_MS = 8000;

  let query = $state("");
  let searchInput = $state<HTMLInputElement | null>(null);

  const q = $derived(query.trim());
  const filtered = $derived(library.docs.filter((d) => matchesQuery(d, q)));
  const inProgress = $derived(library.inProgress);
  const empty = $derived(library.docs.length === 0);
  const firstSample = $derived(library.docs.find(isSample));
  const onlySamples = $derived(!empty && library.docs.every(isSample));
  // The invitation is for a listener who has added nothing yet and played nothing.
  const invite = $derived(!inProgress && onlySamples);
  // Where the page itself holds the main "Add document", the one in the bar steps back.
  const pageAdds = $derived(!q && (invite || empty));

  function heroChapter(doc: NarratorDoc) {
    const model = library.modelFor(doc);
    const pos = library.progressOf(doc) * model.total;
    return model.chapters.find((c) => pos < c.end) ?? model.chapters[0];
  }

  const percent = (value: number) =>
    formatNumber(Math.max(0.01, value), { style: "percent", maximumFractionDigits: 0 });

  // The invitation shows what the app does: the first sentence of a sample with the mark moving
  // from word to word, at about the pace of speech. With reduced motion it rests on one word.
  const demoWords = $derived.by(() => {
    if (!firstSample) return [];
    const { sentences, tokens } = library.modelFor(firstSample);
    const first = sentences[0];
    return first ? tokens.slice(first.wordStart, first.wordEnd + 1).map((t) => t.word) : [];
  });
  let demoAt = $state(4);
  $effect(() => {
    const count = demoWords.length;
    if (!invite || !wide.current || still.current || count === 0) return;
    // A short rest after the last word, then from the top.
    const timer = setInterval(() => (demoAt = (demoAt + 1) % (count + 3)), 380);
    return () => clearInterval(timer);
  });

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
      <Search size={16} strokeWidth={1.75} style="color: var(--n-fg-2); flex-shrink: 0" />
      <input
        bind:this={searchInput}
        bind:value={query}
        placeholder={m.narrator_library_search()}
        aria-label={m.narrator_library_search()}
      />
      {#if query}
        <button
          class="search-clear"
          aria-label={m.narrator_library_clear_search()}
          title={m.narrator_library_clear_search()}
          onclick={() => {
            query = "";
            searchInput?.focus();
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      {/if}
    </div>
    <a class="icon-btn" href="/pdf/settings" title={m.narrator_voice_settings()} aria-label={m.narrator_voice_settings()}>
      <SlidersHorizontal size={18} strokeWidth={1.75} />
    </a>
    <Btn
      variant={pageAdds ? "secondary" : "primary"}
      class="bar-add"
      aria-label={m.narrator_add_document()}
      onclick={() => onadd()}
    >
      <Plus size={18} strokeWidth={2} />
      <span class="add-long">{m.narrator_add_document()}</span>
      <span class="add-short">{m.narrator_library_add_short()}</span>
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
        {@const stopped = library.resumeLine(doc)}
        <section class="hero" aria-label={m.narrator_library_continue()}>
          <Cover {doc} size={phone.current ? 64 : 104} radius={phone.current ? 10 : 14} />
          <div class="hero-body">
            <div class="hero-text">
              <div class="eyebrow">{m.narrator_library_continue()}</div>
              <h2>{doc.title}</h2>
              <p class="hero-sub">{author}{author && ch ? " · " : ""}{ch ? ch.title : ""}</p>
              {#if stopped}
                <p class="hero-stopped">{m.narrator_library_stopped_at({ sentence: stopped })}</p>
              {/if}
            </div>
            <div class="hero-progress">
              <div class="track"><div style:width="{progress * 100}%"></div></div>
              <span class="hero-percent">{percent(progress)}</span>
              <span>{lengthLine(model.total, progress)}</span>
            </div>
          </div>
          <div class="hero-side">
            <Btn variant="primary" class="hero-main" onclick={() => onopen(doc.id)}>
              <Play size={18} strokeWidth={2} /> {m.narrator_library_resume()}
            </Btn>
            {#if doc.voice}
              <Pill class="hero-voice"><Mic size={13} strokeWidth={1.75} /> {doc.voice}</Pill>
            {/if}
          </div>
        </section>
      {:else if invite}
        <div class="add-hero-border">
          <section class="add-hero" aria-labelledby="n-invite-title">
            <div class="add-hero-glow"></div>
            <div class="add-hero-icon"><Upload size={26} strokeWidth={1.75} /></div>
            <div class="hero-body">
              <div class="eyebrow invite-eyebrow">{m.narrator_library_get_started()}</div>
              <h2 id="n-invite-title">{m.narrator_library_add_first()}</h2>
              <p class="add-hero-sub">
                {m.narrator_library_add_first_sub()}
              </p>
              <div class="hero-actions">
                <Btn variant="primary" class="hero-main" onclick={() => onadd()}>
                  <Plus size={18} strokeWidth={2} /> {m.narrator_add_document()}
                </Btn>
                {#if firstSample}
                  {@const sample = firstSample}
                  <Btn class="hero-main" onclick={() => onopen(sample.id)}>
                    <Play size={16} strokeWidth={2} />
                    {m.narrator_library_listen_sample({ time: fmtLong(library.modelFor(sample).total) })}
                  </Btn>
                {/if}
              </div>
            </div>
            {#if wide.current && firstSample && demoWords.length}
              {@const sample = firstSample}
              <!-- What the app does, shown: a sample's first sentence with the word mark on it.
                   A press on it opens that sample, a convenience: the button beside it is the
                   control a keyboard and a screen reader use. -->
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
              <figure
                class="demo"
                aria-label={m.narrator_library_demo_label({ title: sample.title })}
                onclick={() => onopen(sample.id)}
              >
                <figcaption>
                  <Equalizer size={14} active={!still.current} />
                  <span class="demo-title">{firstSample.title}</span>
                  <span class="demo-by">{authorName(firstSample)}</span>
                </figcaption>
                <p>
                  {#each demoWords as word, i (i)}
                    <span class="word" class:current={i === demoAt} class:read={i < demoAt}>{word}</span>{" "}
                  {/each}
                </p>
              </figure>
            {/if}
          </section>
        </div>
      {/if}
    {/if}

    {#if empty && !q}
      <!-- One state for a library with nothing in it: one message, the way to add, the samples back. -->
      <section class="empty" aria-labelledby="n-empty-title">
        <div class="empty-icon"><BookOpen size={26} strokeWidth={1.5} /></div>
        <h2 class="empty-title" id="n-empty-title">{m.narrator_library_empty_title()}</h2>
        <p class="empty-sub">{m.narrator_library_empty_sub()}</p>
        <div class="empty-actions">
          <Btn variant="primary" onclick={() => onadd()}>
            <Plus size={18} strokeWidth={2} /> {m.narrator_add_document()}
          </Btn>
          <Btn onclick={() => library.restoreSamples()}>{m.narrator_library_restore_samples()}</Btn>
        </div>
      </section>
    {:else}
      <div class="lib-head" aria-live="polite">
        {#if q && filtered.length}
          <!-- A search says it is one, and keeps the size of the whole library beside it. -->
          <h3>{m.narrator_library_matches({ count: filtered.length, query: q })}</h3>
          <span>
            {m.narrator_library_of_total({ total: m.narrator_library_count({ count: library.docs.length }) })}
          </span>
        {:else}
          <h3>{m.narrator_library_heading()}</h3>
          <span>{m.narrator_library_count({ count: library.docs.length })}</span>
        {/if}
        {#if onlySamples && !q}
          <p class="samples-note">{m.narrator_library_samples_note()}</p>
        {/if}
      </div>

      {#if filtered.length === 0}
        <div class="empty" role="status">
          <div class="empty-icon"><Search size={26} strokeWidth={1.5} /></div>
          <div class="empty-title">{m.narrator_library_no_match_title({ query: q })}</div>
          <div class="empty-sub">{m.narrator_library_no_match_sub()}</div>
          <div class="empty-actions">
            <Btn onclick={() => (query = "")}>{m.narrator_library_clear_search()}</Btn>
          </div>
        </div>
      {:else}
        <div class="grid" class:rows={phone.current}>
          {#each filtered as doc (doc.id)}
            <DocCard
              {doc}
              model={library.modelFor(doc)}
              progress={library.progressOf(doc)}
              row={phone.current}
              listening={doc.id === inProgress?.id}
              query={q}
              {onopen}
              onremove={remove}
            />
          {/each}
          <!-- With the invitation above, a second "Add document" in the page would repeat it. -->
          {#if !q && !invite}
            <button class="add-card" onclick={() => onadd()}>
              <div class="add-card-icon"><Plus size={24} strokeWidth={1.75} /></div>
              <div class="add-card-text">
                <div class="add-card-title">{m.narrator_add_document()}</div>
                <div class="add-card-sub">{m.narrator_library_add_card_sub()}</div>
              </div>
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </main>

  {#if library.removed}
    <!-- Sticks to the bottom edge and takes its own room at the end of the page, so the last
         cards scroll clear of it. -->
    <div class="toast">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="toast-line"
        onpointerenter={holdUndo}
        onpointerleave={startUndo}
        onfocusin={holdUndo}
        onfocusout={startUndo}
      >
        <Notice
          tone="info"
          variant="line"
          actions={[{ label: m.narrator_library_undo(), onclick: undo, primary: true }]}
        >
          {m.narrator_library_removed({ title: library.removed.doc.title })}
        </Notice>
      </div>
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
  .search-clear:focus-visible,
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
    font-family: var(--n-font-sans);
    font-size: 12px;
    font-weight: 600;
    color: var(--n-fg-2);
    margin-top: 4px;
    white-space: nowrap;
  }
  .search-wrap {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 4px 0 14px;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-2);
    border-radius: 999px;
    width: min(300px, 30vw);
  }
  .search-wrap input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--n-fg-0);
    font-family: var(--n-font-sans);
    font-size: 15px;
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
    box-shadow: 0 0 0 1px var(--n-brand-blue);
  }
  /* The cross is drawn small inside a full 44 px press area. */
  .search-clear {
    width: 44px;
    height: 44px;
    margin: -1px 0;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .search-clear:hover {
    color: var(--n-fg-0);
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
    transition: all 160ms var(--n-ease-out);
  }
  .icon-btn:hover {
    border-color: var(--n-border-3);
    background: var(--n-bg-3);
  }
  .add-short {
    display: none;
  }
  .main {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(16px, 2.2vw, 28px) clamp(16px, 4vw, 48px) clamp(20px, 4vw, 40px);
    display: flex;
    flex-direction: column;
    gap: 24px;
    flex: 1;
  }
  .eyebrow {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--n-fg-2);
  }
  .invite-eyebrow {
    color: var(--n-link);
  }

  /* Continue listening: the cover, where it stopped and how much is left, and Resume. */
  .hero {
    display: flex;
    gap: 24px;
    align-items: center;
    padding: 20px 24px;
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
    margin: 4px 0 2px;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--n-fg-0);
    overflow-wrap: anywhere;
  }
  .hero-sub {
    margin: 0;
    color: var(--n-fg-1);
    font-size: 15px;
  }
  .hero-stopped {
    margin: 4px 0 0;
    max-width: 640px;
    font-family: var(--n-font-serif);
    font-size: 15px;
    font-style: italic;
    color: var(--n-fg-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hero-progress {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 14px;
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
  .hero-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .hero-side :global(.hero-main) {
    min-width: 150px;
    min-height: 48px;
    font-size: 15px;
  }
  .hero-actions {
    display: flex;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
    align-items: center;
  }

  /* The invitation: what to do first at the left, what the app does at the right. */
  .add-hero-border {
    border-radius: 21px;
    padding: 1.5px;
    background: var(--n-brand-gradient);
    box-shadow: var(--n-shadow-lg), var(--n-brand-glow);
  }
  .add-hero {
    display: flex;
    gap: 20px;
    align-items: flex-start;
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
    width: 56px;
    height: 56px;
    border-radius: 14px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: var(--n-on-accent, #fff);
    background: var(--n-brand-gradient);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .add-hero h2 {
    font-size: 28px;
    margin-top: 2px;
    margin-bottom: 6px;
  }
  .add-hero-sub {
    margin: 0;
    color: var(--n-fg-1);
    font-size: 15px;
    max-width: 500px;
  }
  .demo {
    position: relative;
    align-self: stretch;
    width: min(400px, 36%);
    flex-shrink: 0;
    margin: 0;
    padding: 16px 20px 18px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    border-radius: 14px;
    background: rgba(2, 6, 24, 0.55);
    border: 1px solid var(--n-border-2);
    cursor: pointer;
  }
  .demo:hover {
    border-color: var(--n-border-3);
    background: rgba(2, 6, 24, 0.75);
  }
  .demo figcaption {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--n-fg-2);
    min-width: 0;
  }
  .demo-title {
    font-weight: 700;
    color: var(--n-fg-0);
    white-space: nowrap;
  }
  .demo-by {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .demo p {
    margin: 0;
    font-family: var(--n-font-serif);
    font-size: 19px;
    line-height: 1.6;
    color: var(--n-fg-0);
  }

  .lib-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 4px 0 -8px;
  }
  .lib-head h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--n-fg-0);
    overflow-wrap: anywhere;
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
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 20px;
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
    border: 1.5px dashed var(--n-border-3);
    background: transparent;
    cursor: pointer;
    min-height: 240px;
    transition: all 200ms var(--n-ease-out);
    font-family: inherit;
  }
  .add-card:hover {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.08);
  }
  .add-card-icon {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
  }
  .add-card-title {
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .add-card-sub {
    font-size: 13.5px;
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
    padding: 48px 24px;
    border: 1.5px dashed var(--n-border-2);
    border-radius: 16px;
    background: var(--n-bg-1);
  }
  .empty-icon {
    width: 60px;
    height: 60px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--n-bg-2);
    color: var(--n-fg-1);
    margin-bottom: 4px;
  }
  .empty-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--n-fg-0);
    text-align: center;
    overflow-wrap: anywhere;
  }
  .empty-sub {
    margin: 0;
    font-size: 15px;
    color: var(--n-fg-1);
    max-width: 420px;
    text-align: center;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 12px;
  }
  /* The "removed, Undo" line: stuck to the bottom edge, and holding its own room at the end
     of the page so the last cards scroll clear of it. */
  .toast {
    position: sticky;
    bottom: 0;
    z-index: 40;
    display: flex;
    justify-content: center;
    padding: 12px 16px max(14px, env(safe-area-inset-bottom));
    background: linear-gradient(to top, var(--n-bg-0) 55%, transparent);
    pointer-events: none;
  }
  .toast-line {
    width: min(520px, 100%);
    border-radius: 12px;
    box-shadow: var(--n-shadow-lg);
    pointer-events: auto;
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
  }
  @media (max-width: 900px) {
    .hero-side :global(.hero-voice) {
      display: none;
    }
  }
  @media (max-width: 560px) {
    /* A phone has room for a short word beside the plus. Under 360 px, the plus alone. */
    .add-long {
      display: none;
    }
    .add-short {
      display: inline;
    }
    .bar {
      column-gap: 10px;
    }
    .bar :global(.bar-add) {
      padding-inline: 14px;
    }
    .main {
      gap: 18px;
      padding-top: 14px;
    }
    /* The continue card: a small cover beside the title, then the bar and Resume full width. */
    .hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px 14px;
      padding: 16px;
      border-radius: 16px;
    }
    .hero .hero-body {
      display: contents;
    }
    .hero h2 {
      margin: 2px 0;
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
    .hero-stopped {
      display: none;
    }
    .hero-progress,
    .hero-side {
      grid-column: 1 / -1;
      margin-top: 0;
    }
    .hero-progress {
      gap: 10px;
    }
    .hero-side {
      align-items: stretch;
    }
    /* The invitation: the words and the two actions. */
    .add-hero {
      padding: 18px 16px;
    }
    .add-hero-icon {
      display: none;
    }
    .add-hero h2 {
      font-size: 22px;
      margin-top: 4px;
    }
    .add-hero-sub {
      font-size: 14.5px;
    }
    .hero-actions {
      gap: 10px;
      margin-top: 14px;
    }
    .add-hero :global(.hero-main) {
      flex: 1 1 auto;
    }
    .empty {
      padding: 32px 16px;
    }
    .empty-actions {
      flex-direction: column;
      align-self: stretch;
    }
    .lib-head {
      margin-top: 0;
    }
  }
  @media (max-width: 359px) {
    .add-short {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .bar :global(.bar-add) {
      padding-inline: 12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .icon-btn,
    .add-card {
      transition: none;
    }
  }
</style>
