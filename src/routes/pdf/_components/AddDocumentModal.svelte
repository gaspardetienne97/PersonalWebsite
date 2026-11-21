<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import FileText from "@lucide/svelte/icons/file-text";
  import Mic from "@lucide/svelte/icons/mic";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Quote from "@lucide/svelte/icons/quote";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Upload from "@lucide/svelte/icons/upload";
  import X from "@lucide/svelte/icons/x";
  import { onDestroy, onMount } from "svelte";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { fmtLong, MS_PER_WORD, type NarratorDoc } from "@repo/pdf-core/domain";
  import {
    ACCEPT_BY_KIND,
    extractFile,
    extractPaste,
    kindForFile,
    type ExtractStage,
  } from "@repo/pdf-core/services/extract";
  import { getSynth, resolveVoice, speechAvailable } from "@repo/pdf-core/services/tts";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import Btn from "./Btn.svelte";
  import Equalizer from "./Equalizer.svelte";
  import Notice from "./Notice.svelte";

  let {
    onclose,
    oncreate,
  }: {
    onclose: () => void;
    oncreate: (doc: NarratorDoc) => void;
  } = $props();

  // Two ways in: a file of any kind Narrator reads (the kind is read from the file), or text.
  const TABS = [
    { id: "file", label: m.narrator_add_tab_file(), icon: FileText },
    { id: "paste", label: m.narrator_add_tab_paste(), icon: Quote },
  ] as const;

  // What each kind of file gives, behind "What works".
  const NOTES = [
    { kind: "PDF", note: m.narrator_add_hint_pdf() },
    { kind: "EPUB", note: m.narrator_add_hint_epub() },
    { kind: m.narrator_add_tab_txt(), note: m.narrator_add_hint_txt() },
  ];

  const STAGES: { k: ExtractStage; label: string }[] = [
    { k: "read", label: m.narrator_add_stage_read() },
    { k: "extract", label: m.narrator_add_stage_extract() },
    { k: "clean", label: m.narrator_add_stage_clean() },
    { k: "chapters", label: m.narrator_add_stage_chapters() },
    { k: "narration", label: m.narrator_add_stage_narration() },
  ];

  const ACCEPT_ALL = Object.values(ACCEPT_BY_KIND).join(",");

  let tab = $state<(typeof TABS)[number]["id"]>("file");
  let voice = $state<string | undefined>(undefined);
  let choosingVoice = $state(false);
  let previewing = $state(false);
  let text = $state("");
  let title = $state("");
  let pasteBlocked = $state(false);
  let drag = $state(false);
  let busy = $state(false);
  let stageIndex = $state(0);
  /** Where the reader is inside the step, when it says: page 12 of 240. */
  let pages = $state<{ page: number; pages: number } | null>(null);
  let fileName = $state("");
  /** `paste` is false when pasting the text would not help either (a scan has no text to copy). */
  let failure = $state<{ name: string; message: string; paste: boolean } | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let textArea = $state<HTMLTextAreaElement | null>(null);
  let overlay = $state<HTMLDivElement | null>(null);

  const voiceChoices = $derived(voiceCatalog.shortList(5));
  const selectedVoice = $derived(voice ?? voiceCatalog.defaultName);
  // Some devices put "Premium" or "Enhanced" in a voice's name. It reads like a paid tier, so
  // the note says what it is whenever such a name is on screen.
  const devicePremium = $derived(
    [selectedVoice, ...(choosingVoice ? voiceChoices.map((v) => v.name) : [])].some((name) =>
      /premium|enhanced/i.test(name ?? ""),
    ),
  );

  const step = $derived(Math.min(stageIndex + 1, STAGES.length));
  // The bar moves with the steps, and inside a step with the pages when the reader counts them.
  // A step under way counts as half done, so the bar is never empty while work goes on.
  const done = $derived(
    Math.min(STAGES.length, stageIndex + (pages ? pages.page / pages.pages : 0.5)) / STAGES.length,
  );

  const pastedWords = $derived(text.trim() ? text.trim().split(/\s+/).length : 0);
  // The title pasted text gets when none is typed: the first sentence, cut short.
  // ponytail: follows extractPaste's rule by hand. Export that rule from the extractor if the
  // two ever drift.
  const firstWords = $derived(text.trim().split(/[.!?\n]/)[0].slice(0, 48).trim());

  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  // Reading a file cannot be stopped half way, so Cancel drops its result: each read carries
  // the number it started with and is ignored once that has moved on.
  let run = 0;

  function pick() {
    fileInput?.click();
  }

  async function handleFile(file: File) {
    if (busy) return;
    tab = "file";
    const kind = kindForFile(file);
    if (!kind) {
      failure = { name: file.name, message: m.narrator_add_unsupported(), paste: true };
      return;
    }
    // A file named .pdf that holds something else: say that, not "it may be damaged".
    if (kind === "pdf" && !(await file.slice(0, 1024).text()).includes("%PDF-")) {
      failure = { name: file.name, message: m.narrator_add_not_pdf(), paste: true };
      return;
    }
    failure = null;
    busy = true;
    fileName = file.name;
    stageIndex = 0;
    pages = null;
    const mine = ++run;
    try {
      const doc = await extractFile(
        file,
        selectedVoice ?? "",
        // The second argument comes from an extractor that counts its pages (PDF does).
        (stage: ExtractStage, at?: { page: number; pages: number }) => {
          if (mine !== run) return;
          stageIndex = STAGES.findIndex((s) => s.k === stage);
          pages = at && at.pages > 0 ? at : null;
        },
      );
      if (mine !== run) return;
      stageIndex = STAGES.length; // every step done
      pages = null;
      setTimeout(() => mine === run && oncreate(doc), 350);
    } catch (e) {
      if (mine !== run) return;
      busy = false;
      // An extractor may tag its error with a code. A scan or a locked PDF has no text to copy,
      // so pasting is not offered for those.
      const code = (e as { code?: string } | null)?.code;
      failure = {
        name: file.name,
        message: e instanceof Error ? e.message : m.narrator_add_read_failed(),
        paste: code !== "pdf-no-text" && code !== "pdf-locked",
      };
    }
  }

  function cancel() {
    run++;
    busy = false;
  }

  function startPaste() {
    const doc = extractPaste(text, selectedVoice ?? "");
    if (!doc) return;
    if (title.trim()) doc.title = title.trim();
    oncreate(doc);
  }

  async function pasteClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) text = text.trim() ? `${text.trimEnd()}\n\n${clip}` : clip;
      pasteBlocked = false;
    } catch {
      // The browser said no (or the listener did). The keyboard still works: say so.
      pasteBlocked = true;
    }
    textArea?.focus();
  }

  let spoken: SpeechSynthesisUtterance | null = null;
  function stopPreview() {
    spoken = null;
    previewing = false;
    getSynth()?.cancel();
  }
  function preview() {
    const synth = getSynth();
    if (!synth) return;
    if (previewing) return stopPreview();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(m.narrator_add_voice_sample());
    const v = resolveVoice(selectedVoice);
    if (v) u.voice = v;
    u.onend = u.onerror = () => {
      if (spoken === u) previewing = false;
    };
    spoken = u;
    previewing = true;
    synth.speak(u);
  }

  onMount(() => overlay?.focus());

  onDestroy(() => {
    run++;
    if (previewing) stopPreview();
  });
