<!--
  The site's error page, drawn inside the root layout (header and footer included)
  for a missing address or a page that failed to load, in any section.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { Button } from "@repo/ui/button";
  import { name, nav } from "#lib/config.ts";
  import { m } from "@repo/i18n/messages.js";

  const missing = $derived(page.status === 404);
  const title = $derived(missing ? m.error_not_found_title() : m.error_other_title());
</script>

<svelte:head>
  <title>{title} | {name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page error">
  <p class="status">{m.error_status({ status: page.status })}</p>
  <h1 class="gm-title">{title}</h1>
  <p class="gm-lede">{missing ? m.error_not_found_body() : m.error_other_body()}</p>
  <ul class="links">
    {#each nav as link, i (link.href)}
      <li>
        <Button variant={i === 0 ? "default" : "outline"} href={resolve(link.href)}>
          {link.label}
        </Button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .error {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding-top: clamp(3rem, 8vw, 6rem);
  }
  .status {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1rem;
  }
</style>
