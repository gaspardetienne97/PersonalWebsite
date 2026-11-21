<script lang="ts">
  import AlignLeft from "@lucide/svelte/icons/align-left";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import AudioWaveform from "@lucide/svelte/icons/audio-waveform";
  import Mic from "@lucide/svelte/icons/mic";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import X from "@lucide/svelte/icons/x";
  import { onDestroy } from "svelte";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { KOKORO_VOICES } from "@repo/pdf-core";
  import { authorName, fmt, type NarratorDoc } from "@repo/pdf-core/domain";
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
  // The player's open menu: the chapter list dims the text behind it.
  let playerMenu = $state<"speed" | "chapters" | "voice" | null>(null);
  let noticesHeight = $state(0);

  // Reopened part-way: say where listening picks up, with a way back to the start. It stays
  // until listening starts or it is closed.
  let resumeAt = $state(player.pos > 0 && !player.done ? player.percent : null);
  $effect(() => {
    if (player.playing) resumeAt = null;
  });

  // After a chapter is chosen: name it, and offer the place the listener came from. A few
  // seconds, since a mistaken press is noticed at once.
  let jump = $state<{ n: number; title: string; from: number } | null>(null);
  let jumpTimer: ReturnType<typeof setTimeout> | undefined;
  function jumped(from: number) {
    clearTimeout(jumpTimer);
    resumeAt = null;
    jump = { n: player.chapterIndex + 1, title: player.model.chapters[player.chapterIndex]?.title ?? "", from };
    jumpTimer = setTimeout(() => (jump = null), 8000);
  }

  // The first use of the Flow or Document switch says what the chosen view is. A wide screen
  // has the same words inside the switch all the time.
  let viewHint = $state(false);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  function setStyle(style: "flow" | "doc") {
    readStyle = style;
    if (settings.viewHintSeen) return;
    settings.update("viewHintSeen", true);
    viewHint = true;
    hintTimer = setTimeout(() => (viewHint = false), 8000);
  }
  onDestroy(() => {
    clearTimeout(jumpTimer);
    clearTimeout(hintTimer);
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
  const hasNotice = $derived(
    (player.usingFallback && !fallbackDismissed) || jump !== null || resumeAt !== null,
  );
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

{#snippet styleButton(style: "flow" | "doc", label: string, sub: string, title: string)}
  <button
    class="seg-btn"
    class:on={readStyle === style}
    {title}
    aria-label={label}
    aria-describedby="reader-style-{style}"
    aria-pressed={readStyle === style}
    onclick={() => setStyle(style)}
  >
    {#if style === "flow"}
      <AudioWaveform size={16} strokeWidth={1.5} />
    {:else}
      <AlignLeft size={16} strokeWidth={1.5} />
    {/if}
    <span class="seg-text">
      <span class="seg-label">{label}</span>
      <span class="seg-sub" id="reader-style-{style}">{sub}</span>
    </span>
  </button>
{/snippet}

{#snippet styleToggle()}
  <div class="seg" role="group" aria-label={m.narrator_reader_style()}>
    {@render styleButton("flow", m.narrator_reader_flow(), m.narrator_reader_flow_hint(), m.narrator_reader_flow_view())}
    {@render styleButton(
      "doc",
      m.narrator_reader_document(),
      m.narrator_reader_document_hint(),
      m.narrator_reader_document_view(),
    )}
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
  {#if showToggle && viewHint}
    <p class="view-hint" role="status">
      <strong>{isDoc ? m.narrator_reader_document() : m.narrator_reader_flow()}</strong>
      {isDoc ? m.narrator_reader_document_hint() : m.narrator_reader_flow_hint()}
    </p>
  {/if}
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
    {chapterTitle}
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
        <div class="imm-stage-inner">{@render flowText()}</div>
      </div>
    {/if}
    {#if playerMenu === "chapters"}
      <div class="scrim"></div>
    {/if}
    <!-- The dock takes its own room under the text, so no line shows under or beside it. -->
    <div
      class="float-dock"
      bind:clientHeight={dockHeight}
      style:--n-pop-lift="{hasNotice ? noticesHeight + 10 : 0}px"
    >
      <!-- One line each, on the dock's top edge. The player's menus open above them. -->
      {#if hasNotice}
        <div class="notices" bind:clientHeight={noticesHeight}>
          {#if player.usingFallback && !fallbackDismissed}
            <Notice
              tone="warn"
              variant="line"
              actions={[{ label: m.narrator_reader_fallback_retry(), onclick: () => player.retryNatural() }]}
              ondismiss={() => (fallbackDismissed = true)}
            >
              {m.narrator_player_fallback()}
            </Notice>
          {/if}
          {#if jump}
            {@const from = jump.from}
            <Notice
              tone="info"
              variant="line"
              actions={[
                {
                  label: m.narrator_reader_back_to({ time: fmt(from) }),
                  onclick: () => {
                    player.seekTo(from);
                    jump = null;
                  },
                },
              ]}
              ondismiss={() => (jump = null)}
            >
              {m.narrator_reader_jumped({ n: jump.n, title: jump.title })}
            </Notice>
          {:else if resumeAt !== null}
            <Notice
              tone="info"
              variant="line"
              actions={[
                {
                  label: m.narrator_reader_start_over(),
                  onclick: () => {
                    player.seekTo(0);
                    resumeAt = null;
                  },
                },
              ]}
              ondismiss={() => (resumeAt = null)}
            >
              {m.narrator_reader_resuming({
                percent: formatNumber(resumeAt, { style: "percent", maximumFractionDigits: 0 }),
              })}
            </Notice>
          {/if}
        </div>
      {/if}
      <div class="float-inner">
        <PlayerBar {player} {settings} variant="float" bind:menu={playerMenu} onjump={jumped} />
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
        <!-- The sheet takes the dock's place, so listening can still be started and stopped. -->
        <button
          class="mini-play"
          aria-label={player.playing ? m.narrator_player_pause() : m.narrator_player_play()}
          onclick={() => player.toggle()}
        >
          {#if player.playing}
            <Pause size={18} strokeWidth={2} />
          {:else}
            <Play size={18} strokeWidth={2} style="margin-left: 2px" />
          {/if}
        </button>
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
    /* The room the settings panel takes on a wide screen: the text and the dock move over. */
    --panel-room: 0px;
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
  /* What the Flow or Document switch just chose, in words. */
  .view-hint {
    position: relative;
    z-index: 9;
    flex-shrink: 0;
    margin: 0;
    padding: 8px 16px;
    border-bottom: 1px solid var(--n-border-1);
    background: var(--n-bg-1);
    font-size: 14px;
    line-height: 1.4;
    text-align: center;
    color: var(--n-fg-1);
  }
  .view-hint strong {
    margin-right: 6px;
    color: var(--n-fg-0);
  }
  .settings-pop {
    position: absolute;
    z-index: 30;
    top: 72px;
    right: clamp(14px, 3vw, 28px);
    max-height: calc(100% - 88px);
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
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    font-family: var(--n-font-sans);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms var(--n-ease-out);
  }
  .seg-btn.on {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
    color: var(--n-fg-0);
    box-shadow: var(--n-shadow-xs);
  }
  .seg-text {
    display: flex;
    flex-direction: column;
    text-align: left;
    line-height: 1.25;
  }
  /* What each view is, under its name. Only where the bar has the room. */
  .seg-sub {
    display: none;
    font-size: 12px;
    font-weight: 500;
    color: var(--n-fg-2);
  }
  .seg-btn.on .seg-sub {
    color: var(--n-fg-1);
  }
  @media (min-width: 900px) {
    .seg-sub {
      display: block;
    }
    .seg-btn {
      min-height: 46px;
    }
    .view-hint {
      display: none;
    }
    /* The settings panel sits beside the text, not over it: the reading column and the dock
       move into the width that is left, so no line end is hidden while its size changes. */
    .root.sheet-open {
      --panel-room: 356px;
    }
  }
  /* ---------- immersive ---------- */
  .imm-scroll,
  .audio-doc-scroll,
  .doc-scroll {
    /* Following the voice. The reduced-motion rule in narrator.css makes this a jump. */
    scroll-behavior: smooth;
  }
  .imm-scroll,
  .imm-stage,
  .float-dock,
  .doc-scroll,
  .doc-bar,
  .audio-grid {
    margin-right: var(--panel-room);
    transition: margin-right 200ms var(--n-ease-out);
  }
  .imm-scroll {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* A soft edge under the top bar, so no line is cut through its letters, and a short one
       above the dock. The lines between them are at full strength. */
    mask-image: linear-gradient(to bottom, transparent, #000 22px, #000 calc(100% - 26px), transparent);
  }
  .imm-doc-inner {
    max-width: 720px;
    margin: 0 auto;
    /* The last line can rise well clear of the dock. */
    padding: 30px 24px 96px;
  }
  /* The text steps back while the chapter list is open over it. A press on it closes the list. */
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: color-mix(in srgb, var(--n-bg-0) 68%, transparent);
  }
  .imm-stage {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 24px 8px;
    overflow: hidden;
  }
  .imm-stage-inner {
    flex: 1;
    min-height: 0;
    width: min(760px, 100%);
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
  .notices {
    width: min(800px, 100%);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mini-play {
    width: 44px;
    height: 44px;
    margin-left: auto;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: none;
    background: var(--n-accent);
    color: var(--n-on-accent);
    cursor: pointer;
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
      min-height: 44px;
      font-size: 15px;
    }
    .imm-stage {
      padding: 4px 16px 4px;
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
    .notices {
      width: calc(100% - 24px);
      padding-top: 6px;
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
      /* Each tab fits, so nothing scrolls. The limit is for a very short screen. */
      max-height: 62dvh;
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
      gap: 4px;
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
