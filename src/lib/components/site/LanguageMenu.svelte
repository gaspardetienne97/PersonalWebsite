<!--
  The site's language picker. Each language is named in itself, so anyone can
  find their own. Choosing one stores it in Paraglide's cookie and reloads the
  page in that language; addresses stay the same.

  In the header it is a button (the icon and the current code) that opens a menu.
  With `rows` it is only the choices, for use inside the phone menu's panel.
-->
<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Languages from "@lucide/svelte/icons/languages";
  import * as DropdownMenu from "@repo/ui/dropdown-menu";
  import { buttonVariants } from "@repo/ui/button";
  import { m } from "@repo/i18n/messages.js";
  import { getLocale, locales, setLocale, type Locale } from "@repo/i18n/runtime.js";

  let { rows = false }: { rows?: boolean } = $props();

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
{#snippet choices()}
  <DropdownMenu.RadioGroup value={current} onValueChange={choose} class="language-choices">
    {#each locales as locale (locale)}
      <DropdownMenu.PlainRadioItem value={locale} class="language-choice" lang={locale}>
        {#snippet children({ checked })}
          <span class="language-check">
            {#if checked}<Check aria-hidden="true" />{/if}
          </span>
          {names[locale]}
        {/snippet}
      </DropdownMenu.PlainRadioItem>
    {/each}
  </DropdownMenu.RadioGroup>
{/snippet}

{#if rows}
  <DropdownMenu.Group class="language-rows">
    <DropdownMenu.GroupHeading class="language-heading">
      <Languages aria-hidden="true" />{m.language_label()}
    </DropdownMenu.GroupHeading>
    {@render choices()}
  </DropdownMenu.Group>
{:else}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="{buttonVariants({ variant: 'ghost' })} h-11 gap-1.5 px-3 data-[state=open]:bg-accent"
      aria-label="{m.language_label()}: {names[current]}"
      title={m.language_label()}
    >
      <Languages aria-hidden="true" />
      <span class="language-code" aria-hidden="true">{current}</span>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="min-w-48" preventScroll={false}>
      <DropdownMenu.Label>{m.language_label()}</DropdownMenu.Label>
      {@render choices()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}

<style>
  .language-code {
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
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
  :global(.language-choice[data-highlighted]) {
    background: var(--accent);
    color: var(--accent-foreground);
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

  /* Inside the phone panel: a heading, then the four languages two to a row. */
  :global(.language-heading) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0.5rem 0.4rem;
    font-size: 0.9rem;
    font-weight: 650;
    color: var(--muted-foreground);
  }
  :global(.language-heading svg) {
    width: 1.25rem;
    height: 1.25rem;
  }
  :global(.language-rows .language-choices) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 0.5rem;
  }
  :global(.language-rows .language-choice) {
    min-height: 3rem;
    font-size: 1.05rem;
  }
</style>
