<script lang="ts">
  import Check from "lucide-svelte/icons/check";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import Gauge from "lucide-svelte/icons/gauge";
  import List from "lucide-svelte/icons/list";
  import Mic from "lucide-svelte/icons/mic";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import SkipForward from "lucide-svelte/icons/skip-forward";

  import { KOKORO_VOICES } from "@repo/pdf-core";
  import { fmt, type NarratorDoc } from "@repo/pdf-core/domain";
  import type { NarrationPlayer } from "@repo/pdf-core/stores/narration";
  import type { ReaderSettings } from "@repo/pdf-core/stores/settings";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import ChapterList from "./ChapterList.svelte";

  let {
    player,
    doc,
    settings,
    accent,
    variant,
  }: {
    player: NarrationPlayer;
    doc: NarratorDoc;
    settings: ReaderSettings;
    accent: string;
    /** 'float' (immersive glass dock) | 'panel' (audiobook side panel) | 'bar' (document top bar) */
    variant: "float" | "panel" | "bar";
  } = $props();

  const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

  let open = $state<"speed" | "chapters" | "voice" | null>(null);
  let trackEl: HTMLDivElement | undefined = $state();

  const openUp = $derived(variant !== "bar");
  const speedLabel = $derived(player.speed % 1 === 0 ? player.speed + ".0" : String(player.speed));
  const isNatural = $derived(player.engineMode === "natural");
  const systemVoices = $derived(voiceCatalog.preferred);
  const voiceLabel = $derived(
    isNatural
      ? (KOKORO_VOICES.find((v) => v.id === player.naturalVoice)?.label.split(" — ")[0] ?? "Natural")
      : (player.voice ?? "Voice"),
  );

  function scrub(e: MouseEvent) {
    if (!trackEl) return;
    const r = trackEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    player.seekTo(Math.max(0, Math.min(1, x)) * player.model.total);
  }

  function togglePop(which: "speed" | "chapters" | "voice") {
    open = open === which ? null : which;
  }
</script>