</script>

<!-- While a file is read there is one way out, Cancel, and Escape is that. -->
<svelte:window onkeydown={(e) => e.key === "Escape" && (busy ? cancel() : onclose())} />

<!-- A press on the dimmed page around the sheet closes it (not while a file is read). Focus
     starts on the dialog, so Tab and Escape work from inside it. -->
<div
  bind:this={overlay}
  class="overlay"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.narrator_add_dialog()}
  onpointerdown={(e) => e.target === e.currentTarget && !busy && onclose()}
>
  <div class="sheet" class:tall={tab === "paste" && !busy}>
    <div class="glow"></div>
    <div class="grip"></div>
    <div class="head">
      <div class="head-text">
        <h2>{m.narrator_add_dialog()}</h2>
        <p>{m.narrator_add_subtitle()}</p>
      </div>
      {#if !busy}
        <button class="icon-btn close" onclick={onclose} aria-label={m.narrator_close()}><X size={18} strokeWidth={2} /></button>
      {/if}
    </div>

    <input
      bind:this={fileInput}
      type="file"
      accept={ACCEPT_ALL}
      class="file-input"
      aria-label={m.narrator_add_choose()}
      onchange={(e) => {
        const file = e.currentTarget.files?.[0];
        if (file) void handleFile(file);
        e.currentTarget.value = "";
      }}
    />

    {#if busy}
      <div class="scroll pipe">
        <div class="pipe-spinner">
          <Equalizer color="var(--n-brand-blue)" size={32} />
          <div class="spin-ring"></div>
        </div>
        <h3>{m.narrator_add_building()}</h3>
        <p class="pipe-sub">{fileName}</p>
        <div
          class="pipe-bar"
          role="progressbar"
          aria-label={m.narrator_add_building()}
          aria-valuemin="0"
          aria-valuemax={STAGES.length}
          aria-valuenow={step}
        >
          <div style:width="{done * 100}%"></div>
        </div>
        <p class="pipe-count" role="status">
          <span>{m.narrator_add_step({ step, total: STAGES.length })}</span>
          {#if pages}
            <span>{m.narrator_add_page({ page: formatNumber(pages.page), pages: formatNumber(pages.pages) })}</span>
          {/if}
          <span class="sr-only">{STAGES[stageIndex]?.label ?? ""}</span>
        </p>
        <ol class="steps">
          {#each STAGES as stage, i (stage.k)}
            {@const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "pending"}
            <li class="step {state}" aria-current={state === "active" ? "step" : undefined}>
              <div class="dot {state}">
                {#if state === "done"}
                  <Check size={13} strokeWidth={2.5} style="color: #04240f" />
                {:else if state === "active"}
                  <div class="pulse"></div>
                {/if}
              </div>
              <div class="step-label">{stage.label}</div>
            </li>
          {/each}
        </ol>
      </div>
      <div class="foot">
        <Btn class="wide" onclick={cancel}>{m.narrator_cancel()}</Btn>
      </div>
    {:else}
      <div class="scroll body">
        <div class="tabs" role="tablist">
          {#each TABS as t (t.id)}
            <button
              class="tab"
              class:active={tab === t.id}
              role="tab"
              aria-selected={tab === t.id}
              onclick={() => {
                tab = t.id;
                failure = null;
              }}
            >
              <t.icon size={16} strokeWidth={1.75} />
              {t.label}
            </button>
          {/each}
        </div>

        {#if tab === "paste"}
          <div class="paste">
            <div class="field-head">
              <label for="n-paste-text">{m.narrator_add_paste_text()}</label>
              {#if canReadClipboard}
                <button class="quiet-btn" onclick={pasteClipboard}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  </svg>
                  {m.narrator_add_paste_clipboard()}
                </button>
              {/if}
            </div>
            <textarea
              id="n-paste-text"
              bind:this={textArea}
              bind:value={text}
              placeholder={m.narrator_add_paste_placeholder()}
              aria-label={m.narrator_add_paste_label()}
              aria-describedby="n-paste-count"
            ></textarea>
            <p class="field-note" id="n-paste-count" role="status">
              {#if pasteBlocked}
                {m.narrator_add_paste_blocked()}
              {:else if pastedWords}
                {m.narrator_add_paste_count({
                  words: m.narrator_library_words({ count: pastedWords, shown: formatNumber(pastedWords) }),
                  time: fmtLong(pastedWords * MS_PER_WORD),
                })}
              {:else}
                {m.narrator_add_paste_count_empty()}
              {/if}
            </p>
            <div class="field-head">
              <label for="n-paste-title">{m.narrator_add_paste_title()}</label>
              <span class="field-opt">{m.narrator_add_optional()}</span>
            </div>
            <input
              id="n-paste-title"
              class="title-input"
              type="text"
              bind:value={title}
              maxlength="120"
              placeholder={firstWords || m.narrator_add_paste_title_hint()}
            />
          </div>
        {:else}
          <!-- One area takes every kind of file, dropped or chosen. An error takes its place, so
               the sheet does not grow and one main action is left. -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="zone"
            ondragover={(e) => {
              e.preventDefault();
              drag = true;
            }}
            ondragleave={() => (drag = false)}
            ondrop={(e) => {
              e.preventDefault();
              drag = false;
              const file = e.dataTransfer?.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            {#if failure && !drag}
              <Notice
                tone="error"
                class="add-error"
                title={m.narrator_add_error_title({ name: failure.name })}
                actions={[
                  { label: m.narrator_add_choose_another(), onclick: pick, primary: true },
                  ...(failure.paste
                    ? [
                        {
                          label: m.narrator_add_paste_instead(),
                          onclick: () => {
                            tab = "paste";
                            failure = null;
                          },
                        },
                      ]
                    : []),
                ]}
              >
                {failure.message}
              </Notice>
            {:else}
              <!-- The whole area opens the picker, a convenience; the button inside is the
                   control a keyboard and a screen reader use. -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="drop" class:drag onclick={pick}>
                <div class="drop-icon"><Upload size={28} strokeWidth={1.75} /></div>
                <div class="drop-title" class:live={drag}>
                  {drag ? m.narrator_add_release() : m.narrator_add_drop()}
                </div>
                <Btn
                  variant="primary"
                  class="choose-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    pick();
                  }}
                >
                  <FileText size={18} strokeWidth={1.75} /> {m.narrator_add_choose()}
                </Btn>
                <div class="drop-kinds">{m.narrator_add_kinds()}</div>
              </div>
            {/if}
          </div>
          {#if !failure}
            <details class="works">
              <summary>
                <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
                {m.narrator_add_what_works()}
              </summary>
              <dl>
                {#each NOTES as n (n.kind)}
                  <div>
                    <dt>{n.kind}</dt>
                    <dd>{n.note}</dd>
                  </div>
                {/each}
              </dl>
            </details>
          {/if}
        {/if}

        {#if !failure}
          <div class="voice">
            <div class="voice-row">
              <Mic size={18} strokeWidth={1.75} style="color: var(--n-fg-1); flex-shrink: 0" />
              <div class="voice-text">
                <span class="voice-label">{m.narrator_narrator_voice()}</span>
                <span class="voice-name">{selectedVoice ?? m.narrator_add_system_default()}</span>
              </div>
              {#if speechAvailable()}
                <button class="quiet-btn" aria-pressed={previewing} onclick={preview}>
                  {#if previewing}
                    <Pause size={16} strokeWidth={1.75} /> {m.narrator_add_preview_stop()}
                  {:else}
                    <Play size={16} strokeWidth={1.75} /> {m.narrator_add_preview()}
                  {/if}
                </button>
              {/if}
              {#if voiceChoices.length > 1}
                <button class="quiet-btn" aria-expanded={choosingVoice} onclick={() => (choosingVoice = !choosingVoice)}>
                  {m.narrator_add_voice_change()}
                </button>
              {/if}
            </div>
            {#if choosingVoice}
              <div class="voice-chips" role="radiogroup" aria-label={m.narrator_narrator_voice()}>
                {#each voiceChoices as v (v.voiceURI)}
                  <button
                    class="voice-chip"
                    class:active={selectedVoice === v.name}
                    role="radio"
                    aria-checked={selectedVoice === v.name}
                    onclick={() => {
                      if (previewing) stopPreview();
                      voice = v.name;
                    }}
                  >
                    {#if selectedVoice === v.name}
                      <Check size={14} strokeWidth={2.5} />
                    {/if}
                    {v.name}
                  </button>
                {/each}
              </div>
            {/if}
            {#if devicePremium}
              <p class="voice-note">{m.narrator_add_premium_note()}</p>
            {/if}
          </div>
        {/if}
      </div>
      {#if tab === "paste"}
        <div class="foot">
          <Btn variant="primary" class="wide" disabled={!text.trim()} onclick={startPaste}>
            <Sparkles size={16} strokeWidth={1.75} /> {m.narrator_add_narrate()}
          </Btn>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(2, 6, 24, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    outline: none;
  }
  .sheet {
    width: min(560px, 100%);
    max-height: 92vh;
    max-height: 92dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    background: var(--n-bg-1);
    border: 1px solid var(--n-glass-border);
    border-radius: 20px;
    box-shadow: var(--n-shadow-lg);
  }
  /* The glow hangs past the sheet's corner; the sheet clips it. */
  .glow {
    position: absolute;
    top: -30px;
    right: -30px;
    width: 230px;
    height: 180px;
    border-radius: 999px;
    background: var(--n-brand-gradient-soft);
    filter: blur(60px);
    pointer-events: none;
  }
  .grip {
    display: none;
  }
  .head {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 24px 28px 20px;
    /* The close button's height, so the head keeps its size while a file is read. */
    min-height: 88px;
  }
  .head-text {
    min-width: 0;
  }
  /* Solid, so the title reads at full contrast. The gradient stays on the icons. */
  .head h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--n-fg-0);
  }
  .head p {
    margin: 2px 0 0;
    color: var(--n-fg-1);
    font-size: 14px;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .icon-btn:hover {
    border-color: var(--n-border-3);
    background: var(--n-bg-3);
  }
  .icon-btn.close {
    margin-left: auto;
  }
  .icon-btn:focus-visible,
  .tab:focus-visible,
  .quiet-btn:focus-visible,
  .works summary:focus-visible,
  .voice-chip:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }
  .scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .body {
    display: flex;
    flex-direction: column;
    padding: 0 28px 28px;
  }
  /* With a button under it, the body gives its bottom room to the foot. */
  .body:not(:last-child) {
    padding-bottom: 0;
  }
  .foot {
    position: relative;
    padding: 20px 28px 28px;
  }
  .foot :global(.wide) {
    width: 100%;
    min-height: 48px;
    font-size: 15px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    padding: 4px;
    background: var(--n-bg-0);
    border-radius: 12px;
    margin-bottom: 16px;
    border: 1px solid var(--n-border-2);
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 8px;
    border-radius: 9px;
    border: none;
    background: transparent;
    color: var(--n-fg-1);
    font-family: var(--n-font-sans);
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
  }
  .tab:hover {
    color: var(--n-fg-0);
  }
  .tab.active {
    background: rgba(18, 145, 250, 0.18);
    color: var(--n-fg-0);
    box-shadow: inset 0 0 0 1.5px rgba(18, 145, 250, 0.7);
  }
  .file-input {
    display: none;
  }
  .zone {
    display: flex;
    flex-direction: column;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    /* A height of its own, so "Release to add" does not move the sheet. */
    min-height: 238px;
    padding: 28px 24px 24px;
    border: 1.5px dashed var(--n-border-3);
    border-radius: 16px;
    cursor: pointer;
    text-align: center;
    transition:
      border-color 200ms var(--n-ease-out),
      background 200ms var(--n-ease-out);
    background: var(--n-bg-1);
  }
  .drop:hover {
    border-color: var(--n-fg-2);
  }
  /* A file over the area: a solid blue edge, a tint, a larger icon and "Release to add". */
  .drop.drag {
    border-style: solid;
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.12);
  }
  .drop-icon {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--n-brand-gradient);
    color: var(--n-on-accent, #fff);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    transition: transform 200ms var(--n-ease-out);
  }
  .drop.drag .drop-icon {
    transform: scale(1.18) translateY(-2px);
    box-shadow:
      var(--n-brand-glow),
      inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .drop-title {
    font-weight: 700;
    font-size: 17px;
    color: var(--n-fg-0);
  }
  .drop :global(.choose-btn) {
    min-height: 48px;
    min-width: 220px;
    font-size: 15px;
  }
  .drop.drag :global(.choose-btn) {
    display: none;
  }
  .drop.drag .drop-title {
    font-size: 20px;
    margin-top: 6px;
  }
  .drop-kinds {
    font-size: 14px;
    line-height: 1.45;
    color: var(--n-fg-1);
    max-width: 400px;
  }
  /* What each kind of file gives, for whoever wants it. */
  .works {
    margin-top: 6px;
  }
  .works summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 6px 0 2px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-link);
    cursor: pointer;
    list-style: none;
  }
  .works summary::-webkit-details-marker {
    display: none;
  }
  .works[open] .chev {
    transform: rotate(90deg);
  }
  .works dl {
    margin: 0;
    padding: 2px 0 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .works dl div {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 10px;
    font-size: 14px;
    line-height: 1.45;
  }
  .works dt {
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .works dd {
    margin: 0;
    color: var(--n-fg-1);
  }
  .paste {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
  }
  .field-head label {
    font-size: 14px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .field-opt {
    font-size: 13.5px;
    color: var(--n-fg-2);
  }
  .field-note {
    margin: 6px 0 4px;
    min-height: 20px;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--n-fg-1);
    font-variant-numeric: tabular-nums;
  }
  textarea {
    display: block;
    width: 100%;
    flex: 1 0 150px;
    resize: vertical;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-3);
    color: var(--n-fg-0);
    font-family: var(--n-font-serif);
    font-size: 16px;
    line-height: 1.6;
    outline: none;
  }
  .title-input {
    display: block;
    width: 100%;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-3);
    color: var(--n-fg-0);
    font-family: var(--n-font-sans);
    font-size: 15px;
    outline: none;
  }
  /* The site's forms plugin rings a focused input in its own colour. One blue edge here. */
  textarea:focus,
  .title-input:focus {
    border-color: var(--n-brand-blue);
    box-shadow: 0 0 0 1px var(--n-brand-blue);
  }
  textarea::placeholder,
  .title-input::placeholder {
    color: var(--n-fg-2);
  }
  /* A small button with a word on it: Paste, Preview, Change. */
  .quiet-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
  }
  .quiet-btn:hover {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
  }
  .quiet-btn[aria-pressed="true"] {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.16);
  }
  .voice {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
  }
  .voice-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  /* One line: what it is, then which. */
  .voice-text {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    line-height: 1.3;
  }
  .voice-label {
    color: var(--n-fg-2);
    font-size: 14px;
    white-space: nowrap;
  }
  .voice-name {
    color: var(--n-fg-0);
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .voice-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .voice-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-1);
    color: var(--n-fg-1);
    font-size: 14px;
    cursor: pointer;
    font-family: var(--n-font-sans);
    transition: all 200ms var(--n-ease-out);
  }
  .voice-chip.active {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.14);
    color: var(--n-fg-0);
    font-weight: 600;
  }
  .voice-note {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--n-fg-2);
  }
  .pipe {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    /* Room above for the spinner's ring, which reaches past its box. */
    padding: 12px 28px 4px;
  }
  .pipe h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  .pipe-sub {
    color: var(--n-fg-1);
    margin: 2px 0 12px;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .pipe-bar {
    width: 100%;
    max-width: 380px;
    height: 8px;
    border-radius: 999px;
    background: var(--n-bg-3);
    overflow: hidden;
  }
  .pipe-bar div {
    height: 100%;
    border-radius: 999px;
    background: var(--n-accent-app, var(--n-brand-blue));
    transition: width 300ms var(--n-ease-out);
  }
  .pipe-count {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 16px;
    width: 100%;
    max-width: 380px;
    margin: 8px 0 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-0);
    font-variant-numeric: tabular-nums;
  }
  .pipe-spinner {
    position: relative;
    width: 52px;
    height: 52px;
    margin-bottom: 14px;
    display: grid;
    place-items: center;
  }
  .spin-ring {
    position: absolute;
    inset: -8px;
    border-radius: 999px;
    border: 1.5px solid var(--n-border-1);
    border-top-color: var(--n-brand-blue);
    animation: n-spin 1s linear infinite;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    max-width: 380px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 12px;
    border-radius: 10px;
    text-align: left;
  }
  .step.active {
    background: var(--n-bg-2);
  }
  .dot {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 1.5px solid var(--n-border-3);
  }
  .dot.active {
    border-color: var(--n-brand-blue);
  }
  .dot.done {
    background: var(--n-success);
    border: none;
  }
  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--n-brand-blue);
    animation: n-pulse 1s ease-in-out infinite;
  }
  .step-label {
    font-size: 15px;
    font-weight: 500;
    color: var(--n-fg-0);
  }
  .step.active .step-label {
    font-weight: 700;
  }
  /* Still to come: quieter than the rest, and still easy to read. */
  .step.pending .step-label {
    color: var(--n-fg-2);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Touch, or a phone's width: nothing is dropped there, so the area is the button's card.
     "Release to add" still shows if something is dragged in. */
  @media (max-width: 560px), (hover: none), (pointer: coarse) {
    .drop-title:not(.live) {
      display: none;
    }
    .drop {
      border-style: solid;
      border-color: var(--n-border-2);
      background: var(--n-bg-0);
      min-height: 0;
      padding: 22px 16px 20px;
    }
    .drop :global(.choose-btn) {
      width: 100%;
      min-height: 52px;
    }
  }
  /* A phone: a sheet from the bottom edge, with the main action pinned under the thumb. */
  @media (max-width: 560px) {
    .overlay {
      place-items: end stretch;
      padding: 0;
    }
    .sheet {
      width: 100%;
      border-radius: 20px 20px 0 0;
      border-bottom: none;
    }
    /* Pasted text wants room to be read over: the sheet takes the screen. */
    .sheet.tall {
      height: 92vh;
      height: 92dvh;
    }
    .grip {
      display: block;
      width: 40px;
      height: 4px;
      border-radius: 999px;
      background: var(--n-border-3);
      margin: 10px auto 0;
      flex-shrink: 0;
    }
    .head {
      padding: 12px 16px 14px;
      min-height: 70px;
    }
    .head h2 {
      font-size: 20px;
    }
    .body {
      padding: 0 16px max(20px, env(safe-area-inset-bottom));
    }
    .pipe {
      padding: 12px 16px 4px;
    }
    .foot {
      padding: 14px 16px max(16px, env(safe-area-inset-bottom));
      border-top: 1px solid var(--n-border-1);
    }
    .body:not(:last-child) {
      padding-bottom: 14px;
    }
    /* The words over the name, and the two buttons keep their size. */
    .voice-row {
      padding-left: 12px;
    }
    .voice-row > :global(svg) {
      display: none;
    }
    .voice-text {
      flex-direction: column;
      align-items: stretch;
      gap: 0;
    }
    .voice-label {
      font-size: 13px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tab,
    .drop,
    .drop-icon,
    .voice-chip,
    .pipe-bar div {
      transition: none;
    }
    .spin-ring,
    .pulse {
      animation: none;
    }
  }
</style>
