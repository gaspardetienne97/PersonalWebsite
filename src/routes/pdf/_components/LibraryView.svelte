<script lang="ts">
  import BookOpen from "@lucide/svelte/icons/book-open";
  import FileText from "@lucide/svelte/icons/file-text";
  import Headphones from "@lucide/svelte/icons/headphones";
  import Mic from "@lucide/svelte/icons/mic";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import Quote from "@lucide/svelte/icons/quote";
  import Search from "@lucide/svelte/icons/search";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Type from "@lucide/svelte/icons/type";
  import Upload from "@lucide/svelte/icons/upload";

  import { fmt, type NarratorDoc } from "@repo/pdf-core/domain";
  import type { NarratorLibrary } from "@repo/pdf-core/stores/library";

  import logoUrl from "../logo-G.svg";
  import Btn from "./Btn.svelte";
  import Cover from "./Cover.svelte";
  import DocCard from "./DocCard.svelte";
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

  let query = $state("");

  const q = $derived(query.trim().toLowerCase());
  const filtered = $derived(
    q ? library.docs.filter((d) => (d.title + d.author).toLowerCase().includes(q)) : library.docs,
  );
  const inProgress = $derived(library.inProgress);
  const empty = $derived(library.docs.length === 0);

  function heroChapter(doc: NarratorDoc) {
    const model = library.modelFor(doc);
    const pos = library.progressOf(doc) * model.total;
    return model.chapters.find((c) => pos < c.end) ?? model.chapters[0];
  }
</script>

