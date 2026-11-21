<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Check from "@lucide/svelte/icons/check";
  import FileText from "@lucide/svelte/icons/file-text";
  import Mic from "@lucide/svelte/icons/mic";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Quote from "@lucide/svelte/icons/quote";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Type from "@lucide/svelte/icons/type";
  import X from "@lucide/svelte/icons/x";
  import { onDestroy, onMount, untrack } from "svelte";

  import { m } from "@repo/i18n/messages.js";
  import type { DocKind, NarratorDoc } from "@repo/pdf-core/domain";
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
    initialTab = "pdf",
  }: {
    onclose: () => void;
    oncreate: (doc: NarratorDoc) => void;
    /** The tab to open on, when a format shortcut opened the modal. */
    initialTab?: DocKind;
  } = $props();

  // `drop` and `choose` label the file picker; the paste tab shows a text box instead.
  const TABS = [
    {
      id: "pdf",
      label: "PDF",
      icon: FileText,
      hint: m.narrator_add_hint_pdf(),
      drop: m.narrator_add_drop_pdf(),
      choose: m.narrator_add_choose_pdf(),
    },
    {
      id: "epub",
      label: "EPUB",
      icon: BookOpen,
      hint: m.narrator_add_hint_epub(),
      drop: m.narrator_add_drop_epub(),
      choose: m.narrator_add_choose_epub(),
    },
    {
      id: "txt",
      label: m.narrator_add_tab_txt(),
      icon: Type,
      hint: m.narrator_add_hint_txt(),
      drop: m.narrator_add_drop_txt(),
      choose: m.narrator_add_choose_txt(),
    },
    {
      id: "paste",
      label: m.narrator_kind_paste(),
      icon: Quote,
      hint: "",
      drop: m.narrator_add_drop_txt(),
      choose: m.narrator_add_choose_txt(),
    },
  ] as const;

  const STAGES: { k: ExtractStage; label: string }[] = [
    { k: "read", label: m.narrator_add_stage_read() },
    { k: "extract", label: m.narrator_add_stage_extract() },
    { k: "clean", label: m.narrator_add_stage_clean() },
    { k: "chapters", label: m.narrator_add_stage_chapters() },
    { k: "narration", label: m.narrator_add_stage_narration() },
  ];

  // Whatever the tab, the picker and the drop area take every kind Narrator reads.
  const ACCEPT_ALL = Object.values(ACCEPT_BY_KIND).join(",");

  let tab = $state<DocKind>(untrack(() => initialTab));
  let voice = $state<string | undefined>(undefined);
  let choosingVoice = $state(false);
  let previewing = $state(false);
  let text = $state("");
  let drag = $state(false);
  let busy = $state(false);
  let stageIndex = $state(0);
  let fileName = $state("");
  let failure = $state<{ name: string; message: string } | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let overlay = $state<HTMLDivElement | null>(null);

  const activeTab = $derived(TABS.find((t) => t.id === tab) ?? TABS[0]);
  const voiceChoices = $derived(voiceCatalog.shortList(5));
  const selectedVoice = $derived(voice ?? voiceCatalog.defaultName);
  // Some devices put "Premium" or "Enhanced" in a voice's name. It reads like a paid tier, so
  // the note says what it is whenever such a name is on screen.
  const devicePremium = $derived(
    [selectedVoice, ...(choosingVoice ? voiceChoices.map((v) => v.name) : [])].some((name) =>
      /premium|enhanced/i.test(name ?? ""),
    ),
  );

  // Reading a file cannot be stopped half way, so Cancel (and closing) drops its result:
  // each read carries the number it started with and is ignored once that has moved on.
  let run = 0;

  async function handleFile(file: File) {
    if (busy) return;
    const kind = kindForFile(file);
    if (!kind) {
      failure = { name: file.name, message: m.narrator_add_unsupported() };
      return;
    }
    tab = kind;
    failure = null;
    busy = true;
    fileName = file.name;
    stageIndex = 0;
    const mine = ++run;
    try {
      const doc = await extractFile(file, selectedVoice ?? "", (stage) => {
        if (mine === run) stageIndex = STAGES.findIndex((s) => s.k === stage);
      });
      if (mine !== run) return;
      stageIndex = STAGES.length; // every step done
      setTimeout(() => mine === run && oncreate(doc), 350);
    } catch (e) {
      if (mine !== run) return;
      busy = false;
      failure = { name: file.name, message: e instanceof Error ? e.message : m.narrator_add_read_failed() };
    }
  }

  function cancel() {
    run++;
    busy = false;
  }

  function startPaste() {
    const doc = extractPaste(text, selectedVoice ?? "");
    if (doc) oncreate(doc);
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

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<!-- A press on the dimmed page around the sheet closes it. Focus starts on the dialog, so Tab
     and Escape work from inside it. -->
<div
  bind:this={overlay}
  class="overlay"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.narrator_add_dialog()}
  onpointerdown={(e) => e.target === e.currentTarget && onclose()}
