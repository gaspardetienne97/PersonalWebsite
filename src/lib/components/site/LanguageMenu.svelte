<!--
  The site's language picker. Each language is named in itself, so anyone can
  find their own. Choosing one stores it in Paraglide's cookie and reloads the
  page in that language; addresses stay the same.

  In the header it is a pill (the icon, the language's name from 1024px and its
  code under that, and a chevron) that opens a menu. With `named` the pill shows
  the name at every width (the footer on a phone has the room). With `rows` it is
  only the choices, as bounded options for the phone menu's sheet (Header styles
  them).
-->
<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Languages from "@lucide/svelte/icons/languages";
  import * as DropdownMenu from "@repo/ui/dropdown-menu";
  import { m } from "@repo/i18n/messages.js";
  import { getLocale, locales, setLocale, type Locale } from "@repo/i18n/runtime.js";

  let { rows = false, named = false }: { rows?: boolean; named?: boolean } = $props();

  const names: Record<Locale, string> = {
    en: "English",
    es: "Español",
    fr: "Français",
    ht: "Kreyòl ayisyen",
  };

  const current = getLocale();
  const choose = (value: string) => {
    if (value !== current) setLocale(value as Locale);
  };
</script>

<!-- The current language carries a check mark and heavier type. -->
{#snippet choices(group: string, item: string, check: string)}
  <DropdownMenu.RadioGroup value={current} onValueChange={choose} class={group}>
    {#each locales as locale (locale)}
      <DropdownMenu.PlainRadioItem value={locale} class={item} lang={locale}>
        {#snippet children({ checked })}
          <span class={check}>
            {#if checked}<Check aria-hidden="true" />{/if}
          </span>
          {names[locale]}
        {/snippet}
      </DropdownMenu.PlainRadioItem>
    {/each}
  </DropdownMenu.RadioGroup>
{/snippet}

{#if rows}
  <DropdownMenu.Group class="site-menu-group">
    <DropdownMenu.GroupHeading class="site-menu-heading">
      <Languages aria-hidden="true" />{m.language_label()}
    </DropdownMenu.GroupHeading>
    {@render choices("site-menu-options", "site-menu-option", "site-menu-check")}
  </DropdownMenu.Group>
{:else}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="gm-icon-btn language-button {named ? 'named' : ''}"
      aria-label="{m.language_label()}: {names[current]}"
      title={m.language_label()}
    >
      <Languages aria-hidden="true" />
      <span class="language-name" aria-hidden="true">{names[current]}</span>
      <span class="language-code" aria-hidden="true">{current}</span>
      <ChevronDown class="language-chevron" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="min-w-48" preventScroll={false}>
      <DropdownMenu.Label>{m.language_label()}</DropdownMenu.Label>
      {@render choices("language-choices", "language-choice", "language-check")}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}

<style>
  /* The trigger is a pill: the full name where there is room, the code where not. */
  :global(.language-button) {
    border-radius: 999px;
    padding-inline: 0.85rem 0.7rem;
  }
  /* Beside the theme control it keeps that control's height. */
  @media (pointer: coarse), (width < 860px) {
    :global(.language-button) {
      height: 3rem;
    }
  }
  .language-name {
    display: none;
  }
  .language-code {
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  @media (width >= 1024px) {
    .language-name {
      display: inline;
    }
    .language-code {
      display: none;
    }
  }
  :global(.language-button.named) .language-name {
    display: inline;
  }
  :global(.language-button.named) .language-code {
    display: none;
  }
  :global(.language-button .language-chevron) {
    width: 1rem;
    height: 1rem;
    color: var(--muted-foreground);
    transition: transform 0.15s;
  }
  :global(.language-button[data-state="open"] .language-chevron) {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.language-button .language-chevron) {
      transition: none;
    }
  }
  /* Menu items are portalled out of this component, hence :global. */
  :global(.language-choice) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0.25rem 0.75rem 0.25rem 0.5rem;
    border-radius: calc(var(--radius) - 4px);
    font-size: 0.95rem;
    cursor: default;
    user-select: none;
    outline: none;
  }
  /* Under the pointer or the keyboard a row is tinted and edged, plainly. */
  :global(.language-choice[data-highlighted]) {
    background: color-mix(in oklab, var(--foreground) 12%, transparent);
    color: var(--foreground);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 28%, transparent);
  }
  :global(.language-choice[data-state="checked"]) {
    font-weight: 650;
  }
  :global(.language-check) {
    display: grid;
    place-items: center;
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
  }
  :global(.language-check svg) {
    width: 1.1rem;
    height: 1.1rem;
    stroke-width: 2.5;
  }
</style>
