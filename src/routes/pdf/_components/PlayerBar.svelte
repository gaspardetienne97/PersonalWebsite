<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Gauge from "@lucide/svelte/icons/gauge";
  import List from "@lucide/svelte/icons/list";
  import Mic from "@lucide/svelte/icons/mic";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import SkipBack from "@lucide/svelte/icons/skip-back";
  import SkipForward from "@lucide/svelte/icons/skip-forward";

  import { formatNumber, intlLocale } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { KOKORO_VOICES, kokoroLoaded, kokoroSupported } from "@repo/pdf-core";
  import { fmt } from "@repo/pdf-core/domain";
  import type { NarrationPlayer } from "@repo/pdf-core/stores/narration";
  import type { ReaderSettings } from "@repo/pdf-core/stores/settings";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import ChapterList from "./ChapterList.svelte";

  let {
    player,
    settings,
    variant,
  }: {
    player: NarrationPlayer;
    settings: ReaderSettings;
    /** 'float' (immersive dock) | 'panel' (audiobook side panel) | 'bar' (document top bar) */
    variant: "float" | "panel" | "bar";
  } = $props();

  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  /** More chapter marks than this would blur into a second rail. */
  const MAX_MARKS = 40;

  let open = $state<"speed" | "chapters" | "voice" | null>(null);
  let trackEl: HTMLDivElement | undefined = $state();

  const naturalAvailable = kokoroSupported();
  const openUp = $derived(variant !== "bar");
  const isNatural = $derived(player.engineMode === "natural");
  const systemVoices = $derived(voiceCatalog.preferred);
  // With no voice chosen the browser reads with the device's own default.
  const systemVoice = $derived(
    player.voice ?? (voiceCatalog.voices.find((v) => v.default) ?? voiceCatalog.voices[0])?.name,
  );
  const voiceLabel = $derived(
    isNatural
      ? (KOKORO_VOICES.find((v) => v.id === player.naturalVoice)?.name ?? m.narrator_player_natural())
      : (systemVoice ?? m.narrator_player_voice()),
  );

  const chapters = $derived(player.model.chapters);
  const marks = $derived(
    chapters.length > 1 && chapters.length <= MAX_MARKS && player.model.total
      ? chapters.slice(1).map((c) => (c.start / player.model.total) * 100)
      : [],
  );
  // What is left at the speed being listened at.
  const timeLeft = $derived(fmt((player.model.total - player.pos) / player.speed));
  const percent = $derived(formatNumber(player.percent, { style: "percent", maximumFractionDigits: 0 }));

  const speedText = (s: number) => formatNumber(s, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "×";

  const languageNames = new Intl.DisplayNames([intlLocale()], { type: "language" });
  /** "en-US" in words. A tag the browser cannot name is shown as it is. */
  function languageName(tag: string): string {
    try {
      return languageNames.of(tag.replace("_", "-")) ?? tag;
    } catch {
      return tag;
    }
  }

  function scrub(e: MouseEvent) {
    if (!trackEl) return;
    const r = trackEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    player.seekTo(Math.max(0, Math.min(1, x)) * player.model.total);
  }

  function scrubKey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") player.prevSentence();
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") player.nextSentence();
    else if (e.key === "Home") player.seekTo(0);
    else return;
    e.preventDefault();
  }

  function togglePop(which: "speed" | "chapters" | "voice") {
    open = open === which ? null : which;
  }

  // Choosing a voice chooses its engine too.
  function chooseNatural(id: string) {
    settings.update("naturalVoice", id);
    settings.update("engine", "natural");
    player.retryNatural();
    open = null;
  }

  function chooseSystem(name: string) {
    settings.update("systemVoice", name);
    settings.update("engine", "system");
    player.setVoice(name);
    open = null;
  }

  // A press anywhere outside a chip and its menu closes the open menu. A listener, not a
  // fixed backdrop: the dock's backdrop-filter would hold a fixed element inside the dock.
  function closeOnOutsidePress(e: PointerEvent) {
    if (open && !(e.target as Element).closest(".pop-anchor")) open = null;
  }
</script>

