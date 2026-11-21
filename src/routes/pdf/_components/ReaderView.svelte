<script lang="ts">
  import AlignLeft from "@lucide/svelte/icons/align-left";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import AudioWaveform from "@lucide/svelte/icons/audio-waveform";
  import Mic from "@lucide/svelte/icons/mic";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import X from "@lucide/svelte/icons/x";
  import { onDestroy } from "svelte";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { KOKORO_VOICES } from "@repo/pdf-core";
  import { authorName, type NarratorDoc } from "@repo/pdf-core/domain";
  import { NarrationPlayer } from "@repo/pdf-core/stores/narration";
  import type { ReaderSettings } from "@repo/pdf-core/stores/settings";

  import Cover from "./Cover.svelte";
  import Notice from "./Notice.svelte";
  import Pill from "./Pill.svelte";
  import PlayerBar from "./PlayerBar.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import Teleprompter from "./Teleprompter.svelte";
  import TextBody from "./TextBody.svelte";

  let {
    doc,
    settings,
    onclose,
  }: {
    doc: NarratorDoc;
    settings: ReaderSettings;
    onclose: () => void;
  } = $props();

  // The reader is keyed by doc.id at the call site, so `doc` is fixed for the
  // lifetime of this instance — capturing its initial value is intentional.
  // svelte-ignore state_referenced_locally
  const player = new NarrationPlayer(doc);
  onDestroy(() => player.dispose());
  // Empty for a text file, pasted text and a PDF or EPUB that names no author.
  const author = $derived(authorName(doc));

  // Keep the player's engine + voices + model quality in sync with persisted settings.
  $effect(() => player.setEngine(settings.engine));
  $effect(() => player.setNaturalVoice(settings.naturalVoice));
  $effect(() => player.setModelQuality(settings.modelQuality));
  $effect(() => {
    if (settings.systemVoice) player.setVoice(settings.systemVoice);
  });

  // 'flow' (teleprompter) | 'doc' (scrolling document text)
  let readStyle = $state<"flow" | "doc">("flow");
  let settingsOpen = $state(false);
  let scrollEl = $state<HTMLElement | null>(null);
  let dockHeight = $state(0);

  // Reopened part-way: say where listening picks up, until it starts or a few seconds pass.
  let resumeAt = $state(player.pos > 0 && !player.done ? player.percent : null);
  const resumeTimer = setTimeout(() => (resumeAt = null), 8000);
  onDestroy(() => clearTimeout(resumeTimer));
  $effect(() => {
    if (player.playing) resumeAt = null;
  });

  // The natural voice could not load and the system voice took over. The notice comes back
  // for the next failure after it was dismissed.
  let fallbackDismissed = $state(false);
  $effect(() => {
    if (!player.usingFallback) fallbackDismissed = false;
  });

  const accent = $derived(settings.accentFor(doc.accent));
  const layout = $derived(settings.layout);
  const isDoc = $derived(readStyle === "doc");
  const chapterTitle = $derived(player.model.chapters[player.chapterIndex]?.title ?? "");
  const voiceLabel = $derived(
    player.engineMode === "natural"
      ? (KOKORO_VOICES.find((v) => v.id === player.naturalVoice)?.label ?? m.narrator_natural_voice())
      : (player.voice ?? m.narrator_system_voice()),
  );
</script>

<!-- A press outside the settings button and its panel closes the panel. A listener, not a fixed
     backdrop: the top bar's backdrop-filter would hold a fixed element inside the bar. -->
<svelte:window
  onpointerdown={(e) => {
    if (settingsOpen && !(e.target as Element).closest(".settings-anchor, .settings-pop")) settingsOpen = false;
  }}
  onkeydown={(e) => {
    if (e.key === "Escape") settingsOpen = false;
  }}
/>

