<script lang="ts">
  import AlignLeft from "lucide-svelte/icons/align-left";
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import AudioWaveform from "lucide-svelte/icons/audio-waveform";
  import Mic from "lucide-svelte/icons/mic";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import { onDestroy } from "svelte";

  import { KOKORO_VOICES } from "@repo/pdf-core";
  import type { NarratorDoc } from "@repo/pdf-core/domain";
  import { NarrationPlayer } from "@repo/pdf-core/stores/narration";
  import type { ReaderSettings } from "@repo/pdf-core/stores/settings";

  import Cover from "./Cover.svelte";
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

  // Keep the player's engine + natural voice in sync with persisted settings.
  $effect(() => player.setEngine(settings.engine));
  $effect(() => player.setNaturalVoice(settings.naturalVoice));

  // 'flow' (teleprompter) | 'doc' (scrolling document text)
  let readStyle = $state<"flow" | "doc">("flow");
  let settingsOpen = $state(false);
  let scrollEl = $state<HTMLElement | null>(null);

  const accent = $derived(settings.accentFor(doc.accent));
  const layout = $derived(settings.layout);
  const isDoc = $derived(readStyle === "doc");
  const chapterTitle = $derived(player.model.chapters[player.chapterIndex]?.title ?? "");
  const voiceLabel = $derived(
    player.engineMode === "natural"
      ? (KOKORO_VOICES.find((v) => v.id === player.naturalVoice)?.label ?? "Natural voice")
      : (player.voice ?? "System voice"),
  );
</script>

{#snippet styleToggle()}
  <div class="seg" role="group" aria-label="Reading style">
    <button
      class="seg-btn"
      class:on={readStyle === "flow"}
      title="Flow view"
      aria-pressed={readStyle === "flow"}
      onclick={() => (readStyle = "flow")}
    >
      <AudioWaveform size={15} strokeWidth={1.5} /><span class="seg-label">Flow</span>
    </button>
    <button
      class="seg-btn"
      class:on={readStyle === "doc"}
      title="Document view"
      aria-pressed={readStyle === "doc"}
      onclick={() => (readStyle = "doc")}
    >
      <AlignLeft size={15} strokeWidth={1.5} /><span class="seg-label">Document</span>
    </button>
  </div>
{/snippet}

{#snippet topBar(showToggle: boolean)}
  <div class="top">
    <button class="back" onclick={onclose} title="Back to library" aria-label="Back to library">
      <ArrowLeft size={18} strokeWidth={1.5} />
    </button>
    <div class="top-meta">
      <div class="top-title">{doc.title}</div>
      <div class="top-author">{doc.author}</div>
    </div>
    <div class="top-right">
      {#if showToggle}
        {@render styleToggle()}
      {/if}
      <div class="settings-anchor">
        <button
          class="back"
          class:active={settingsOpen}
          title="Reader settings"
          aria-label="Reader settings"
          onclick={() => (settingsOpen = !settingsOpen)}
        >
          <SlidersHorizontal size={16} strokeWidth={1.5} />
        </button>
        {#if settingsOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="settings-backdrop" onclick={() => (settingsOpen = false)}></div>
          <div class="settings-pop"><SettingsPanel {settings} /></div>
        {/if}
      </div>
      <Pill accent={doc.accent} class="meta-pill">{doc.meta.split(" · ")[0]}</Pill>
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
    {accent}
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
    {accent}
    highlight={settings.highlight}
    font={settings.font}
  />
{/snippet}

<div class="root">
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
        <div class="imm-stage-inner">
          <div class="imm-chapter" style:color={accent}>{chapterTitle}</div>
          {@render flowText()}
        </div>
      </div>
    {/if}
    <div class="float-dock">
      <div class="float-inner">
        <PlayerBar {player} {doc} {settings} {accent} variant="float" />
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
            <div class="audio-author">{doc.author}</div>
            <Pill accent={doc.accent} class="audio-voice"><Mic size={12} strokeWidth={1.5} /> {voiceLabel}</Pill>
          </div>
        </div>
        <div class="audio-player">
          <PlayerBar {player} {doc} {settings} {accent} variant="panel" />
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
        <PlayerBar {player} {doc} {settings} {accent} variant="bar" />
      </div>
    </div>
    <div class="doc-scroll" bind:this={scrollEl}>
      <div class="doc-inner">{@render docText(true)}</div>
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
    height: 60px;
    flex-shrink: 0;
    padding: 0 clamp(14px, 3vw, 28px);
    border-bottom: 1px solid var(--n-border-1);
    background: rgba(2, 6, 24, 0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  .back {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .back.active {
    color: var(--n-fg-0);
    border-color: var(--n-border-3);
  }
  .top-meta {
    min-width: 0;
  }
  .top-title {
    font-weight: 700;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top-author {
    font-size: 12px;
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
  .settings-anchor {
    position: relative;
  }
  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 25;
  }
  .settings-pop {
    position: absolute;
    z-index: 30;
    top: calc(100% + 10px);
    right: 0;
    background: var(--n-bg-3);
    border: 1px solid var(--n-border-2);
    border-radius: 12px;
    box-shadow: var(--n-shadow-lg);
  }
  .seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-1);
    border-radius: 10px;
  }
  .seg-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
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
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    box-shadow: var(--n-shadow-xs);
  }
  /* ---------- immersive ---------- */
  .imm-scroll {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
  }
  .imm-doc-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 28px 24px 190px;
  }
  .imm-stage {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 24px 150px;
    overflow: hidden;
  }
  .imm-stage-inner {
    width: min(760px, 100%);
  }
  .imm-chapter {
    font-family: var(--n-font-mono);
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    margin-bottom: 28px;
  }
  .float-dock {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0 16px 22px;
    display: flex;
    justify-content: center;
    z-index: 12;
    pointer-events: none;
  }
  .float-inner {
    pointer-events: auto;
    width: min(720px, 100%);
    padding: 12px 18px;
    border-radius: 18px;
    background: var(--n-glass-bg);
    backdrop-filter: var(--n-glass-blur);
    -webkit-backdrop-filter: var(--n-glass-blur);
    border: 1px solid var(--n-glass-border);
    box-shadow: var(--n-shadow-lg);
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
    display: flex;
    align-items: center;
    justify-content: center;
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
    overflow-y: auto;
  }
  .doc-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px clamp(16px, 4vw, 24px) 160px;
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
    .seg-label {
      display: none;
    }
    .top-right :global(.meta-pill) {
      display: none;
    }
  }
</style>