<svelte:window
  onpointerdown={closeOnOutsidePress}
  onkeydown={(e) => {
    if (e.key === "Escape") open = null;
  }}
/>

{#snippet naturalGroup()}
  <div class="pop-label">{m.narrator_player_group_natural()}</div>
  {#if !naturalAvailable}
    <div class="pop-note-row">{m.narrator_player_natural_unsupported()}</div>
  {:else}
    {#if player.usingFallback}
      <div class="pop-note-row">{m.narrator_player_fallback()}</div>
    {:else if player.modelLoading}
      <div class="pop-note-row">
        {m.narrator_player_loading_progress({ percent: Math.round(player.modelProgress * 100) })}
      </div>
    {:else if !kokoroLoaded()}
      <div class="pop-note-row">{m.narrator_player_natural_download()}</div>
    {/if}
    {#each KOKORO_VOICES as v (v.id)}
      {@const active = isNatural && v.id === player.naturalVoice}
      <button class="pop-item voice-item" class:active aria-pressed={active} onclick={() => chooseNatural(v.id)}>
        <span class="voice-name">{v.name}</span>
        <span class="voice-lang">{languageName(v.lang)}</span>
        {#if active}<Check size={15} strokeWidth={2} class="pop-check" />{/if}
      </button>
    {/each}
  {/if}
{/snippet}

{#snippet systemGroup()}
  <div class="pop-label">{m.narrator_player_group_system()}</div>
  {#if systemVoices.length === 0}
    <div class="pop-note-row">{m.narrator_player_system_default()}</div>
  {:else}
    {#each systemVoices as v (v.voiceURI)}
      {@const active = !isNatural && v.name === systemVoice}
      <button class="pop-item voice-item" class:active aria-pressed={active} onclick={() => chooseSystem(v.name)}>
        <span class="voice-name">{v.name}</span>
        <span class="voice-lang">{languageName(v.lang)}</span>
        {#if active}<Check size={15} strokeWidth={2} class="pop-check" />{/if}
      </button>
    {/each}
  {/if}
{/snippet}

<div class="player {variant}" class:above={openUp}>
  <div class="transport">
    <button
      class="ctrl"
      aria-label={m.narrator_player_previous()}
      data-tip={m.narrator_player_previous()}
      onclick={() => player.prevSentence()}
    >
      <SkipBack size={20} strokeWidth={1.5} />
    </button>
    <button
      class="play"
      aria-label={player.playing ? m.narrator_player_pause() : m.narrator_player_play()}
      onclick={() => player.toggle()}
    >
      {#if player.playing && player.modelLoading}
        <span class="play-spinner"></span>
      {:else if player.playing}
        <Pause size={24} strokeWidth={2} />
      {:else}
        <Play size={24} strokeWidth={2} style="margin-left: 2px" />
      {/if}
    </button>
    <button
      class="ctrl"
      aria-label={m.narrator_player_next()}
      data-tip={m.narrator_player_next()}
      onclick={() => player.nextSentence()}
    >
      <SkipForward size={20} strokeWidth={1.5} />
    </button>
  </div>

  <div class="scrubber">
    <span class="time">{fmt(player.pos)}</span>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="track"
      bind:this={trackEl}
      role="slider"
      tabindex="0"
      aria-label={m.narrator_player_position()}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(player.percent * 100)}
      aria-valuetext="{fmt(player.pos)} / {fmt(player.model.total)}"
      onclick={scrub}
      onkeydown={scrubKey}
    >
      <div class="rail"></div>
      <div class="fill" style:width="{player.percent * 100}%"></div>
      {#each marks as left, i (i)}
        <span class="mark" style:left="{left}%"></span>
      {/each}
      <div class="thumb" style:left="{player.percent * 100}%"></div>
    </div>
    <span class="time" aria-label={m.narrator_player_time_left({ time: timeLeft })}>−{timeLeft}</span>
  </div>

  <!-- Where the playhead is, in words: the chapter, and how far through the whole document. -->
  <div class="where">
    {#if player.modelLoading}
      <span class="where-main" role="status">
        {m.narrator_player_loading_progress({ percent: Math.round(player.modelProgress * 100) })}
      </span>
    {:else}
      <span class="where-main">
        {#if chapters.length > 1}
          <span class="where-count">
            {m.narrator_player_chapter_of({ n: player.chapterIndex + 1, total: chapters.length })}
          </span>
        {/if}
        <span class="where-title">{chapters[player.chapterIndex]?.title ?? ""}</span>
      </span>
    {/if}
    <span class="where-pct long">{m.narrator_player_percent({ percent })}</span>
    <span class="where-pct short" aria-hidden="true">{percent}</span>
  </div>

  <div class="extras">
    <div class="pop-anchor">
      <button
        class="chip"
        class:open={open === "speed"}
        aria-label={m.narrator_player_speed({ speed: speedText(player.speed) })}
        aria-expanded={open === "speed"}
        onclick={() => togglePop("speed")}
      >
        <Gauge size={15} strokeWidth={1.5} />
        {speedText(player.speed)}
      </button>
      {#if open === "speed"}
        <div class="pop center speed-pop">
          {#each SPEEDS as s (s)}
            <button
              class="pop-item"
              class:active={s === player.speed}
              onclick={() => {
                player.setSpeed(s);
                open = null;
              }}
            >
              <span class="speed-value">{speedText(s)}</span>
              {#if s === 1}<span class="pop-note">{m.narrator_player_normal()}</span>{/if}
              {#if s === player.speed}<Check size={15} strokeWidth={2} class="pop-check" />{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="pop-anchor">
      <button
        class="chip"
        class:open={open === "chapters"}
        aria-expanded={open === "chapters"}
        onclick={() => togglePop("chapters")}
      >
        <List size={15} strokeWidth={1.5} />
        {m.narrator_player_chapters()}
      </button>
      {#if open === "chapters"}
        <div class="pop right chapters-pop">
          <div class="pop-head">
            <span>{m.narrator_player_chapters()}</span>
            <span>{chapters.length}</span>
          </div>
          <div class="pop-scroll">
            <ChapterList
              model={player.model}
              chapterIndex={player.chapterIndex}
              playing={player.playing}
              onseek={(i) => {
                player.seekChapter(i);
                open = null;
              }}
            />
          </div>
        </div>
      {/if}
    </div>

    <div class="pop-anchor voice-anchor">
      <button
        class="chip voice-chip"
        class:open={open === "voice"}
        aria-label={m.narrator_player_voice_named({ voice: voiceLabel })}
        aria-expanded={open === "voice"}
        onclick={() => togglePop("voice")}
      >
        <Mic size={15} strokeWidth={1.5} />
        <span class="voice-chip-label">{voiceLabel}</span>
        <ChevronDown size={13} strokeWidth={1.5} />
      </button>
      {#if open === "voice"}
        <div class="pop right voices-pop">
          <!-- Both kinds of voice, whichever is reading. The kind in use comes first. -->
          <div class="pop-scroll">
            {#if isNatural}
              {@render naturalGroup()}
              {@render systemGroup()}
            {:else}
              {@render systemGroup()}
              {@render naturalGroup()}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .player {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "transport scrubber"
      "transport where"
      "extras extras";
    column-gap: 20px;
    row-gap: 2px;
    align-items: center;
    width: 100%;
  }
  .player.panel {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "scrubber"
      "where"
      "transport"
      "extras";
    row-gap: 10px;
  }

  /* ---------- transport ---------- */
  .transport {
    grid-area: transport;
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: center;
  }
  .ctrl {
    position: relative;
    width: 44px;
    height: 44px;
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
  /* The button's name, shown to a mouse or a keyboard: the icons alone do not say what is skipped. */
  .ctrl::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    padding: 5px 9px;
    border-radius: 7px;
    background: var(--n-bg-3);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms var(--n-ease-out);
    z-index: 40;
  }
  .bar .ctrl::after {
    top: calc(100% + 8px);
    bottom: auto;
  }
  .ctrl:focus-visible::after {
    opacity: 1;
  }
  @media (hover: hover) {
    .ctrl:hover::after {
      opacity: 1;
    }
  }
  .play {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    color: var(--n-on-accent);
    background: var(--n-accent);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--n-accent) 45%, transparent);
    transition: transform 120ms var(--n-ease-out);
  }
  .play:active {
    transform: scale(0.95);
  }
  .play-spinner {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2.5px solid color-mix(in srgb, var(--n-on-accent) 35%, transparent);
    border-top-color: var(--n-on-accent);
    animation: n-spin 0.8s linear infinite;
  }

  /* ---------- scrubber ---------- */
  .scrubber {
    grid-area: scrubber;
    align-self: end;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  .panel .scrubber {
    align-self: center;
  }
  .time {
    font-family: var(--n-font-mono);
    font-size: 13px;
    color: var(--n-fg-1);
    flex-shrink: 0;
    min-width: 38px;
    text-align: center;
    white-space: nowrap;
  }
  .track {
    position: relative;
    flex: 1;
    height: 6px;
    cursor: pointer;
    min-width: 80px;
    border-radius: 999px;
  }
  /* A finger-sized target around a thin bar. */
  .track::before {
    content: "";
    position: absolute;
    inset: -14px 0;
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
    background: var(--n-accent);
  }
  /* Where each chapter begins: a notch through the rail. */
  .mark {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    margin-left: -1px;
    background: var(--n-fg-2);
    border-radius: 1px;
  }
  .thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: var(--n-fg-0);
    box-shadow: var(--n-shadow-sm);
  }

  /* ---------- where ---------- */
  .where {
    grid-area: where;
    align-self: start;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    /* Lined up with the rail, inside the two times. */
    padding: 0 50px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--n-fg-2);
  }
  .panel .where {
    padding: 0;
  }
  /* The side panel is narrow: the chapter's name gets the room, the percent stands alone. */
  .panel .where-pct.long {
    display: none;
  }
  .panel .where-pct.short {
    display: inline;
  }
  .where-main {
    display: flex;
    min-width: 0;
  }
  .where-count {
    flex-shrink: 0;
    color: var(--n-fg-1);
    font-weight: 600;
  }
  .where-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where-count + .where-title:not(:empty)::before {
    content: "·";
    margin: 0 7px;
  }
  .where-pct {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .where-pct.short {
    display: none;
  }

  /* ---------- chips and menus ---------- */
  .extras {
    grid-area: extras;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .panel .extras {
    justify-content: center;
    margin-top: 0;
  }
  /* In the document bar a menu drops from its own chip. */
  .pop-anchor {
    position: relative;
    min-width: 0;
  }
  /* In the dock and the side panel the chips sit under the transport, so a menu opening from
     its chip would cover the play button. There it opens above the whole player instead:
     placed against the player (the anchor is static), level with its chip's left edge. */
  .above .pop-anchor {
    position: static;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    max-width: 100%;
    padding: 0 13px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-1);
    color: var(--n-fg-1);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover,
  .chip.open {
    color: var(--n-fg-0);
    border-color: var(--n-border-3);
  }
  .voice-chip-label {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .voice-chip :global(svg) {
    flex-shrink: 0;
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
  .pop.center {
    left: 50%;
    transform: translateX(-50%);
  }
  .pop.right {
    right: 0;
  }
  .above .pop {
    top: auto;
    bottom: calc(100% + 22px);
    left: auto;
    right: auto;
    transform: none;
  }
  /* The side panel is narrow: its two wide menus take the panel's width. */
  .panel .pop.right {
    left: 0;
    right: 0;
    width: auto;
    max-width: 320px;
    margin-inline: auto;
  }
  .speed-pop {
    min-width: 172px;
    max-height: min(480px, calc(100dvh - 260px));
    overflow-y: auto;
  }
  .chapters-pop {
    width: 420px;
    max-width: calc(100vw - 32px);
    max-height: min(480px, calc(100dvh - 260px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 8px;
  }
  .pop-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 8px;
    font-family: var(--n-font-mono);
    font-size: 12px;
    color: var(--n-fg-2);
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
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--n-fg-2);
    padding: 8px 10px 6px;
  }
  .pop-note-row {
    margin: 0 6px 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--n-bg-2);
    font-size: 13px;
    line-height: 1.4;
    color: var(--n-fg-1);
  }
  .pop-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    text-align: left;
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: var(--n-fg-1);
  }
  .pop-item:hover {
    background: var(--n-bg-2);
  }
  /* The chosen row: a tint, a heavier weight and a check. */
  .pop-item.active {
    color: var(--n-fg-0);
    font-weight: 700;
    background: color-mix(in srgb, var(--n-accent) 16%, var(--n-bg-2));
  }
  .pop-item :global(.pop-check) {
    margin-left: auto;
    flex-shrink: 0;
  }
  .speed-value {
    font-family: var(--n-font-mono);
    font-size: 13px;
  }
  .pop-note {
    color: var(--n-fg-2);
    font-size: 12px;
    font-weight: 500;
  }
  .voices-pop {
    width: 320px;
    max-width: calc(100vw - 32px);
    max-height: min(480px, calc(100dvh - 260px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .voice-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .voice-lang {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: var(--n-fg-2);
  }

  /* Stacked, the side panel sits at the top of the screen: its menus open below it. */
  @media (max-width: 900px) {
    .panel .pop {
      top: calc(100% + 12px);
      bottom: auto;
    }
  }

  @media (max-width: 560px) {
    /* The phone dock, two rows: transport with the times and the place, then the three chips.
       The scrubber is the dock's own top edge. */
    .player.float {
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas:
        "track track track track"
        "transport . elapsed left"
        "transport where where where"
        "extras extras extras extras";
      column-gap: 10px;
      row-gap: 0;
      padding: 0 12px calc(8px + env(safe-area-inset-bottom));
    }
    .float .scrubber {
      display: contents;
    }
    .float .track {
      grid-area: track;
      height: 4px;
      margin: 0 -12px 8px;
      border-radius: 0;
    }
    /* 44 px of touch around the edge, most of it above so it never covers the buttons. */
    .float .track::before {
      inset: -32px 0 -8px;
    }
    .float .rail,
    .float .fill {
      border-radius: 0;
    }
    .float .thumb {
      width: 12px;
      height: 12px;
    }
    .float .time {
      align-self: end;
      min-width: 0;
    }
    .float .time:first-child {
      grid-area: elapsed;
    }
    .float .time:last-child {
      grid-area: left;
    }
    .float .transport {
      gap: 4px;
    }
    .float .play {
      width: 48px;
      height: 48px;
    }
    .float .where {
      justify-content: flex-end;
      gap: 0;
      padding: 0;
    }
    .float .where-title {
      display: none;
    }
    .float .where-pct.long {
      display: none;
    }
    .float .where-pct.short {
      display: inline;
    }
    .float .where-count::after {
      content: "·";
      margin: 0 6px;
      font-weight: 500;
    }
    .float .where-main[role="status"] {
      margin-right: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
    }
    /* Three chips on one line: the voice takes what is left and its name shortens. */
    .float .extras {
      flex-wrap: nowrap;
      margin-top: 6px;
    }
    .float .chip {
      min-height: 44px;
      padding: 0 12px;
    }
    .float .voice-anchor {
      flex: 1;
    }
    .float .voice-chip {
      width: 100%;
    }
    .float .voice-chip-label {
      flex: 1;
      max-width: none;
      text-align: left;
    }
    .above .pop {
      bottom: calc(100% + 12px);
    }
    /* On a phone every menu is placed against the player, and the two wide ones span it. */
    .pop-anchor {
      position: static;
    }
    .pop.center {
      left: 12px;
      transform: none;
    }
    .pop.right {
      left: 8px;
      right: 8px;
      width: auto;
      max-width: none;
    }
    /* The document bar stacks like the side panel. */
    .player.bar {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "scrubber"
        "where"
        "transport"
        "extras";
      row-gap: 8px;
    }
    .bar .where {
      padding: 0;
    }
    .bar .extras {
      justify-content: center;
      margin-top: 0;
    }
  }
</style>