{#snippet styleToggle()}
  <div class="seg" role="group" aria-label={m.narrator_reader_style()}>
    <button
      class="seg-btn"
      class:on={readStyle === "flow"}
      title={m.narrator_reader_flow_view()}
      aria-pressed={readStyle === "flow"}
      onclick={() => (readStyle = "flow")}
    >
      <AudioWaveform size={15} strokeWidth={1.5} /><span class="seg-label">{m.narrator_reader_flow()}</span>
    </button>
    <button
      class="seg-btn"
      class:on={readStyle === "doc"}
      title={m.narrator_reader_document_view()}
      aria-pressed={readStyle === "doc"}
      onclick={() => (readStyle = "doc")}
    >
      <AlignLeft size={15} strokeWidth={1.5} /><span class="seg-label">{m.narrator_reader_document()}</span>
    </button>
  </div>
{/snippet}

{#snippet topBar(showToggle: boolean)}
  <div class="top">
    <button class="back" onclick={onclose} title={m.narrator_back_to_library()} aria-label={m.narrator_back_to_library()}>
      <ArrowLeft size={18} strokeWidth={1.5} />
    </button>
    <div class="top-meta">
      <h1 class="top-title">{doc.title}</h1>
      {#if author}<div class="top-author">{author}</div>{/if}
    </div>
    <div class="top-right">
      {#if showToggle}
        {@render styleToggle()}
      {/if}
      <div class="settings-anchor">
        <button
          class="back"
          class:active={settingsOpen}
          title={m.narrator_reader_settings()}
          aria-label={m.narrator_reader_settings()}
          aria-expanded={settingsOpen}
          onclick={() => (settingsOpen = !settingsOpen)}
        >
          <SlidersHorizontal size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  </div>
{/snippet}

{#snippet docText(showTitle: boolean)}
  <TextBody
    model={player.model}
    chapterIndex={player.chapterIndex}
    {chapterTitle}
    activeWordIndex={player.wordIndex}
    activeSentence={player.sentenceIndex}
    highlight={settings.highlight}
    font={settings.font}
    fontSize={settings.fontSize}
    lineHeight={settings.lineHeight}
    onword={(gi) => player.seekWord(gi)}
    {scrollEl}
    {showTitle}
  />
{/snippet}

{#snippet flowText()}
  <Teleprompter
    model={player.model}
    activeSentence={player.sentenceIndex}
    activeWordIndex={player.wordIndex}
    highlight={settings.highlight}
    font={settings.font}
    scale={settings.fontSize / 21}
  />
{/snippet}

<div
  class="root"
  class:sheet-open={settingsOpen}
  style:--n-accent={accent}
  style:--n-dock-h="{dockHeight}px"
>
  {#if layout !== "audiobook"}
    <div class="blob"></div>
  {/if}

  {#if layout === "immersive"}
    {@render topBar(true)}
    {#if isDoc}
      <div class="imm-scroll" bind:this={scrollEl}>
        <div class="imm-doc-inner">{@render docText(true)}</div>
      </div>
    {:else}
      <div class="imm-stage">
        <!-- The chapter's name stays at the top of the stage, whatever the sentence's length. -->
        <h2 class="imm-chapter">{chapterTitle}</h2>
        <div class="imm-stage-inner">{@render flowText()}</div>
      </div>
    {/if}
    <!-- The dock takes its own room under the text, so no line shows under or beside it. -->
    <div class="float-dock" bind:clientHeight={dockHeight}>
      {#if resumeAt !== null}
        <div class="resume" role="status">
          {m.narrator_reader_resuming({
            percent: formatNumber(resumeAt, { style: "percent", maximumFractionDigits: 0 }),
          })}
        </div>
      {/if}
      {#if player.usingFallback && !fallbackDismissed}
        <div class="fallback">
          <Notice
            tone="info"
            title={m.narrator_reader_fallback_title()}
            actions={[
              { label: m.narrator_reader_fallback_retry(), onclick: () => player.retryNatural(), primary: true },
            ]}
          >
            {m.narrator_reader_fallback_body()}
          </Notice>
          <button class="fallback-close" aria-label={m.narrator_close()} onclick={() => (fallbackDismissed = true)}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      {/if}
      <div class="float-inner">
        <PlayerBar {player} {settings} variant="float" />
      </div>
    </div>
  {:else if layout === "audiobook"}
    {@render topBar(true)}
    <div class="audio-grid">
      <aside class="audio-panel">
        <div class="audio-head">
          <Cover {doc} size={104} radius={12} playing={player.playing} />
          <div class="audio-meta">
            <div class="audio-title">{doc.title}</div>
            {#if author}<div class="audio-author">{author}</div>{/if}
            <Pill class="audio-voice"><Mic size={12} strokeWidth={1.5} /> {voiceLabel}</Pill>
          </div>
        </div>
        <div class="audio-player">
          <PlayerBar {player} {settings} variant="panel" />
        </div>
      </aside>
      <section class={isDoc ? "audio-doc-wrap" : "tele-wrap"}>
        {#if isDoc}
          <div class="audio-doc-scroll" bind:this={scrollEl}>
            <div class="audio-doc-inner">{@render docText(true)}</div>
          </div>
        {:else}
          {@render flowText()}
        {/if}
      </section>
    </div>
  {:else}
    {@render topBar(false)}
    <div class="doc-bar">
      <div class="doc-bar-inner">
        <PlayerBar {player} {settings} variant="bar" />
      </div>
    </div>
    <div class="doc-scroll" bind:this={scrollEl}>
      <div class="doc-inner">{@render docText(true)}</div>
    </div>
  {/if}

  <!-- Outside the top bar: its backdrop-filter would hold the panel inside the bar. A popover
       under the settings button on a wide screen, a sheet under the text on a phone. -->
  {#if settingsOpen}
    <div class="settings-pop">
      <div class="sheet-head">
        <span>{m.narrator_reader_settings()}</span>
        <button class="back" aria-label={m.narrator_close()} onclick={() => (settingsOpen = false)}>
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
      <SettingsPanel {settings} />
    </div>
  {/if}
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    background: var(--n-bg-0);
    overflow: hidden;
    /* The accent as text: lifted toward white so a dark accent still reads on the page. */
    --n-accent-text: color-mix(in srgb, var(--n-accent) 62%, var(--n-fg-0));
  }
  .blob {
    position: absolute;
    top: -180px;
    right: -120px;
    width: 460px;
    height: 460px;
    border-radius: 999px;
    pointer-events: none;
    background: var(--n-brand-gradient-soft);
    filter: blur(120px);
    opacity: 0.7;
  }
  .top {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    flex-shrink: 0;
    padding: 0 clamp(14px, 3vw, 28px);
    border-bottom: 1px solid var(--n-border-1);
    background: var(--n-bar-bg);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  .back {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .back:hover,
  .back.active {
    color: var(--n-fg-0);
    border-color: var(--n-border-3);
  }
  .top-meta {
    min-width: 0;
  }
  .top-title {
    margin: 0;
    font-weight: 700;
    font-size: 15px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top-author {
    font-size: 13px;
    color: var(--n-fg-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .settings-pop {
    position: absolute;
    z-index: 30;
    top: 70px;
    right: clamp(14px, 3vw, 28px);
    max-height: calc(100% - 86px);
    overflow-y: auto;
    background: var(--n-bg-3);
    border: 1px solid var(--n-border-2);
    border-radius: 12px;
    box-shadow: var(--n-shadow-lg);
  }
  .sheet-head {
    display: none;
  }
  .seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
    border-radius: 10px;
  }
  .seg-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--n-fg-2);
    font-family: var(--n-font-sans);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms var(--n-ease-out);
  }
  .seg-btn.on {
    background: var(--n-bg-3);
    color: var(--n-fg-0);
    box-shadow: var(--n-shadow-xs);
  }
  /* ---------- immersive ---------- */
  .imm-scroll,
  .audio-doc-scroll,
  .doc-scroll {
    /* Following the voice. The reduced-motion rule in narrator.css makes this a jump. */
    scroll-behavior: smooth;
  }
  .imm-scroll {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* A short fade into the dock. */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent);
  }
  .imm-doc-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 28px 24px 64px;
  }
  .imm-stage {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 22px 24px 8px;
    overflow: hidden;
  }
  .imm-stage-inner {
    flex: 1;
    min-height: 0;
    width: min(760px, 100%);
  }
  .imm-chapter {
    flex-shrink: 0;
    width: min(760px, 100%);
    margin: 0 0 14px;
    font-family: var(--n-font-mono);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    color: var(--n-accent-text);
  }
  .float-dock {
    position: relative;
    z-index: 12;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 6px 16px 22px;
  }
  .float-inner {
    width: min(800px, 100%);
    padding: 12px 18px;
    border-radius: 18px;
    background: var(--n-glass-bg);
    backdrop-filter: var(--n-glass-blur);
    -webkit-backdrop-filter: var(--n-glass-blur);
    border: 1px solid var(--n-glass-border);
    box-shadow: var(--n-shadow-lg);
  }
  /* Over the faded end of the text, so it comes and goes without moving anything. */
  .resume {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--n-bg-3);
    border: 1px solid var(--n-border-2);
    box-shadow: var(--n-shadow-md);
    font-size: 13px;
    font-weight: 600;
    color: var(--n-fg-0);
    white-space: nowrap;
  }
  .fallback {
    position: relative;
    width: min(800px, 100%);
  }
  .fallback :global(.notice) {
    padding-right: 52px;
  }
  .fallback-close {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .fallback-close:hover {
    color: var(--n-fg-0);
    background: var(--n-bg-3);
  }
  /* ---------- audiobook ---------- */
  .audio-grid {
    position: relative;
    z-index: 1;
    flex: 1;
    display: grid;
    grid-template-columns: 360px 1fr;
    min-height: 0;
  }
  .audio-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 24px 26px;
    border-right: 1px solid var(--n-border-1);
    background: var(--n-bg-1);
    min-height: 0;
  }
  .audio-head {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .audio-meta {
    min-width: 0;
  }
  .audio-title {
    font-weight: 700;
    font-size: 18px;
    line-height: 1.2;
  }
  .audio-author {
    color: var(--n-fg-2);
    font-size: 13px;
    margin-top: 4px;
  }
  .audio-meta :global(.audio-voice) {
    margin-top: 12px;
  }
  .audio-player {
    margin-top: 26px;
  }
  .tele-wrap {
    padding: clamp(24px, 5vw, 72px);
    min-height: 0;
    overflow: hidden;
    max-width: 880px;
    margin: 0 auto;
    width: 100%;
  }
  .audio-doc-wrap {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .audio-doc-scroll {
    overflow-y: auto;
    padding: 32px clamp(20px, 4vw, 56px) 0;
    flex: 1;
  }
  .audio-doc-inner {
    max-width: 640px;
    margin: 0 auto;
    padding: 8px 4px 80px;
  }
  /* ---------- document ---------- */
  .doc-bar {
    position: relative;
    z-index: 9;
    padding: 12px clamp(14px, 3vw, 28px);
    border-bottom: 1px solid var(--n-border-1);
    background: var(--n-bg-1);
    flex-shrink: 0;
  }
  .doc-bar-inner {
    max-width: 1100px;
    margin: 0 auto;
    width: 100%;
  }
  .doc-scroll {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .doc-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 24px 160px;
  }
  /* ---------- responsive ---------- */
  @media (max-width: 900px) {
    .audio-grid {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .audio-panel {
      border-right: none;
      border-bottom: 1px solid var(--n-border-1);
    }
  }
  @media (max-width: 560px) {
    /* Two rows: back, the title on up to two lines and settings, then the view switch with its
       labels across the full width. */
    .top {
      flex-wrap: wrap;
      gap: 6px 10px;
      padding: 6px 12px;
    }
    .top-meta {
      flex: 1;
    }
    .top-title {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .top-author {
      display: none;
    }
    .top-right {
      display: contents;
    }
    .back {
      width: 44px;
      height: 44px;
    }
    .seg {
      order: 5;
      flex: 1 1 100%;
    }
    .seg-btn {
      flex: 1;
      min-height: 38px;
      font-size: 14px;
    }
    .imm-stage {
      padding: 16px 16px 4px;
    }
    .imm-doc-inner,
    .doc-inner {
      padding-inline: 20px;
    }
    /* The dock is a solid band across the foot of the screen. */
    .float-dock {
      padding: 0;
      gap: 8px;
    }
    .float-inner {
      width: 100%;
      padding: 0;
      border-radius: 0;
      border: none;
      border-top: 1px solid var(--n-border-2);
      background: var(--n-bg-1);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      box-shadow: none;
    }
    .fallback {
      width: calc(100% - 24px);
    }
    /* The settings sheet takes the dock's place under the text, which stays in view above it. */
    .root.sheet-open .float-dock {
      display: none;
    }
    .settings-pop {
      position: relative;
      order: 99;
      top: auto;
      right: auto;
      flex-shrink: 0;
      max-height: 46dvh;
      border: none;
      border-top: 1px solid var(--n-border-2);
      border-radius: 16px 16px 0 0;
      background: var(--n-bg-2);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .sheet-head {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 8px 8px 16px;
      background: var(--n-bg-2);
      border-bottom: 1px solid var(--n-border-1);
      font-size: 15px;
      font-weight: 700;
    }
    .sheet-head .back {
      background: transparent;
      border-color: transparent;
    }
  }
</style>
