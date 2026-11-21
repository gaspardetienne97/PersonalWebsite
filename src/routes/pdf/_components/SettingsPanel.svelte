<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Check from "@lucide/svelte/icons/check";

  import { m } from "@repo/i18n/messages.js";
  import { getLocale } from "@repo/i18n/runtime.js";
  import { KOKORO_VOICES, kokoroSupported } from "@repo/pdf-core";
  import {
    ACCENT_OPTIONS,
    FONT_SIZE,
    LINE_HEIGHT,
    stepWithin,
    type ReaderSettings,
    type ReadingFont,
    type VoiceEngine,
  } from "@repo/pdf-core/stores/settings";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import { LANGUAGES } from "./languages";

  let { settings }: { settings: ReaderSettings } = $props();

  type Tab = "text" | "colour" | "voice";
  // One section in view at a time, so the panel stays short: the text it changes shows beside
  // it on a wide screen and above it on a phone, and nothing scrolls.
  const TABS: { id: Tab; label: string }[] = [
    { id: "text", label: m.narrator_panel_type() },
    { id: "colour", label: m.narrator_panel_accent() },
    { id: "voice", label: m.narrator_panel_voice() },
  ];
  let tab = $state<Tab>("text");

  const ENGINES: { value: VoiceEngine; label: string; hint: string }[] = [
    { value: "system", label: m.narrator_engine_system(), hint: m.narrator_settings_engine_system_hint() },
    { value: "natural", label: m.narrator_engine_natural(), hint: m.narrator_settings_engine_natural_hint() },
  ];
  const FONTS: { value: ReadingFont; label: string }[] = [
    { value: "sans", label: m.narrator_panel_font_sans() },
    { value: "serif", label: m.narrator_panel_font_serif() },
  ];
  /** The accents by name, in the order of ACCENT_OPTIONS. */
  const ACCENT_NAMES = [
    m.narrator_accent_blue(),
    m.narrator_accent_purple(),
    m.narrator_accent_red(),
    m.narrator_accent_green(),
  ];
  const naturalAvailable = kokoroSupported();
  const language = LANGUAGES.find((l) => l.locale === getLocale());

  const voiceName = $derived(
    settings.engine === "natural"
      ? KOKORO_VOICES.find((v) => v.id === settings.naturalVoice)?.name
      : voiceCatalog.inUse(settings.systemVoice)?.name,
  );
  const fill = (value: number, range: { min: number; max: number }) =>
    `${((value - range.min) / (range.max - range.min)) * 100}%`;
  // The marked word is built here, never from anything typed in.
  const sample = $derived(
    m.narrator_panel_sample({
      word: `<span class="word current ${settings.highlight}">${m.narrator_panel_sample_word()}</span>`,
    }),
  );
</script>