>
  <div class="sheet">
    <div class="glow"></div>
    <div class="grip"></div>
    <div class="head">
      <!-- Nothing to go back to on the first step: the arrow comes with the second. -->
      {#if busy}
        <button class="icon-btn" onclick={cancel} aria-label={m.narrator_back()}><ArrowLeft size={18} strokeWidth={1.5} /></button>
      {/if}
      <div class="head-text">
        <h2>{m.narrator_add_dialog()}</h2>
        <p>{m.narrator_add_subtitle()}</p>
      </div>
      <button class="icon-btn close" onclick={onclose} aria-label={m.narrator_close()}><X size={18} strokeWidth={1.5} /></button>
    </div>

    <input
      bind:this={fileInput}
      type="file"
      accept={ACCEPT_ALL}
      class="file-input"
      aria-label={activeTab.choose}
      onchange={(e) => {
        const file = e.currentTarget.files?.[0];
        if (file) void handleFile(file);
        e.currentTarget.value = "";
      }}
    />

    {#if busy}
      <div class="scroll pipe">
        <div class="pipe-spinner">
          <Equalizer color="var(--n-brand-blue)" size={40} />
          <div class="spin-ring"></div>
        </div>
        <h3>{m.narrator_add_building()}</h3>
        <p class="pipe-sub">{fileName}</p>
        <div class="pipe-bar" aria-hidden="true">
          <div style:width="{(Math.min(stageIndex, STAGES.length) / STAGES.length) * 100}%"></div>
        </div>
        <p class="sr-only" role="status">{STAGES[stageIndex]?.label ?? ""}</p>
        <div class="steps">
          {#each STAGES as step, i (step.k)}
            {@const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "pending"}
            <div class="step {state}">
              <div class="dot {state}">
                {#if state === "done"}
                  <Check size={13} strokeWidth={2.5} style="color: #04240f" />
                {:else if state === "active"}
                  <div class="pulse"></div>
                {/if}
              </div>
              <div class="step-label">{step.label}</div>
            </div>
          {/each}
        </div>
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
              <t.icon size={16} strokeWidth={1.5} />
              {t.label}
            </button>
          {/each}
        </div>

        {#if failure}
          <Notice
            tone="error"
            class="add-error"
            title={m.narrator_add_error_title({ name: failure.name })}
            actions={[
              { label: m.narrator_add_choose_another(), onclick: () => fileInput?.click(), primary: true },
              {
                label: m.narrator_add_paste_instead(),
                onclick: () => {
                  tab = "paste";
                  failure = null;
                },
              },
            ]}
          >
            {failure.message}
          </Notice>
        {/if}

        {#if tab === "paste"}
          <textarea
            bind:value={text}
            placeholder={m.narrator_add_paste_placeholder()}
            aria-label={m.narrator_add_paste_label()}
          ></textarea>
        {:else}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="drop"
            class:drag
            role="button"
            tabindex="0"
            aria-label={activeTab.choose}
            onclick={() => fileInput?.click()}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInput?.click();
              }
            }}
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
            <div class="drop-icon"><activeTab.icon size={28} strokeWidth={1.5} /></div>
            <div class="drop-text">
              <!-- Dropping is for a mouse. A phone gets the button at the foot of the sheet. -->
              <div class="drop-mouse">
                <div class="drop-title">{activeTab.drop}</div>
                <div class="drop-sub">{m.narrator_add_drop_or()} <span>{m.narrator_add_browse()}</span></div>
              </div>
              <div class="drop-hint">{activeTab.hint}</div>
            </div>
          </div>
        {/if}

        <div class="voice">
          <div class="voice-row">
            <Mic size={18} strokeWidth={1.5} style="color: var(--n-brand-blue); flex-shrink: 0" />
            <div class="voice-text">
              <span class="voice-label">{m.narrator_narrator_voice()}</span>
              <span class="voice-name">{selectedVoice ?? m.narrator_add_system_default()}</span>
            </div>
            {#if speechAvailable()}
              <button
                class="icon-btn"
                aria-pressed={previewing}
                aria-label={previewing
                  ? m.narrator_add_voice_stop()
                  : m.narrator_add_voice_preview({ voice: selectedVoice ?? m.narrator_add_system_default() })}
                title={previewing
                  ? m.narrator_add_voice_stop()
                  : m.narrator_add_voice_preview({ voice: selectedVoice ?? m.narrator_add_system_default() })}
                onclick={preview}
              >
                {#if previewing}
                  <Pause size={16} strokeWidth={1.5} />
                {:else}
                  <Play size={16} strokeWidth={1.5} />
                {/if}
              </button>
            {/if}
            {#if voiceChoices.length > 1}
              <button class="change" aria-expanded={choosingVoice} onclick={() => (choosingVoice = !choosingVoice)}>
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
      </div>
      <div class="foot">
        {#if tab === "paste"}
          <Btn variant="primary" class="wide" disabled={!text.trim()} onclick={startPaste}>
            <Sparkles size={16} strokeWidth={1.5} /> {m.narrator_add_narrate()}
          </Btn>
        {:else}
          <Btn variant="primary" class="wide choose-btn" onclick={() => fileInput?.click()}>
            <activeTab.icon size={18} strokeWidth={1.5} /> {activeTab.choose}
          </Btn>
        {/if}
      </div>
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
    padding: 28px 28px 24px;
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
    color: var(--n-fg-2);
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
    border: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .icon-btn:hover {
    color: var(--n-fg-0);
    border-color: var(--n-border-2);
  }
  .icon-btn.close {
    margin-left: auto;
  }
  .icon-btn:focus-visible,
  .tab:focus-visible,
  .drop:focus-visible,
  .change:focus-visible,
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
    padding: 0 28px;
  }
  .foot {
    position: relative;
    padding: 20px 28px 28px;
  }
  .foot :global(.wide) {
    width: 100%;
    min-height: 48px;
  }
  /* With a mouse the drop area is the way in, so the button at the foot is for touch only. */
  .foot :global(.choose-btn) {
    display: none;
  }
  .foot:has(:global(.choose-btn)) {
    padding-top: 8px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    padding: 4px;
    background: var(--n-bg-0);
    border-radius: 12px;
    margin-bottom: 20px;
    border: 1px solid var(--n-border-1);
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 8px;
    border-radius: 9px;
    border: none;
    background: transparent;
    color: var(--n-fg-1);
    font-family: var(--n-font-sans);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
  }
  .tab.active {
    background: rgba(18, 145, 250, 0.16);
    color: var(--n-fg-0);
    box-shadow: inset 0 0 0 1px rgba(18, 145, 250, 0.5);
  }
  .file-input {
    display: none;
  }
  .body :global(.add-error) {
    margin-bottom: 16px;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 36px 24px;
    border: 1.5px dashed var(--n-border-3);
    border-radius: 16px;
    cursor: pointer;
    text-align: center;
    transition: all 200ms var(--n-ease-out);
    background: var(--n-bg-1);
  }
  .drop.drag {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.08);
  }
  .drop-icon {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--n-brand-gradient);
    color: #fff;
    box-shadow:
      var(--n-brand-glow),
      inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .drop-title {
    font-weight: 700;
    font-size: 17px;
  }
  .drop-sub {
    color: var(--n-fg-1);
    font-size: 14px;
  }
  .drop-sub span {
    color: var(--n-link);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .drop-hint {
    font-size: 14px;
    line-height: 1.5;
    color: var(--n-fg-2);
    margin-top: 8px;
    max-width: 400px;
  }
  textarea {
    display: block;
    width: 100%;
    min-height: 168px;
    resize: vertical;
    padding: 16px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
    font-family: var(--n-font-serif);
    font-size: 16px;
    line-height: 1.6;
    outline: none;
  }
  textarea:focus {
    border-color: var(--n-brand-blue);
  }
  textarea::placeholder {
    color: var(--n-fg-2);
  }
  .voice {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .voice-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-1);
  }
  .voice-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .voice-label {
    color: var(--n-fg-2);
    font-size: 13px;
  }
  .voice-name {
    color: var(--n-fg-0);
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .change {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
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
    font-size: 13px;
    line-height: 1.5;
    color: var(--n-fg-2);
  }
  .pipe {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    /* Room above for the spinner's ring, which reaches past its box. */
    padding: 18px 28px 4px;
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
    height: 4px;
    border-radius: 999px;
    background: var(--n-bg-3);
    overflow: hidden;
    margin-bottom: 12px;
  }
  .pipe-bar div {
    height: 100%;
    border-radius: 999px;
    background: var(--n-accent-app, var(--n-brand-blue));
    transition: width 300ms var(--n-ease-out);
  }
  .pipe-spinner {
    position: relative;
    width: 64px;
    height: 64px;
    margin-bottom: 8px;
    display: grid;
    place-items: center;
  }
  .spin-ring {
    position: absolute;
    inset: -10px;
    border-radius: 999px;
    border: 1.5px solid var(--n-border-1);
    border-top-color: var(--n-brand-blue);
    animation: n-spin 1s linear infinite;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    max-width: 380px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 10px;
    transition: all 200ms var(--n-ease-out);
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

  /* Touch, or a phone's width: the picker button is the way in, not dropping. */
  @media (max-width: 560px), (hover: none), (pointer: coarse) {
    .foot :global(.choose-btn) {
      display: inline-flex;
    }
    .foot:has(:global(.choose-btn)) {
      padding-top: 20px;
    }
    .drop-mouse {
      display: none;
    }
    .drop {
      flex-direction: row;
      align-items: center;
      gap: 14px;
      padding: 14px;
      text-align: left;
      border-style: solid;
      border-color: var(--n-border-1);
      background: var(--n-bg-0);
    }
    .drop-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
    }
    .drop-hint {
      margin-top: 0;
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
      padding: 12px 16px 16px;
    }
    .head h2 {
      font-size: 20px;
    }
    .body {
      padding: 0 16px;
    }
    .pipe {
      padding: 16px 16px 4px;
    }
    .foot {
      padding: 14px 16px max(16px, env(safe-area-inset-bottom));
      border-top: 1px solid var(--n-border-1);
    }
    .foot:has(:global(.choose-btn)) {
      padding-top: 14px;
    }
    .tabs {
      margin-bottom: 16px;
    }
    /* Four tabs with icons do not fit a phone: the labels alone, each on one line. */
    .tab {
      flex: 1 1 auto;
      white-space: nowrap;
    }
    .tab :global(svg) {
      display: none;
    }
    textarea {
      min-height: 150px;
    }
    .voice {
      margin: 16px 0;
    }
  }
</style>
