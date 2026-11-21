<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Check from "@lucide/svelte/icons/check";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { getLocale } from "@repo/i18n/runtime.js";
  import { KOKORO_VOICES, kokoroSupported } from "@repo/pdf-core";
  import {
    ACCENT_OPTIONS,
    FONT_SIZE,
    LINE_HEIGHT,
    shareOfDefault,
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
  // A size or a spacing as a share of the usual one: "110%" needs no unit to be understood.
  const share = (key: "fontSize" | "lineHeight") =>
    formatNumber(shareOfDefault(key, settings[key]), { style: "percent", maximumFractionDigits: 0 });
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

<!-- One type setting: its name, a step down, the slider, a step up, and its value. The value is
     a percentage of the usual size. Away from 100% it is a button that puts the setting back. -->
{#snippet metric(
  key: "fontSize" | "lineHeight",
  range: { min: number; max: number; step: number },
  sliderStep: number,
  label: string,
  less: string,
  more: string,
  reset: string,
)}
  {@const value = settings[key]}
  <div class="metric">
    <span class="label" id="panel-{key}">{label}</span>
    <button
      class="round"
      aria-label={less}
      disabled={value <= range.min}
      onclick={() => settings.update(key, stepWithin(value, -1, range))}
    >
      {@render minus()}
    </button>
    <input
      type="range"
      aria-labelledby="panel-{key}"
      aria-valuetext={share(key)}
      min={range.min}
      max={range.max}
      step={sliderStep}
      {value}
      style:--fill={fill(value, range)}
      oninput={(e) => settings.update(key, Number(e.currentTarget.value))}
    />
    <button
      class="round"
      aria-label={more}
      disabled={value >= range.max}
      onclick={() => settings.update(key, stepWithin(value, 1, range))}
    >
      {@render plus()}
    </button>
    {#if settings.isDefault(key)}
      <span class="value n-num">{share(key)}</span>
    {:else}
      <button class="value back" aria-label={reset} onclick={() => settings.reset(key)}>
        <span class="n-num">{share(key)}</span>
        <span class="back-word">{m.narrator_panel_reset()}</span>
      </button>
    {/if}
  </div>
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
    {@render metric(
      "fontSize",
      FONT_SIZE,
      FONT_SIZE.step,
      m.narrator_panel_text_size(),
      m.narrator_panel_smaller(),
      m.narrator_panel_larger(),
      m.narrator_panel_reset_size(),
    )}
    {@render metric(
      "lineHeight",
      LINE_HEIGHT,
      0.05,
      m.narrator_panel_line_spacing(),
      m.narrator_panel_tighter(),
      m.narrator_panel_looser(),
      m.narrator_panel_reset_spacing(),
    )}

    <div class="metric font">
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
    <div class="switch" role="group" aria-label={m.narrator_player_voice()}>
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

    <!-- Its own part of the tab: the language of the menus is not a voice setting. It is chosen
         on the settings page, since changing it reloads the app. -->
    <h3 class="part">{m.narrator_language()}</h3>
    <a class="link-row lang" href="/pdf/settings">
      <span lang={language?.locale}>{language?.name}</span>
      <span class="go">{m.narrator_panel_language_change()}</span>
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
  /* Each tab as wide as its name, with the spare room shared out: the longest name stays on
     one line. */
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    padding: 4px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  .tabs button {
    flex: 1 1 auto;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
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
    line-height: 1.25;
    color: var(--n-fg-0);
  }
  /* A wide screen: the name and the value over the step buttons and the slider. */
  .metric {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    grid-template-areas:
      "label label value"
      "less slider more";
    align-items: center;
    gap: 2px 10px;
  }
  .metric .label {
    grid-area: label;
  }
  .metric input {
    grid-area: slider;
  }
  .metric .round:first-of-type {
    grid-area: less;
  }
  .metric .round:last-of-type {
    grid-area: more;
  }
  .value {
    grid-area: value;
    justify-self: end;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-1);
    white-space: nowrap;
  }
  /* Away from the usual size the value is the way back to it. */
  .value.back {
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--n-border-3);
    border-radius: 10px;
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    font-family: inherit;
    cursor: pointer;
  }
  .value.back:hover {
    background: var(--n-bg-1);
  }
  .back-word {
    font-weight: 500;
    color: var(--n-fg-1);
    text-decoration: underline;
    text-decoration-color: var(--n-border-3);
    text-underline-offset: 3px;
  }
  .metric.font {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "label" "seg";
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
    grid-area: seg;
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
    font-size: 14px;
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
    font-size: 14px;
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
  /* A part of a tab with its own name: a rule above it and the name under the rule. */
  .part {
    margin: 6px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--n-border-2);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--n-fg-0);
  }
  .link-row.lang {
    text-decoration: none;
  }
  .link-row .go {
    margin-left: auto;
    font-weight: 500;
    color: var(--n-fg-1);
    text-decoration: underline;
    text-decoration-color: var(--n-border-3);
    text-underline-offset: 4px;
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
  /* One row, pressed as a whole. */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 48px;
    border: 1px solid var(--n-border-2);
    border-radius: 10px;
    background: var(--n-bg-2);
    padding: 6px 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .toggle-row:hover {
    border-color: var(--n-border-3);
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
    /* One row for each control, so the sheet stays short and the text above it in view. */
    .metric {
      grid-template-columns: 80px 44px minmax(0, 1fr) 44px 66px;
      grid-template-areas: "label less slider more value";
      gap: 6px;
    }
    .metric .label {
      hyphens: auto;
      overflow-wrap: anywhere;
    }
    .value {
      justify-self: stretch;
      justify-content: center;
    }
    .value.back {
      flex-direction: column;
      gap: 0;
      padding: 0 2px;
      line-height: 1.2;
    }
    .back-word {
      font-size: 12px;
    }
    .metric.font {
      grid-template-columns: 80px minmax(0, 1fr);
      grid-template-areas: "label seg";
    }
    .metric.font .seg {
      margin-top: 0;
    }
    .toggle-row {
      background: var(--n-bg-3);
    }
    .swatch.on .dot {
      box-shadow:
        0 0 0 2px var(--n-bg-2),
        0 0 0 4px var(--n-fg-0);
    }
  }
</style>