{#snippet minus()}
  <svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M3 8h10" />
  </svg>
{/snippet}
{#snippet plus()}
  <svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M3 8h10M8 3v10" />
  </svg>
{/snippet}

<div class="panel" role="group" aria-label={m.narrator_panel_label()}>
  <div class="tabs" role="tablist" aria-label={m.narrator_panel_label()}>
    {#each TABS as t (t.id)}
      <button
        role="tab"
        id="panel-tab-{t.id}"
        aria-selected={tab === t.id}
        aria-controls="panel-{t.id}"
        class:on={tab === t.id}
        onclick={() => (tab = t.id)}
      >
        {t.label}
      </button>
    {/each}
  </div>

  <div class="pane" class:shown={tab === "text"} role="tabpanel" id="panel-text" aria-labelledby="panel-tab-text">
    <div class="metric">
      <div class="metric-head">
        <span class="label" id="panel-size">{m.narrator_panel_text_size()}</span>
        <!-- The size itself, not a number of pixels. -->
        <span
          class="aa"
          aria-hidden="true"
          style:font-size="{settings.fontSize}px"
          style:font-family={settings.font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}>Aa</span
        >
      </div>
      <div class="stepper">
        <button
          class="round"
          aria-label={m.narrator_panel_smaller()}
          disabled={settings.fontSize <= FONT_SIZE.min}
          onclick={() => settings.update("fontSize", stepWithin(settings.fontSize, -1, FONT_SIZE))}
        >
          {@render minus()}
        </button>
        <input
          type="range"
          aria-labelledby="panel-size"
          min={FONT_SIZE.min}
          max={FONT_SIZE.max}
          step={FONT_SIZE.step}
          value={settings.fontSize}
          style:--fill={fill(settings.fontSize, FONT_SIZE)}
          oninput={(e) => settings.update("fontSize", Number(e.currentTarget.value))}
        />
        <button
          class="round"
          aria-label={m.narrator_panel_larger()}
          disabled={settings.fontSize >= FONT_SIZE.max}
          onclick={() => settings.update("fontSize", stepWithin(settings.fontSize, 1, FONT_SIZE))}
        >
          {@render plus()}
        </button>
      </div>
    </div>

    <div class="metric">
      <div class="metric-head">
        <span class="label" id="panel-spacing">{m.narrator_panel_line_spacing()}</span>
        <!-- Three lines, as far apart as the text's. -->
        <span class="lines" aria-hidden="true" style:gap="{(settings.lineHeight - 1) * 9}px">
          <i></i><i></i><i></i>
        </span>
      </div>
      <div class="stepper">
        <button
          class="round"
          aria-label={m.narrator_panel_tighter()}
          disabled={settings.lineHeight <= LINE_HEIGHT.min}
          onclick={() => settings.update("lineHeight", stepWithin(settings.lineHeight, -1, LINE_HEIGHT))}
        >
          {@render minus()}
        </button>
        <input
          type="range"
          aria-labelledby="panel-spacing"
          min={LINE_HEIGHT.min}
          max={LINE_HEIGHT.max}
          step="0.05"
          value={settings.lineHeight}
          style:--fill={fill(settings.lineHeight, LINE_HEIGHT)}
          oninput={(e) => settings.update("lineHeight", Number(e.currentTarget.value))}
        />
        <button
          class="round"
          aria-label={m.narrator_panel_looser()}
          disabled={settings.lineHeight >= LINE_HEIGHT.max}
          onclick={() => settings.update("lineHeight", stepWithin(settings.lineHeight, 1, LINE_HEIGHT))}
        >
          {@render plus()}
        </button>
      </div>
    </div>

    <div class="metric">
      <span class="label" id="panel-font">{m.narrator_panel_font()}</span>
      <div class="seg" role="group" aria-labelledby="panel-font">
        {#each FONTS as f (f.value)}
          <button
            class:on={settings.font === f.value}
            aria-pressed={settings.font === f.value}
            style:font-family={f.value === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
            onclick={() => settings.update("font", f.value)}
          >
            {#if settings.font === f.value}<Check size={15} strokeWidth={2.5} />{/if}
            {f.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="pane" class:shown={tab === "colour"} role="tabpanel" id="panel-colour" aria-labelledby="panel-tab-colour">
    <div class="swatches">
      {#each ACCENT_OPTIONS as color, i (color)}
        {@const on = settings.accent === color && !settings.accentAuto}
        <button
          class="swatch"
          class:on
          aria-pressed={on}
          onclick={() => {
            settings.update("accent", color);
            settings.update("accentAuto", false);
          }}
        >
          <span class="dot" style:background={color}>
            {#if on}<Check size={15} strokeWidth={2.5} />{/if}
          </span>
          {ACCENT_NAMES[i]}
        </button>
      {/each}
    </div>

    <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own markup around a message -->
    <p class="sample">{@html sample}</p>

    <button
      class="toggle-row"
      role="switch"
      aria-checked={settings.accentAuto}
      onclick={() => settings.update("accentAuto", !settings.accentAuto)}
    >
      <span class="toggle-text">
        <span class="label">{m.narrator_panel_match_document()}</span>
        <span class="hint">{m.narrator_panel_match_hint()}</span>
      </span>
      <span class="toggle" class:on={settings.accentAuto}><span class="knob"></span></span>
    </button>
  </div>

  <div class="pane" class:shown={tab === "voice"} role="tabpanel" id="panel-voice" aria-labelledby="panel-tab-voice">
    <!-- The same switch as the settings page: the kind of voice over what it means. -->
    <div class="switch" role="group" aria-label={m.narrator_panel_voice()}>
      {#each ENGINES as o (o.value)}
        <button
          class:on={settings.engine === o.value}
          aria-label={o.label}
          aria-describedby="panel-engine-{o.value}"
          aria-pressed={settings.engine === o.value}
          disabled={o.value === "natural" && !naturalAvailable}
          onclick={() => settings.update("engine", o.value)}
        >
          <strong>{o.label}</strong>
          <span id="panel-engine-{o.value}">{o.hint}</span>
        </button>
      {/each}
    </div>
    {#if voiceName}
      <p class="reading-with">{m.narrator_panel_reading_with({ voice: voiceName })}</p>
    {/if}
    <p class="hint">
      {#if settings.engine === "natural"}
        {m.narrator_panel_hint_natural()}
      {:else}
        {m.narrator_panel_hint_system()}
      {/if}
    </p>
    <a class="link-row" href="/pdf/settings">
      <span>{m.narrator_panel_settings_link()}</span>
      <ArrowRight size={15} strokeWidth={1.5} />
    </a>

    <!-- The interface language is chosen on the settings page: changing it reloads the app. -->
    <a class="link-row lang" href="/pdf/settings">
      <span>{m.narrator_language()}</span>
      <span class="value" lang={language?.locale}>{language?.name}</span>
      <ArrowRight size={15} strokeWidth={1.5} />
    </a>
  </div>
</div>

<style>
  .panel {
    width: 328px;
    display: flex;
    flex-direction: column;
    padding: 12px 16px 12px;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-bottom: 8px;
    padding: 4px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  .tabs button {
    min-height: 44px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .tabs button:hover:not(.on) {
    background: var(--n-bg-1);
  }
  .tabs button.on {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
    color: var(--n-fg-0);
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pane:not(.shown) {
    display: none;
  }
  .label {
    font-size: 14px;
    font-weight: 500;
    color: var(--n-fg-0);
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .metric-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 32px;
  }
  .aa {
    line-height: 1;
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .lines {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 22px;
    height: 32px;
  }
  .lines i {
    height: 2px;
    border-radius: 1px;
    background: var(--n-fg-0);
  }
  .lines i:last-child {
    width: 60%;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .round {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
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
  /* A finger-sized slider: 44 px tall, with a thumb large enough to see and to hold. */
  input[type="range"] {
    flex: 1;
    min-width: 0;
    height: 44px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    --rail: linear-gradient(
      to right,
      var(--n-accent, var(--n-accent-app)) var(--fill),
      var(--n-bg-0) var(--fill)
    );
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 999px;
    background: var(--rail);
    box-shadow: inset 0 0 0 1px var(--n-border-3);
  }
  input[type="range"]::-moz-range-track {
    height: 8px;
    border-radius: 999px;
    background: var(--rail);
    box-shadow: inset 0 0 0 1px var(--n-border-3);
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 28px;
    height: 28px;
    margin-top: -10px;
    border-radius: 999px;
    border: none;
    background: var(--n-fg-0);
    box-shadow: var(--n-shadow-md);
  }
  input[type="range"]::-moz-range-thumb {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: none;
    background: var(--n-fg-0);
    box-shadow: var(--n-shadow-md);
  }
  input[type="range"]:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
    border-radius: 10px;
  }
  .seg {
    display: flex;
    gap: 3px;
    margin-top: 4px;
    padding: 3px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
    border-radius: 12px;
  }
  .seg button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
    color: var(--n-fg-0);
  }
  /* The System or Natural switch, drawn as on the settings page. */
  .switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  .switch button {
    min-height: 56px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
  }
  .switch strong {
    font-size: 15px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .switch span {
    font-size: 13px;
    line-height: 1.3;
    color: var(--n-fg-2);
  }
  .switch button:hover:not(:disabled, .on) {
    background: var(--n-bg-1);
  }
  .switch button.on {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
  }
  .switch button.on span {
    color: var(--n-fg-1);
  }
  .switch button:disabled {
    cursor: not-allowed;
  }
  .switch button:disabled strong {
    color: var(--n-fg-2);
  }
  .reading-with {
    margin: 4px 0 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .hint {
    margin: 0;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.45;
    color: var(--n-fg-2);
  }
  .link-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-0);
    text-decoration: underline;
    text-decoration-color: var(--n-border-3);
    text-underline-offset: 4px;
  }
  .link-row:hover {
    text-decoration-color: currentColor;
  }
  .link-row.lang {
    border-top: 1px solid var(--n-border-1);
    text-decoration: none;
  }
  .link-row .value {
    margin-left: auto;
    font-weight: 500;
    color: var(--n-fg-1);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-height: 62px;
    padding: 8px 2px 6px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .swatch:hover {
    background: var(--n-bg-2);
  }
  .swatch.on {
    color: var(--n-fg-0);
    font-weight: 700;
  }
  .dot {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: var(--n-on-accent);
  }
  /* The chosen accent: a ring around it and a check inside. */
  .swatch.on .dot {
    box-shadow:
      0 0 0 2px var(--n-bg-3),
      0 0 0 4px var(--n-fg-0);
  }
  /* What the accent does to the text: a sentence on the page's own colour, one word marked. */
  .sample {
    margin: 0;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-1);
    font-size: 15px;
    line-height: 1.7;
    color: var(--n-fg-1);
  }
  .sample :global(.word) {
    white-space: nowrap;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    border: none;
    background: transparent;
    padding: 2px 0;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .toggle {
    width: 44px;
    height: 26px;
    border-radius: 999px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-3);
    position: relative;
    flex-shrink: 0;
  }
  .toggle.on {
    background: var(--n-accent-app);
    border-color: var(--n-accent-app);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--n-fg-0);
    transition: transform 200ms var(--n-ease-out);
  }
  .toggle.on .knob {
    transform: translateX(18px);
  }
  @media (max-width: 560px) {
    .panel {
      width: 100%;
      padding: 10px 16px 14px;
    }
    .swatch.on .dot {
      box-shadow:
        0 0 0 2px var(--n-bg-2),
        0 0 0 4px var(--n-fg-0);
    }
  }
</style>