{#snippet transport()}
  <div class="transport" class:panel={variant === "panel"}>
    <button class="ctrl" title="Previous sentence" onclick={() => player.prevSentence()}>
      <SkipBack size={20} strokeWidth={1.5} />
    </button>
    <button
      class="play"
      style:background={accent}
      style:box-shadow="0 6px 20px color-mix(in srgb, {accent} 45%, transparent)"
      aria-label={player.playing ? "Pause" : "Play"}
      onclick={() => player.toggle()}
    >
      {#if player.playing && player.modelLoading}
        <span class="play-spinner" title="Loading neural voice"></span>
      {:else if player.playing}
        <Pause size={24} strokeWidth={2} style="color: #fff" />
      {:else}
        <Play size={24} strokeWidth={2} style="color: #fff; margin-left: 2px" />
      {/if}
    </button>
    <button class="ctrl" title="Next sentence" onclick={() => player.nextSentence()}>
      <SkipForward size={20} strokeWidth={1.5} />
    </button>
  </div>
{/snippet}

{#snippet scrubber()}
  <div class="scrubber">
    <span class="time">{fmt(player.pos)}</span>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="track" bind:this={trackEl} onclick={scrub}>
      <div class="rail"></div>
      <div class="fill" style:width="{player.percent * 100}%" style:background={accent}></div>
      <div class="thumb" style:left="calc({player.percent * 100}% - 7px)"></div>
    </div>
    <span class="time">{fmt(player.model.total)}</span>
  </div>
{/snippet}

{#snippet extras()}
  <div class="extras">
    {#if open}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="backdrop" onclick={() => (open = null)}></div>
    {/if}

    <div class="pop-anchor">
      <button class="chip" class:open={open === "speed"} onclick={() => togglePop("speed")}>
        <Gauge size={15} strokeWidth={1.5} />
        {speedLabel}x
      </button>
      {#if open === "speed"}
        <div class="pop center" class:up={openUp} style="min-width: 132px">
          {#each SPEEDS as s (s)}
            <button
              class="pop-item"
              style:color={s === player.speed ? accent : "var(--n-fg-1)"}
              style:font-weight={s === player.speed ? 700 : 500}
              onclick={() => {
                player.setSpeed(s);
                open = null;
              }}
            >
              {s % 1 === 0 ? s + ".0" : s}x
              {#if s === 1}<span class="pop-note">normal</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="pop-anchor">
      <button class="chip" class:open={open === "chapters"} onclick={() => togglePop("chapters")}>
        <List size={15} strokeWidth={1.5} /> Chapters
      </button>
      {#if open === "chapters"}
        <div class="pop right chapters-pop" class:up={openUp}>
          <div class="pop-head">
            <span>Chapters</span>
            <span>{player.model.chapters.length}</span>
          </div>
          <div class="pop-scroll">
            <ChapterList
              model={player.model}
              {doc}
              chapterIndex={player.chapterIndex}
              compact
              onseek={(i) => {
                player.seekChapter(i);
                open = null;
              }}
            />
          </div>
        </div>
      {/if}
    </div>

    <div class="pop-anchor">
      <button class="chip voice-chip" class:open={open === "voice"} onclick={() => togglePop("voice")}>
        <Mic size={15} strokeWidth={1.5} />
        <span class="voice-chip-label">{voiceLabel}</span>
        <ChevronDown size={12} strokeWidth={1.5} style="opacity: 0.55; margin-left: 1px" />
      </button>
      {#if open === "voice"}
        <div class="pop right voices-pop" class:up={openUp}>
          <div class="pop-label">{isNatural ? "Natural voice (Kokoro)" : "Narrator voice"}</div>
          {#if player.usingFallback}
            <div class="pop-note-row">Natural voice unavailable here — using the system voice.</div>
          {/if}
          {#if isNatural && player.modelLoading}
            <div class="pop-note-row loading">
              Loading neural voice… {Math.round(player.modelProgress * 100)}%
            </div>
          {/if}
          <div class="pop-scroll">
            {#if isNatural}
              {#each KOKORO_VOICES as v (v.id)}
                <button
                  class="pop-item voice-item"
                  class:active={v.id === player.naturalVoice}
                  onclick={() => {
                    settings.update("naturalVoice", v.id);
                    open = null;
                  }}
                >
                  <Mic size={14} strokeWidth={1.5} style="color: {v.id === player.naturalVoice ? accent : 'var(--n-fg-3)'}" />
                  <span class="voice-name">{v.label}</span>
                  {#if v.id === player.naturalVoice}
                    <Check size={14} strokeWidth={1.5} style="color: {accent}" />
                  {/if}
                </button>
              {/each}
            {:else if systemVoices.length === 0}
              <div class="pop-empty">Using the system default voice</div>
            {:else}
              {#each systemVoices as v (v.voiceURI)}
                <button
                  class="pop-item voice-item"
                  class:active={v.name === player.voice}
                  onclick={() => {
                    settings.update("systemVoice", v.name);
                    player.setVoice(v.name);
                    open = null;
                  }}
                >
                  <Mic size={14} strokeWidth={1.5} style="color: {v.name === player.voice ? accent : 'var(--n-fg-3)'}" />
                  <span class="voice-name">{v.name}</span>
                  <span class="voice-lang">{v.lang}</span>
                  {#if v.name === player.voice}
                    <Check size={14} strokeWidth={1.5} style="color: {accent}" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if variant === "panel"}
  <div class="layout-panel">
    {@render scrubber()}
    {@render transport()}
    <div class="extras-center">{@render extras()}</div>
  </div>
{:else}
  <div class="layout-row">
    {@render transport()}
    <div class="scrub-grow">{@render scrubber()}</div>
    <div class="player-extras">{@render extras()}</div>
  </div>
{/if}

<style>
  .play-spinner {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2.5px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    animation: n-spin 0.8s linear infinite;
  }
  .layout-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .extras-center {
    display: flex;
    justify-content: center;
  }
  .layout-row {
    display: flex;
    align-items: center;
    gap: 20px;
    width: 100%;
    flex-wrap: wrap;
  }
  .scrub-grow {
    flex: 1;
    min-width: 200px;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: center;
  }
  .transport.panel {
    gap: 18px;
  }
  .ctrl {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: var(--n-fg-1);
    cursor: pointer;
    transition: all 150ms var(--n-ease-out);
  }
  .ctrl:hover {
    color: var(--n-fg-0);
    background: var(--n-bg-2);
  }
  .play {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: none;
    cursor: pointer;
    transition: transform 120ms var(--n-ease-out);
    flex-shrink: 0;
  }
  .play:active {
    transform: scale(0.95);
  }
  .scrubber {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  .time {
    font-family: var(--n-font-mono);
    font-size: 12px;
    color: var(--n-fg-2);
    flex-shrink: 0;
    min-width: 38px;
    text-align: center;
  }
  .track {
    position: relative;
    flex: 1;
    height: 6px;
    cursor: pointer;
    min-width: 80px;
  }
  .rail {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--n-bg-3);
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 999px;
  }
  .thumb {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #fff;
    box-shadow: var(--n-shadow-sm);
  }
  .extras {
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
    flex-wrap: wrap;
    justify-content: center;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 25;
  }
  .pop-anchor {
    position: relative;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--n-border-1);
    background: var(--n-bg-1);
    color: var(--n-fg-1);
    font-family: var(--n-font-mono);
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip.open {
    color: var(--n-fg-0);
  }
  .pop {
    position: absolute;
    z-index: 30;
    top: calc(100% + 10px);
    background: var(--n-bg-3);
    border: 1px solid var(--n-border-2);
    border-radius: 12px;
    padding: 6px;
    box-shadow: var(--n-shadow-lg);
  }
  .pop.up {
    top: auto;
    bottom: calc(100% + 10px);
  }
  .pop.center {
    left: 50%;
    transform: translateX(-50%);
  }
  .pop.right {
    right: 0;
  }
  .chapters-pop {
    width: 300px;
    max-height: 340px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 8px;
  }
  .pop-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px 8px;
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-3);
  }
  .pop-head span:first-child {
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .pop-scroll {
    overflow-y: auto;
  }
  .pop-label {
    font-family: var(--n-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--n-fg-3);
    padding: 4px 10px 8px;
  }
  .pop-note-row {
    margin: 0 6px 6px;
    padding: 7px 9px;
    border-radius: 8px;
    background: var(--n-bg-2);
    font-family: var(--n-font-sans);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--n-fg-2);
  }
  .pop-note-row.loading {
    color: var(--n-fg-1);
  }
  .pop-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: var(--n-font-mono);
    font-size: 13px;
    color: var(--n-fg-1);
  }
  .pop-item:hover {
    background: var(--n-bg-2);
  }
  .pop-note {
    color: var(--n-fg-3);
    font-size: 11px;
  }
  .voice-chip-label {
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .voices-pop {
    width: 264px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .voice-item {
    font-family: var(--n-font-sans);
    color: var(--n-fg-1);
  }
  .voice-item.active {
    color: var(--n-fg-0);
    background: var(--n-bg-2);
  }
  .voice-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .voice-lang {
    font-family: var(--n-font-mono);
    font-size: 10px;
    color: var(--n-fg-3);
  }
  .pop-empty {
    padding: 10px 12px;
    font-size: 13px;
    color: var(--n-fg-3);
  }
  @media (max-width: 560px) {
    .player-extras {
      width: 100%;
      justify-content: center;
      margin-top: 8px;
    }
  }
</style>
