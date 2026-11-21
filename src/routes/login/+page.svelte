<!--
  Sign-in, one state at a time: the invitation with its button, a notice when this
  server has no sign-in, or an alert after a sign-in that failed. Every state has
  something to press, and visitors who are not the owner get a way back out.
-->
<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { resolve } from "$app/paths";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Info from "@lucide/svelte/icons/info";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Lock from "@lucide/svelte/icons/lock";
  import * as Card from "@repo/ui/card";
  import { Button } from "@repo/ui/button";
  import LogoMark from "#lib/components/site/LogoMark.svelte";
  import { name } from "#lib/config.ts";

  let { data, form } = $props();

  // Better Auth reports a failed sign-in with ?error=<code>.
  const errorText = (code: string) =>
    code === "access_denied" ? m.login_cancelled() : m.login_failed();
  const message = $derived(form?.message ?? (data.error ? errorText(data.error) : null));

  // The page signing in leads back to, by the name a visitor knows it by.
  const returnName = $derived(
    !data.returnTo
      ? null
      : data.returnTo === "/private"
        ? m.private_title()
        : data.returnTo === "/music" || data.returnTo.startsWith("/music/")
          ? "Woodshed"
          : data.returnTo,
  );
</script>

<svelte:head>
  <title>{m.login_title()} | {name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page signin">
  <Card.Root class="w-full max-w-md">
    <Card.Header class="items-start gap-4">
      <LogoMark size={40} />
      <Card.Title level={1} class="text-3xl">{m.login_title()}</Card.Title>
      {#if data.available && returnName}
        <p class="return"><Lock aria-hidden="true" />{m.login_return({ page: returnName })}</p>
      {/if}
      {#if data.available || message}
        <Card.Description class="text-base text-foreground">{m.login_body()}</Card.Description>
      {/if}
    </Card.Header>
    <Card.Content class="flex flex-col gap-5 text-base">
      {#if message}
        <p class="notice error" role="alert">
          <CircleAlert aria-hidden="true" /><span>{message}</span>
        </p>
      {:else if !data.available}
        <div class="notice" role="status">
          <Info aria-hidden="true" />
          <p><strong>{m.login_unavailable()}</strong> {m.login_body()}</p>
        </div>
      {/if}
      {#if data.available}
        <form method="post">
          <Button type="submit" class="h-auto min-h-12 w-full px-4 py-2 text-base whitespace-normal">
            <KeyRound data-icon="inline-start" aria-hidden="true" />
            {message ? m.login_try_again() : m.login_continue()}
          </Button>
        </form>
      {/if}
      <!-- The way out, and the parts of the site that are open. -->
      <ul class="elsewhere">
        <li>
          {#if data.available}
            <a class="gm-link" href={resolve("/")}><ArrowLeft aria-hidden="true" />{m.login_home()}</a>
          {:else}
            <Button href={resolve("/")} class="h-11 text-base">
              <ArrowLeft aria-hidden="true" />{m.login_home()}
            </Button>
          {/if}
        </li>
        <li><a class="gm-link" href={resolve("/studio")}>{m.nav_studio()}</a></li>
        <li><a class="gm-link" href={resolve("/blog")}>{m.nav_writing()}</a></li>
      </ul>
    </Card.Content>
  </Card.Root>
</div>

<style>
  /* The card has the first screen to itself: the footer starts below the fold. */
  .signin {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    min-height: calc(100svh - 4rem);
    padding-block: 2rem;
  }
  .return {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }
  .return :global(svg) {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
  }
  .notice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--muted);
    line-height: 1.5;
  }
  .notice :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.15rem;
  }
  .notice strong {
    display: block;
    font-weight: 650;
  }
  .notice.error {
    border-color: color-mix(in oklab, var(--destructive) 55%, transparent);
    background: color-mix(in oklab, var(--destructive) 10%, var(--card));
    font-weight: 550;
  }
  .notice.error :global(svg) {
    color: var(--destructive);
  }
  .elsewhere {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.5rem;
  }
  .elsewhere .gm-link {
    min-height: 2.75rem;
  }
</style>
