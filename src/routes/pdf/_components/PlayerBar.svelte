<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Gauge from "@lucide/svelte/icons/gauge";
  import List from "@lucide/svelte/icons/list";
  import Mic from "@lucide/svelte/icons/mic";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import X from "@lucide/svelte/icons/x";
  import { onDestroy } from "svelte";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { KOKORO_VOICES, kokoroLoaded, kokoroSupported, synthesize, type KokoroVoice } from "@repo/pdf-core";
  import { fmt, sentenceAt } from "@repo/pdf-core/domain";
  import { getSynth } from "@repo/pdf-core/services/tts";
  import type { NarrationPlayer } from "@repo/pdf-core/stores/narration";
  import { stepWithin, type ReaderSettings } from "@repo/pdf-core/stores/settings";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import ChapterList from "./ChapterList.svelte";
  import { languageName, sampleFor } from "./languages";

  type Menu = "speed" | "chapters" | "voice" | null;

  let {
    player,
    settings,
    variant,
    menu = $bindable(null),
    onjump,
  }: {
    player: NarrationPlayer;
    settings: ReaderSettings;
    /** 'float' (immersive dock) | 'panel' (audiobook side panel) | 'bar' (document top bar) */
    variant: "float" | "panel" | "bar";
    /** The menu that is open, for the reader to dim the text behind the chapter list. */
    menu?: Menu;
    /** A chapter was chosen from the list. `from` is where the playhead was. */
    onjump?: (from: number) => void;
  } = $props();

  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const SPEED_RANGE = { min: 0.5, max: 3, step: 0.1 };
  /** More chapter marks than this would blur into a second rail. */
  const MAX_MARKS = 40;

  let trackEl: HTMLDivElement | undefined = $state();

  const naturalAvailable = kokoroSupported();
  const openUp = $derived(variant !== "bar");
  const isNatural = $derived(player.engineMode === "natural");
  // With no voice chosen the browser reads with the device's own default.
  const systemVoice = $derived(
    player.voice ?? (voiceCatalog.voices.find((v) => v.default) ?? voiceCatalog.voices[0])?.name,
  );
  const currentNatural = $derived(KOKORO_VOICES.find((v) => v.id === player.naturalVoice));
  const currentSystem = $derived(voiceCatalog.voices.find((v) => v.name === systemVoice));
  const voiceLabel = $derived(
    isNatural
      ? (currentNatural?.name ?? m.narrator_player_natural())
      : (systemVoice ?? m.narrator_player_voice()),
  );
  // The menu lists the system voices that speak the listener's language. The settings page has
  // them all. A device with none in that language shows what it has.
  const listenerLanguage = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
  const systemVoices = $derived.by(() => {
    const all = voiceCatalog.preferred;
    const mine = all.filter((v) => v.lang?.slice(0, 2).toLowerCase() === listenerLanguage);
    return mine.length ? mine : all;
  });

  const chapters = $derived(player.model.chapters);
  const marks = $derived(
    chapters.length > 1 && chapters.length <= MAX_MARKS && player.model.total
      ? chapters.slice(1).map((c) => (c.start / player.model.total) * 100)
      : [],
  );
  // The current chapter's stretch of the rail, tinted so its length shows without a pointer.
  const span = $derived.by(() => {
    const chapter = chapters[player.chapterIndex];
    if (chapters.length < 2 || !chapter || !player.model.total) return null;
    return {
      left: (chapter.start / player.model.total) * 100,
      width: ((chapter.end - chapter.start) / player.model.total) * 100,
    };
  });
  // What is left at the speed being listened at.
  const timeLeft = $derived(fmt((player.model.total - player.pos) / player.speed));
  const percent = $derived(formatNumber(player.percent, { style: "percent", maximumFractionDigits: 0 }));

  const speedText = (s: number) => formatNumber(s, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "×";
  const presetText = (s: number) => formatNumber(s, { maximumFractionDigits: 2 }) + "×";

  // ---- scrubber: a press or a drag lands on the start of a sentence ----

  let dragging = false;
  /** The chapter and time under the pointer, shown above the rail. */
  let tip = $state<{ left: number; title: string; time: string } | null>(null);

  function fractionAt(e: PointerEvent): number {
    if (!trackEl) return 0;
    const r = trackEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  function showTip(e: PointerEvent) {
    const fraction = fractionAt(e);
    const pos = fraction * player.model.total;
    const chapter = chapters.filter((c) => c.start <= pos).at(-1) ?? chapters[0];
    tip = { left: fraction * 100, title: chapter?.title ?? "", time: fmt(pos) };
  }

  function scrubTo(e: PointerEvent, always: boolean) {
    const sentence = sentenceAt(player.model, fractionAt(e) * player.model.total);
    // While dragging, only a new sentence moves the playhead: the voice is not restarted on every pixel.
    if (sentence && (always || sentence.si !== player.sentenceIndex)) player.seekTo(sentence.start);
  }

  function scrubStart(e: PointerEvent) {
    dragging = true;
    trackEl?.setPointerCapture(e.pointerId);
    scrubTo(e, true);
    showTip(e);
  }

  function scrubMove(e: PointerEvent) {
    showTip(e);
    if (dragging) scrubTo(e, false);
  }

  function scrubEnd(e: PointerEvent) {
    dragging = false;
    // A finger leaves no pointer behind to hover with.
    if (e.pointerType !== "mouse") tip = null;
  }

  function scrubKey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") player.prevSentence();
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") player.nextSentence();
    else if (e.key === "Home") player.seekTo(0);
    else return;
    e.preventDefault();
  }

  // ---- menus ----

  function toggleMenu(which: Exclude<Menu, null>) {
    menu = menu === which ? null : which;
  }

  // Choosing a voice chooses its engine too.
  function chooseNatural(id: string) {
    settings.update("naturalVoice", id);
    settings.update("engine", "natural");
    player.retryNatural();
    menu = null;
  }

  function chooseSystem(name: string) {
    settings.update("systemVoice", name);
    settings.update("engine", "system");
    player.setVoice(name);
    menu = null;
  }

  // A press anywhere outside a chip and its menu closes the open menu. A listener, not a
  // fixed backdrop: the dock's backdrop-filter would hold a fixed element inside the dock.
  function closeOnOutsidePress(e: PointerEvent) {
    if (menu && !(e.target as Element).closest(".pop-anchor")) menu = null;
  }

  // One line about a voice, in the words of the settings page: "US English, female".
  const naturalDetail = (v: KokoroVoice) => {
    const lang = languageName(v.lang, undefined, true);
    return v.gender === "male" ? m.narrator_settings_detail_male({ lang }) : m.narrator_settings_detail_female({ lang });
  };
  const systemDetail = (v: SpeechSynthesisVoice) => {
    const lang = languageName(v.lang, undefined, true);
    return v.localService ? lang : m.narrator_settings_network({ lang });
  };

  // A menu's list stops on a whole row, never part of one, and marks its foot while more follows.
  function endOnRow(node: HTMLElement) {
    const more = () =>
      node.toggleAttribute("data-more", node.scrollTop + node.clientHeight < node.scrollHeight - 2);
    const limit = node.clientHeight;
    if (node.scrollHeight > limit + 1) {
      const top = node.getBoundingClientRect().top;
      let end = 0;
      for (const row of node.querySelectorAll<HTMLElement>("[data-row]")) {
        const bottom = row.getBoundingClientRect().bottom - top;
        if (bottom > limit) break;
        end = bottom;
      }
      if (end) node.style.maxHeight = `${Math.ceil(end) + 2}px`;
    }
    more();
    node.addEventListener("scroll", more, { passive: true });
    return { destroy: () => node.removeEventListener("scroll", more) };
  }

  // ---- voice previews: one at a time, and never over the reading ----

  let previewing = $state<string | null>(null);
  let previewAudio: HTMLAudioElement | null = null;
  // Bumped on every start and stop, so a late event from an older preview is ignored.
  let previewRun = 0;

  function stopPreview() {
    previewRun++;
    if (previewing?.startsWith("sys:")) getSynth()?.cancel();
    if (previewAudio) {
      previewAudio.pause();
      if (previewAudio.src) URL.revokeObjectURL(previewAudio.src);
      previewAudio = null;
    }
    previewing = null;
  }

  function previewSystem(voice: SpeechSynthesisVoice) {
    const id = "sys:" + voice.voiceURI;
    if (previewing === id) return stopPreview();
    stopPreview();
    player.pause();
    const synth = getSynth();
    if (!synth) return;
    const run = previewRun;
    const utterance = new SpeechSynthesisUtterance(sampleFor(voice.lang));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onend = utterance.onerror = () => {
      if (run === previewRun) previewing = null;
    };
    previewing = id;
    synth.speak(utterance);
  }

  async function previewNatural(id: string, lang: string) {
    const key = "nat:" + id;
    if (previewing === key) return stopPreview();
    stopPreview();
    player.pause();
    const run = previewRun;
    previewing = key;
    try {
      const result = await synthesize(sampleFor(lang), id, settings.modelQuality);
      if (run !== previewRun) return URL.revokeObjectURL(result.url);
      const audio = new Audio(result.url);
      audio.onended = audio.onerror = () => {
        if (run === previewRun) stopPreview();
      };
      previewAudio = audio;
      await audio.play();
    } catch {
      if (run === previewRun) stopPreview();
    }
  }

  // The menu closing ends its preview. A press on Play closes the menu first (pointerdown), so
  // this runs before the reading starts.
  $effect(() => {
    if (menu !== "voice") stopPreview();
  });
  onDestroy(stopPreview);
</script>

<svelte:window
  onpointerdown={closeOnOutsidePress}
  onkeydown={(e) => {
    if (e.key === "Escape") menu = null;
  }}
/>

<!-- "Previous sentence" and "Next sentence": a chevron beside lines of text. -->
{#snippet stepGlyph(forward: boolean)}
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    style:transform={forward ? "scaleX(-1)" : undefined}
  >
    <path d="M9.5 6.5 4 12l5.5 5.5" />
    <path d="M13.5 8H20M13.5 12H20M13.5 16h4" />
  </svg>
{/snippet}

{#snippet step(label: string, short: string, onclick: () => void, forward: boolean, extra = "")}
  <div class="step {extra}">
    <button class="ctrl" aria-label={label} {onclick}>
      {#if extra === "replay"}
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      {:else}
        {@render stepGlyph(forward)}
      {/if}
    </button>
    <!-- The same words as the button's name, so they are not read twice. A phone has the room
         for one word. -->
    <span class="cap long" aria-hidden="true">{label}</span>
    <span class="cap short" aria-hidden="true">{short}</span>
  </div>
{/snippet}

{#snippet voiceRow(
  key: string,
  name: string,
  detail: string,
  active: boolean,
  choose: () => void,
  preview: (() => void) | null,
)}
  {@const mine = previewing === key}
  <div class="voice-row" class:active data-row>
    {#if preview}
      <button
        class="preview"
        class:on={mine}
        aria-pressed={mine}
        aria-label={mine ? m.narrator_settings_stop_preview({ name }) : m.narrator_settings_preview({ name })}
        onclick={preview}
      >
        {#if mine}
          <Pause size={16} strokeWidth={2} />
        {:else}
          <Play size={16} strokeWidth={2} style="margin-left: 1px" />
        {/if}
      </button>
    {/if}
    <button class="voice-main" aria-pressed={active} onclick={choose}>
      <span class="voice-text">
        <span class="voice-name">{name}</span>
        <span class="voice-lang">{mine ? m.narrator_settings_playing() : detail}</span>
      </span>
      {#if active}
        <span class="in-use"><Check size={15} strokeWidth={2.25} /> {m.narrator_settings_in_use()}</span>
      {/if}
    </button>
  </div>
{/snippet}

{#snippet naturalRow(v: KokoroVoice)}
  {@render voiceRow(
    "nat:" + v.id,
    v.name,
    naturalDetail(v),
    isNatural && v.id === player.naturalVoice,
    () => chooseNatural(v.id),
    // Before the download a preview would start it. The row itself is how the voice is first used.
    kokoroLoaded() ? () => previewNatural(v.id, v.lang) : null,
  )}
{/snippet}

{#snippet systemRow(v: SpeechSynthesisVoice)}
  {@render voiceRow(
    "sys:" + v.voiceURI,
    v.name,
    systemDetail(v),
    !isNatural && v.name === systemVoice,
    () => chooseSystem(v.name),
    () => previewSystem(v),
  )}
{/snippet}

<!-- How far through the whole document, in words. -->
{#snippet progress(long: boolean)}
  {long ? m.narrator_player_progress({ percent, time: timeLeft }) : m.narrator_player_percent_read({ percent })}
{/snippet}

<div class="player {variant}" class:above={openUp}>
  <div class="transport">
    {@render step(m.narrator_player_replay(), m.narrator_player_replay_short(), () => player.replaySentence(), false, "replay")}
    {@render step(m.narrator_player_previous(), m.narrator_player_previous_short(), () => player.prevSentence(), false)}
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
    {@render step(m.narrator_player_next(), m.narrator_player_next_short(), () => player.nextSentence(), true)}
  </div>

  <div class="scrubber">
    <span class="time n-num">{fmt(player.pos)}</span>
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
      onpointerdown={scrubStart}
      onpointermove={scrubMove}
      onpointerup={scrubEnd}
      onpointercancel={scrubEnd}
      onpointerleave={() => {
        if (!dragging) tip = null;
      }}
      onkeydown={scrubKey}
    >
      <div class="rail"></div>
      {#if span}
        <div class="span" style:left="{span.left}%" style:width="{span.width}%"></div>
      {/if}
      <div class="fill" style:width="{player.percent * 100}%"></div>
      {#each marks as left, i (i)}
        <span class="mark" style:left="{left}%"></span>
      {/each}
      <div class="thumb" style:left="{player.percent * 100}%"></div>
      {#if tip}
        <div class="tip" style:--at="{tip.left}%" aria-hidden="true">
          {#if tip.title}<span class="tip-title">{tip.title}</span>{/if}
          <span class="tip-time n-num">{tip.time}</span>
        </div>
      {/if}
    </div>
    <span class="time n-num" aria-label={m.narrator_player_time_left({ time: timeLeft })}>−{timeLeft}</span>
  </div>

  <!-- Where the playhead is, in words: the chapter, and how far through the whole document. -->
  <div class="where">
    {#if player.modelLoading}
      <span class="where-main" role="status">
        {m.narrator_player_loading_progress({ percent: Math.round(player.modelProgress * 100) })}
      </span>
    {:else}
      <span class="where-main" title={chapters[player.chapterIndex]?.title}>
        <span class="where-count">
          {m.narrator_player_chapter_of({ n: player.chapterIndex + 1, total: chapters.length })}
        </span>
        <span class="where-title">{chapters[player.chapterIndex]?.title ?? ""}</span>
      </span>
    {/if}
    <!-- A phone, and the side panel: on the chapter's line, in two words so the chapter's name
         keeps its room. A wide dock says the time left as well, on the chips' row (below). -->
    <span class="where-pct n-num">{@render progress(false)}</span>
  </div>

  <div class="extras">
    <div class="pop-anchor">
      <button
        class="chip"
        class:open={menu === "speed"}
        aria-label={m.narrator_player_speed({ speed: speedText(player.speed) })}
        aria-expanded={menu === "speed"}
        onclick={() => toggleMenu("speed")}
      >
        <Gauge size={16} strokeWidth={1.5} />
        {speedText(player.speed)}
      </button>
      {#if menu === "speed"}
        <!-- Small on purpose: it opens above the player and leaves the sentence being read in sight. -->
        <div
          class="pop center speed-pop"
          role="group"
          aria-label={m.narrator_player_speed({ speed: speedText(player.speed) })}
        >
          <div class="speed-step">
            <button
              class="round"
              aria-label={m.narrator_player_slower()}
              disabled={player.speed <= SPEED_RANGE.min}
              onclick={() => player.setSpeed(stepWithin(player.speed, -1, SPEED_RANGE))}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M3 8h10" />
              </svg>
            </button>
            <span class="speed-now" aria-live="polite">
              <strong class="n-num">{speedText(player.speed)}</strong>
              {#if player.speed === 1}<span class="pop-note">{m.narrator_player_normal()}</span>{/if}
            </span>
            <button
              class="round"
              aria-label={m.narrator_player_faster()}
              disabled={player.speed >= SPEED_RANGE.max}
              onclick={() => player.setSpeed(stepWithin(player.speed, 1, SPEED_RANGE))}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M3 8h10M8 3v10" />
              </svg>
            </button>
          </div>
          <div class="speed-presets">
            {#each SPEEDS as s (s)}
              <button
                class="speed-preset n-num"
                class:active={s === player.speed}
                aria-pressed={s === player.speed}
                onclick={() => {
                  player.setSpeed(s);
                  menu = null;
                }}
              >
                {presetText(s)}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- One chapter is nothing to choose from: the line above still says "Chapter 1 of 1". -->
    {#if chapters.length > 1}
      <div class="pop-anchor">
        <button
          class="chip"
          class:open={menu === "chapters"}
          aria-expanded={menu === "chapters"}
          onclick={() => toggleMenu("chapters")}
        >
          <List size={16} strokeWidth={1.5} />
          {m.narrator_player_chapters()}
        </button>
        {#if menu === "chapters"}
          <div class="pop right chapters-pop">
            <div class="pop-head">
              <span class="pop-title">{m.narrator_player_chapters()}</span>
              <span class="pop-count n-num">{chapters.length}</span>
              <button class="pop-close" aria-label={m.narrator_close()} onclick={() => (menu = null)}>
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div class="pop-scroll" use:endOnRow>
              <ChapterList
                model={player.model}
                chapterIndex={player.chapterIndex}
                playing={player.playing}
                pos={player.pos}
                speed={player.speed}
                onseek={(i) => {
                  const from = player.pos;
                  player.seekChapter(i);
                  menu = null;
                  onjump?.(from);
                }}
              />
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="pop-anchor voice-anchor">
      <button
        class="chip voice-chip"
        class:open={menu === "voice"}
        aria-label={m.narrator_player_voice_named({ voice: voiceLabel })}
        aria-expanded={menu === "voice"}
        onclick={() => toggleMenu("voice")}
      >
        <Mic size={16} strokeWidth={1.5} />
        <span class="voice-chip-label">{voiceLabel}</span>
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>
      {#if menu === "voice"}
        <div class="pop right voices-pop">
          <div class="pop-scroll" use:endOnRow>
            <!-- The voice that is reading first, then the natural voices, then the device's. -->
            <div class="pop-label">{m.narrator_player_group_current()}</div>
            {#if isNatural && currentNatural}
              {@render naturalRow(currentNatural)}
            {:else if currentSystem}
              {@render systemRow(currentSystem)}
            {:else}
              <div class="pop-note-row">{m.narrator_player_system_default()}</div>
            {/if}

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
              {#each KOKORO_VOICES.filter((v) => !(isNatural && v.id === player.naturalVoice)) as v (v.id)}
                {@render naturalRow(v)}
              {/each}
            {/if}

            {#if systemVoices.some((v) => isNatural || v.name !== systemVoice)}
              <div class="pop-label">{m.narrator_player_group_system()}</div>
              {#each systemVoices.filter((v) => isNatural || v.name !== systemVoice) as v (v.voiceURI)}
                {@render systemRow(v)}
              {/each}
            {/if}
          </div>
          <a class="more" href="/pdf/settings">
            <span>{m.narrator_player_more_voices()}</span>
            <ArrowRight size={16} strokeWidth={1.5} />
          </a>
        </div>
      {/if}
    </div>

    <span class="progress n-num">{@render progress(true)}</span>
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
    column-gap: 22px;
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
    align-items: flex-start;
    gap: 4px;
    justify-content: center;
  }
  /* A skip button over its name: the glyph alone does not say what is skipped. */
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 72px;
    /* Level with the larger Play button. */
    margin-top: 6px;
  }
  .cap {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    text-align: center;
    text-wrap: balance;
    color: var(--n-fg-1);
  }
  .cap.short {
    display: none;
  }
  .ctrl {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
    transition:
      background 150ms var(--n-ease-out),
      border-color 150ms var(--n-ease-out);
  }
  .ctrl:hover {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
  }
  .ctrl:active {
    background: color-mix(in srgb, var(--n-accent) 24%, var(--n-bg-3));
  }
  .play {
    width: 56px;
    height: 56px;
    margin: 0 4px;
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
    font-size: 13px;
    font-weight: 500;
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
    touch-action: none;
  }
  /* A finger-sized target around a thin bar: 44 px tall. */
  .track::before {
    content: "";
    position: absolute;
    inset: -19px 0;
  }
  .rail {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--n-bg-3);
    box-shadow: inset 0 0 0 1px var(--n-border-2);
  }
  /* The chapter being read, from its first mark to its last: the part still to come is tinted. */
  .span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--n-accent) 42%, var(--n-bg-3));
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 999px;
    background: var(--n-accent);
  }
  /* Where each chapter begins: a notch through the rail, 10 px tall. */
  .mark {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    margin-left: -1px;
    background: var(--n-fg-0);
    border-radius: 1px;
  }
  .thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--n-fg-0);
    box-shadow: var(--n-shadow-sm);
  }
  /* The chapter under the pointer. Kept inside the rail's two ends. */
  .tip {
    position: absolute;
    bottom: calc(100% + 14px);
    left: clamp(0%, var(--at), 100%);
    transform: translateX(calc(var(--at) * -1));
    display: flex;
    gap: 8px;
    max-width: min(320px, 100%);
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--n-bg-3);
    border: 1px solid var(--n-border-3);
    box-shadow: var(--n-shadow-md);
    font-size: 13px;
    line-height: 1.3;
    white-space: nowrap;
    pointer-events: none;
    z-index: 40;
  }
  .bar .tip {
    top: calc(100% + 14px);
    bottom: auto;
  }
  .tip-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .tip-time {
    color: var(--n-fg-1);
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
    /* Starts under the rail's left end. The chapter's name runs to the dock's edge and is cut
       only when that room runs out. */
    padding: 0 0 0 50px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--n-fg-1);
  }
  .panel .where {
    padding: 0;
  }
  .where-main {
    display: flex;
    min-width: 0;
  }
  .where-count {
    flex-shrink: 0;
    color: var(--n-fg-0);
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
    display: none;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .panel .where-pct {
    display: inline;
  }
  /* How far through the document and how long is left, at the right end of the chips' row. */
  .progress {
    margin-left: auto;
    padding-left: 8px;
    font-size: 14px;
    line-height: 1.4;
    color: var(--n-fg-1);
    white-space: nowrap;
  }
  .panel .progress {
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
    gap: 7px;
    min-height: 44px;
    max-width: 100%;
    padding: 0 15px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-1);
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover {
    color: var(--n-fg-0);
    border-color: var(--n-border-3);
  }
  /* Pressed in while its menu is open. */
  .chip.open {
    color: var(--n-fg-0);
    background: var(--n-bg-3);
    border-color: var(--n-fg-2);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
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
    border-radius: 14px;
    padding: 8px;
    box-shadow: var(--n-shadow-lg);
  }
  .pop.center {
    left: 50%;
    transform: translateX(-50%);
  }
  .pop.right {
    right: 0;
  }
  /* --n-pop-lift: the height of a notice sitting on the dock, so a menu opens clear of it. */
  .above .pop {
    top: auto;
    bottom: calc(100% + 22px + var(--n-pop-lift, 0px));
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

  /* ---------- speed ---------- */
  .speed-pop {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }
  .speed-step {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .round {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid var(--n-border-3);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .round:hover:not(:disabled) {
    background: var(--n-bg-1);
  }
  .round:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .speed-now {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
  }
  .speed-now strong {
    font-size: 20px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .pop-note {
    color: var(--n-fg-1);
    font-size: 13px;
    font-weight: 500;
  }
  .speed-presets {
    display: grid;
    grid-template-columns: repeat(8, minmax(48px, 1fr));
    gap: 4px;
  }
  .speed-preset {
    min-height: 44px;
    padding: 0 4px;
    border-radius: 10px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .speed-preset:hover {
    color: var(--n-fg-0);
    border-color: var(--n-border-3);
  }
  /* The readout above says the speed. The preset that matches it only carries an outline. */
  .speed-preset.active {
    color: var(--n-fg-0);
    border-color: var(--n-fg-1);
  }

  /* ---------- chapters ---------- */
  .chapters-pop {
    width: 420px;
    max-width: calc(100vw - 32px);
    max-height: min(480px, calc(100dvh - 260px - var(--n-pop-lift, 0px)));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .pop-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 0 8px 12px;
  }
  .pop-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .pop-count {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--n-fg-1);
  }
  .pop-close {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--n-border-3);
    border-radius: 10px;
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .pop-close:hover {
    background: var(--n-bg-1);
  }
  .pop-scroll {
    overflow-y: auto;
    scroll-snap-type: y proximity;
  }
  /* More rows follow: a shadow on the list's foot, gone at its end. */
  .pop-scroll::after {
    content: "";
    position: sticky;
    bottom: 0;
    display: block;
    height: 12px;
    margin-top: -12px;
    background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--n-bg-0) 45%, transparent));
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms var(--n-ease-out);
  }
  .pop-scroll:global([data-more])::after {
    opacity: 1;
  }

  /* ---------- voices ---------- */
  .voices-pop {
    width: 340px;
    max-width: calc(100vw - 32px);
    max-height: min(480px, calc(100dvh - 260px - var(--n-pop-lift, 0px)));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .pop-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--n-fg-1);
    padding: 8px 8px 4px;
  }
  .pop-note-row {
    margin: 0 4px 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--n-bg-2);
    font-size: 14px;
    line-height: 1.4;
    color: var(--n-fg-1);
  }
  /* The same row as the settings page: the preview button, the name over one line about the
     voice, and "In use" with a check on the voice that is reading. */
  .voice-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 6px;
    border-radius: 10px;
    scroll-snap-align: end;
  }
  .voice-row:hover {
    background: var(--n-bg-2);
  }
  .voice-row.active {
    background: color-mix(in srgb, var(--n-accent) 16%, var(--n-bg-2));
  }
  .preview {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid var(--n-border-3);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .preview:hover {
    background: var(--n-bg-1);
  }
  /* Playing: a pause mark inside a ring in the accent. */
  .preview.on {
    background: var(--n-bg-3);
    border-color: transparent;
    box-shadow: inset 0 0 0 3px var(--n-accent-text, var(--n-accent));
  }
  .voice-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 6px 12px 6px 10px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--n-fg-0);
    text-align: left;
    cursor: pointer;
  }
  .voice-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .voice-name {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .active .voice-name {
    font-weight: 700;
  }
  .voice-lang {
    font-size: 14px;
    line-height: 1.35;
    color: var(--n-fg-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .active .voice-lang {
    color: var(--n-fg-1);
  }
  .in-use {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-0);
    white-space: nowrap;
  }
  .more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
    margin-top: 6px;
    padding: 0 12px;
    border-top: 1px solid var(--n-border-2);
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-0);
    text-decoration: none;
  }
  .more:hover span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* In the document bar the chips sit at the left: a wide menu opens from its chip's left edge,
     where the screen has the room. */
  @media (min-width: 561px) {
    .bar .pop.right {
      left: 0;
      right: auto;
    }
  }
  /* Stacked, the side panel sits at the top of the screen: its menus open below it. */
  @media (max-width: 900px) {
    .panel .pop {
      top: calc(100% + 12px);
      bottom: auto;
    }
  }

  @media (max-width: 560px) {
    /* The same four buttons as a wide screen, each skip button over one word. */
    .cap.long {
      display: none;
    }
    .cap.short {
      display: block;
      white-space: nowrap;
    }
    .step {
      width: 76px;
      /* Level with the larger Play button. */
      margin-top: 4px;
    }
    .transport {
      gap: 6px;
    }
    .play {
      width: 52px;
      height: 52px;
      margin: 0 6px;
    }
    /* The phone dock and the document bar stack: the scrubber on its own row with a time at each
       end, the chapter under it, the transport, then the chips. */
    .player.float,
    .player.bar {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "scrubber"
        "where"
        "transport"
        "extras";
      /* The names under the buttons take a line. The rows above give it back. */
      row-gap: 3px;
    }
    .player.float {
      padding: 8px 16px calc(10px + env(safe-area-inset-bottom));
    }
    .float .scrubber,
    .bar .scrubber {
      gap: 10px;
    }
    .float .time,
    .bar .time {
      min-width: 0;
    }
    /* The chapter's name is never cut to make room for the percentage: when the two do not
       fit one line, the percentage takes the next one, under the time left. */
    .float .where,
    .bar .where {
      padding: 0;
      flex-wrap: wrap;
      gap: 0 8px;
    }
    .where-count + .where-title:not(:empty)::before {
      margin: 0 5px;
    }
    .where-main {
      max-width: 100%;
    }
    .where-pct {
      margin-left: auto;
    }
    .where-pct {
      display: inline;
    }
    .progress {
      display: none;
    }
    .where-main[role="status"] {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* The chips on one line: the voice takes what is left and its name shortens. */
    .float .extras,
    .bar .extras {
      flex-wrap: nowrap;
      margin-top: 4px;
    }
    .float .chip,
    .bar .chip {
      padding: 0 13px;
    }
    .voice-anchor {
      flex: 1;
    }
    .voice-chip {
      width: 100%;
    }
    .voice-chip-label {
      flex: 1;
      max-width: none;
      text-align: left;
    }
    .above .pop {
      bottom: calc(100% + 10px + var(--n-pop-lift, 0px));
    }
    /* On a phone every menu is placed against the player and spans it, like a sheet. */
    .pop-anchor {
      position: static;
    }
    .pop.center,
    .pop.right {
      left: 8px;
      right: 8px;
      width: auto;
      max-width: none;
      transform: none;
    }
    .speed-presets {
      grid-template-columns: repeat(4, 1fr);
    }
    /* The two tall menus stop under the reader's top bar. */
    .float .chapters-pop,
    .float .voices-pop {
      max-height: min(480px, calc(100dvh - 330px - var(--n-pop-lift, 0px)));
    }
    /* A grab handle: the list is a sheet over the text. */
    .chapters-pop::before {
      content: "";
      align-self: center;
      width: 36px;
      height: 4px;
      margin: 0 0 4px;
      border-radius: 999px;
      background: var(--n-border-3);
      flex-shrink: 0;
    }
  }
</style>
