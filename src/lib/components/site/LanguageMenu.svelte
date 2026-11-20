<!--
  The site's language picker. Each language is named in itself, so anyone can
  find their own. Choosing one stores it in Paraglide's cookie and reloads the
  page in that language; addresses stay the same.
-->
<script lang="ts">
  import Languages from "@lucide/svelte/icons/languages";
  import * as DropdownMenu from "@repo/ui/dropdown-menu";
  import { buttonVariants } from "@repo/ui/button";
  import { m } from "@repo/i18n/messages.js";
  import { getLocale, locales, setLocale, type Locale } from "@repo/i18n/runtime.js";

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

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={buttonVariants({ variant: "ghost", size: "icon" })}
    aria-label="{m.language_label()}: {names[current]}"
    title={m.language_label()}
  >
    <Languages aria-hidden="true" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="min-w-44" preventScroll={false}>
    <DropdownMenu.Label>{m.language_label()}</DropdownMenu.Label>
    <DropdownMenu.RadioGroup value={current} onValueChange={choose}>
      {#each locales as locale (locale)}
        <DropdownMenu.RadioItem value={locale} class="min-h-10" lang={locale}>
          {names[locale]}
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
