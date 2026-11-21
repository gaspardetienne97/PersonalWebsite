<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Check from "@lucide/svelte/icons/check";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { getLocale } from "@repo/i18n/runtime.js";
  import { kokoroSupported } from "@repo/pdf-core";
  import { ACCENT_OPTIONS, type ReaderSettings, type VoiceEngine } from "@repo/pdf-core/stores/settings";

  import { LANGUAGES } from "./languages";

  let { settings }: { settings: ReaderSettings } = $props();

  const ENGINES: { value: VoiceEngine; label: string }[] = [
    { value: "system", label: m.narrator_engine_system() },
    { value: "natural", label: m.narrator_engine_natural() },
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
</script>

<div class="panel" role="group" aria-label={m.narrator_panel_label()}>
  <!-- What changes the text comes first: on a phone it is what shows above the fold of the sheet. -->
  <div class="section">{m.narrator_panel_type()}</div>

  <label class="slider-row">
    <span class="label">
      {m.narrator_panel_text_size()}
      <em>{settings.fontSize} px</em>
    </span>
    <input
      type="range"
      min="16"
      max="30"
      step="1"
      value={settings.fontSize}
      oninput={(e) => settings.update("fontSize", Number(e.currentTarget.value))}
    />
  </label>

  <label class="slider-row">
    <span class="label">
      {m.narrator_panel_line_spacing()}
      <em>{formatNumber(settings.lineHeight, { minimumFractionDigits: 2 })}</em>
    </span>
    <input
      type="range"
      min="1.4"
      max="2.2"
      step="0.05"
      value={settings.lineHeight}
      oninput={(e) => settings.update("lineHeight", Number(e.currentTarget.value))}
    />
  </label>

  <div class="section">{m.narrator_panel_accent()}</div>

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

  <button
    class="toggle-row"
    role="switch"
    aria-checked={settings.accentAuto}
    onclick={() => settings.update("accentAuto", !settings.accentAuto)}
  >
    <span class="label">{m.narrator_panel_match_document()}</span>
    <span class="toggle" class:on={settings.accentAuto}><span class="knob"></span></span>
  </button>

  <div class="section">{m.narrator_panel_voice()}</div>

  <div class="seg" role="group" aria-label={m.narrator_panel_voice()}>
    {#each ENGINES as o (o.value)}
      <button
        class:on={settings.engine === o.value}
        aria-pressed={settings.engine === o.value}
        disabled={o.value === "natural" && !naturalAvailable}
        onclick={() => settings.update("engine", o.value)}
      >
        {o.label}
      </button>
    {/each}
  </div>
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

<style>
  .panel {
    width: 304px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 14px 12px;
  }
  .section {
    font-family: var(--n-font-mono);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--n-fg-2);
    padding: 10px 0 2px;
  }
  .label {
    font-size: 14px;
    color: var(--n-fg-0);
  }
  .label em {
    font-style: normal;
    font-family: var(--n-font-mono);
    font-size: 12px;
    color: var(--n-fg-2);
    margin-left: 6px;
  }
  .seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
    border-radius: 10px;
  }
  .seg button {
    flex: 1;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--n-fg-2);
    font-family: var(--n-font-sans);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms var(--n-ease-out);
  }
  .seg button.on {
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    box-shadow: var(--n-shadow-xs);
  }
  .seg button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .hint {
    margin: 2px 0 0;
    font-size: 13px;
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
    margin-top: 4px;
    border-top: 1px solid var(--n-border-1);
    text-decoration: none;
  }
  .link-row .value {
    margin-left: auto;
    font-weight: 500;
    color: var(--n-fg-1);
  }
  .slider-row {
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }
  /* A finger-sized control: the native slider, 44 px tall. */
  input[type="range"] {
    width: 100%;
    height: 44px;
    margin: 0;
    accent-color: var(--n-accent, var(--n-accent-app));
    cursor: pointer;
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
    min-height: 60px;
    padding: 6px 2px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 12px;
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
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 44px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .toggle {
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-3);
    position: relative;
    transition: all 200ms var(--n-ease-out);
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
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--n-fg-0);
    transition: transform 200ms var(--n-ease-out);
  }
  .toggle.on .knob {
    transform: translateX(16px);
  }
  @media (max-width: 560px) {
    .panel {
      width: 100%;
      padding: 4px 16px 16px;
    }
    .swatch.on .dot {
      box-shadow:
        0 0 0 2px var(--n-bg-2),
        0 0 0 4px var(--n-fg-0);
    }
  }
</style>
