<script lang="ts">
  import Check from "@lucide/svelte/icons/check";

  import ArrowRight from "@lucide/svelte/icons/arrow-right";

  import { LANGUAGES } from "./languages";

  import { m } from "@repo/i18n/messages.js";
  import { getLocale, setLocale } from "@repo/i18n/runtime.js";
  import { kokoroSupported } from "@repo/pdf-core";
  import { ACCENT_OPTIONS, type ReaderSettings, type VoiceEngine } from "@repo/pdf-core/stores/settings";

  let { settings }: { settings: ReaderSettings } = $props();

  const ENGINES: { value: VoiceEngine; label: string }[] = [
    { value: "system", label: m.narrator_engine_system() },
    { value: "natural", label: m.narrator_engine_natural() },
  ];
  const naturalAvailable = kokoroSupported();
  const locale = getLocale();
</script>

<div class="panel" role="group" aria-label={m.narrator_panel_label()}>
  <div class="section">{m.narrator_panel_voice()}</div>

  <div class="row">
    <span class="label">{m.narrator_panel_engine()}</span>
    <div class="seg">
      {#each ENGINES as o (o.value)}
        <button
          class:on={settings.engine === o.value}
          disabled={o.value === "natural" && !naturalAvailable}
          onclick={() => settings.update("engine", o.value)}
        >
          {o.label}
        </button>
      {/each}
    </div>
  </div>
  <p class="hint">
    {#if settings.engine === "natural"}
      {m.narrator_panel_hint_natural()}
    {:else}
      {m.narrator_panel_hint_system()}
    {/if}
  </p>
  <a class="settings-link" href="/pdf/settings">
    {m.narrator_panel_settings_link()} <ArrowRight size={13} strokeWidth={1.5} />
  </a>

  <div class="section">{m.narrator_panel_type()}</div>

  <label class="row slider-row">
    <span class="label">{m.narrator_panel_text_size()} <em>{settings.fontSize}px</em></span>
    <input
      type="range"
      min="16"
      max="30"
      step="1"
      value={settings.fontSize}
      oninput={(e) => settings.update("fontSize", Number(e.currentTarget.value))}
    />
  </label>

  <label class="row slider-row">
    <span class="label">{m.narrator_panel_line_spacing()} <em>{settings.lineHeight.toFixed(2)}</em></span>
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

  <div class="row">
    <span class="label">{m.narrator_panel_accent_color()}</span>
    <div class="swatches">
      {#each ACCENT_OPTIONS as color (color)}
        <button
          class="swatch"
          class:on={settings.accent === color && !settings.accentAuto}
          style:background={color}
          aria-label={m.narrator_panel_accent_swatch({ color })}
          onclick={() => {
            settings.update("accent", color);
            settings.update("accentAuto", false);
          }}
        >
          {#if settings.accent === color && !settings.accentAuto}
            <Check size={13} strokeWidth={2.5} style="color: #fff" />
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <button class="row toggle-row" onclick={() => settings.update("accentAuto", !settings.accentAuto)}>
    <span class="label">{m.narrator_panel_match_document()}</span>
    <span class="toggle" class:on={settings.accentAuto}><span class="knob"></span></span>
  </button>

  <div class="section">{m.narrator_language()}</div>

  <!-- The interface language only: the voice reading the document stays as it is. Changing it reloads the page. -->
  <div class="seg lang" role="group" aria-label={m.narrator_language()}>
    {#each LANGUAGES as l (l.locale)}
      <button class:on={locale === l.locale} aria-pressed={locale === l.locale} lang={l.locale} onclick={() => setLocale(l.locale)}>
        {l.name}
      </button>
    {/each}
  </div>
</div>

<style>
  .panel {
    width: 286px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 10px 12px;
  }
  .section {
    font-family: var(--n-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--n-fg-3);
    padding: 8px 2px 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .label {
    font-size: 13px;
    color: var(--n-fg-1);
    white-space: nowrap;
  }
  .label em {
    font-style: normal;
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-3);
    margin-left: 4px;
  }
  .seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-1);
    border-radius: 10px;
  }
  .seg button {
    padding: 5px 9px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--n-fg-2);
    font-family: var(--n-font-sans);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms var(--n-ease-out);
  }
  .seg button.on {
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    box-shadow: var(--n-shadow-xs);
  }
  .seg.lang {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .seg button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .hint {
    margin: -2px 2px 2px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--n-fg-3);
  }
  .settings-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin: 0 2px;
    padding: 6px 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--n-brand-blue);
    text-decoration: none;
  }
  .settings-link:hover {
    text-decoration: underline;
  }
  .slider-row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    cursor: pointer;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--n-brand-blue);
  }
  .swatches {
    display: flex;
    gap: 8px;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 2px solid transparent;
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
  }
  .swatch.on {
    border-color: #fff;
  }
  .toggle-row {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .toggle {
    width: 36px;
    height: 21px;
    border-radius: 999px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
    position: relative;
    transition: all 200ms var(--n-ease-out);
    flex-shrink: 0;
  }
  .toggle.on {
    background: var(--n-brand-blue);
    border-color: var(--n-brand-blue);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 15px;
    height: 15px;
    border-radius: 999px;
    background: #fff;
    transition: transform 200ms var(--n-ease-out);
  }
  .toggle.on .knob {
    transform: translateX(15px);
  }
</style>