<div class="page">
  <header class="bar">
    <div class="brand">
      <!-- Narrator runs full screen outside the site chrome; its logo is the way home. -->
      <a href="/" class="home-link" aria-label="Back to Gaspard's site">
        <img src={logoUrl} width="30" height="30" alt="" />
      </a>
      <div class="wordmark">
        <h1>narrator</h1>
        <span>READS ALOUD</span>
      </div>
    </div>
    <div class="search-wrap">
      <Search size={16} strokeWidth={1.5} style="color: var(--n-fg-3)" />
      <input bind:value={query} placeholder="Search your library" aria-label="Search your library" />
    </div>
    <a class="icon-btn" href="/pdf/settings" title="Voice settings" aria-label="Voice settings">
      <SlidersHorizontal size={18} strokeWidth={1.5} />
    </a>
    <Btn variant="primary" onclick={onadd}><Plus size={18} strokeWidth={1.5} /> Add document</Btn>
  </header>

  <main class="main">
    {#if !q}
      {#if inProgress}
        {@const doc = inProgress}
        {@const model = library.modelFor(doc)}
        {@const progress = library.progressOf(doc)}
        {@const ch = heroChapter(doc)}
        <div class="hero hero-card">
          <Cover {doc} size={132} radius={16} />
          <div class="hero-body">
            <div class="eyebrow" style:color={doc.accent}>Continue listening</div>
            <h2>{doc.title}</h2>
            <p class="hero-sub">{doc.author} · {ch ? ch.title : ""}</p>
            <div class="hero-progress">
              <div class="track"><div style:width="{progress * 100}%" style:background={doc.accent}></div></div>
              <span>{fmt(model.total * (1 - progress))} left</span>
            </div>
            <div class="hero-actions">
              <Btn variant="primary" onclick={() => onopen(doc.id)}><Play size={18} strokeWidth={1.5} /> Resume</Btn>
              {#if doc.voice}
                <Pill accent={doc.accent}><Mic size={13} strokeWidth={1.5} /> {doc.voice}</Pill>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="add-hero-border">
          <div class="add-hero hero-card">
            <div class="add-hero-glow"></div>
            <div class="add-hero-icon"><Upload size={44} strokeWidth={1.5} style="color: #fff" /></div>
            <div class="hero-body">
              <div class="eyebrow n-gradient-text" style="font-weight: 700">Get started</div>
              <h2>Add your first document</h2>
              <p class="add-hero-sub">
                Upload a PDF, EPUB, or text file — or paste anything — and I'll read it aloud, highlighting each
                word as it goes.
              </p>
              <div class="hero-actions">
                <Btn variant="primary" onclick={onadd}><Plus size={18} strokeWidth={1.5} /> Add document</Btn>
                <div class="kind-pills">
                  <Pill><FileText size={13} strokeWidth={1.5} /> PDF</Pill>
                  <Pill><BookOpen size={13} strokeWidth={1.5} /> EPUB</Pill>
                  <Pill><Type size={13} strokeWidth={1.5} /> Text</Pill>
                  <Pill><Quote size={13} strokeWidth={1.5} /> Paste</Pill>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
    {/if}

    <div class="lib-head">
      <h3>Your Library</h3>
      <span>{filtered.length} document{filtered.length === 1 ? "" : "s"}</span>
    </div>

    {#if empty && !q}
      <div class="empty">
        <div class="empty-icon"><Headphones size={28} strokeWidth={1.5} style="color: var(--n-fg-3)" /></div>
        <div class="empty-title">No narrations yet</div>
        <div class="empty-sub">Add a PDF, EPUB, or text file — or paste something — and it'll appear here.</div>
        <Btn variant="primary" class="empty-add" onclick={onadd}>
          <Plus size={18} strokeWidth={1.5} /> Add document
        </Btn>
      </div>
    {:else}
      <div class="grid">
        {#each filtered as doc (doc.id)}
          <DocCard
            {doc}
            model={library.modelFor(doc)}
            progress={library.progressOf(doc)}
            {onopen}
            onremove={(id) => library.remove(id)}
          />
        {/each}
        {#if !q}
          <button class="add-card" onclick={onadd}>
            <div class="add-card-icon"><Plus size={24} strokeWidth={1.5} /></div>
            <div class="add-card-title">Add document</div>
            <div class="add-card-sub">PDF, EPUB, text file, or paste</div>
          </button>
        {/if}
      </div>
    {/if}
  </main>
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
  .home-link:focus-visible {
    outline: 2px solid var(--n-brand-blue);
    outline-offset: 3px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
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
    font-size: 10px;
    color: var(--n-fg-3);
    letter-spacing: 0.14em;
    margin-top: 3px;
  }
  .search-wrap {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
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
    color: var(--n-fg-3);
  }
  .icon-btn {
    width: 40px;
    height: 40px;
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
  .hero-body h2 {
    margin: 8px 0 4px;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--n-fg-0);
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
  }
  .hero-progress .track {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: var(--n-bg-3);
    overflow: hidden;
    max-width: 360px;
  }
  .hero-progress .track div {
    height: 100%;
  }
  .hero-progress span {
    font-family: var(--n-font-mono);
    font-size: 12px;
    color: var(--n-fg-2);
  }
  .hero-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    flex-wrap: wrap;
    align-items: center;
  }
  .kind-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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
    max-width: 470px;
  }
  .lib-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin: 8px 0 4px;
  }
  .lib-head h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .lib-head span {
    font-family: var(--n-font-mono);
    font-size: 13px;
    color: var(--n-fg-3);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 24px;
  }
  .add-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    border-radius: 14px;
    border: 1.5px dashed rgba(18, 145, 250, 0.28);
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
    font-size: 12px;
    color: var(--n-fg-2);
    text-align: center;
    max-width: 180px;
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
    color: var(--n-fg-1);
  }
  .empty-sub {
    font-size: 13px;
    color: var(--n-fg-3);
    max-width: 300px;
    text-align: center;
  }
  .empty :global(.empty-add) {
    margin-top: 6px;
  }
  @media (max-width: 560px) {
    .hero-card {
      flex-direction: column !important;
      text-align: center;
      align-items: center !important;
    }
    .hero-actions,
    .hero-progress {
      justify-content: center;
    }
  }
</style>
