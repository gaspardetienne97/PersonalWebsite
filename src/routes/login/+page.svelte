<!--
  Sign-in, one state at a time: the invitation with its button, a notice when
  sign-in is unavailable, a calm note after a cancelled sign-in, or an alert after
  one that failed. Every state has something to press, and visitors who are not the
  owner get a way back out.
-->
<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { resolve } from "$app/paths";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Info from "@lucide/svelte/icons/info";
  import Lock from "@lucide/svelte/icons/lock";
  import * as Card from "@repo/ui/card";
  import { Button } from "@repo/ui/button";
  import CircuitPaths from "#lib/components/site/CircuitPaths.svelte";
  import type { Board } from "#lib/circuit/router.ts";
  import { name } from "#lib/config.ts";

  let { data, form } = $props();

  // Better Auth reports a failed sign-in with ?error=<code>. Backing out of the
  // sign-in is the visitor's choice, not a fault, so it gets a note and not an alert.
  const cancelled = $derived(!form?.message && data.error === "access_denied");
  const failure = $derived(
    form?.message ?? (data.error && !cancelled ? m.login_failed() : null),
  );

  // What signing in opens, by the name a visitor knows it by.
  const lead = $derived(
    !data.returnTo || data.returnTo === "/private"
      ? m.login_lead_private()
      : m.login_lead_page({
          page:
            data.returnTo === "/music" || data.returnTo.startsWith("/music/")
              ? "Woodshed"
              : data.returnTo,
        }),
  );

  // The two traces that run from the board, through the card's edges, to the
  // button. They light when the button is under the pointer or the keyboard.
  const pin = (color: string, points: [number, number][]): Board => ({
    width: 104,
    height: 40,
    chains: [{ points: points.map(([x, y]) => ({ x, y })), color, start: 0, steps: 1, branch: false }],
    junctions: [],
    ends: [],
    depth: 1,
  });
  const pins = [
    { side: "left", board: pin("var(--pin)", [[104, 20], [56, 20], [44, 8], [6, 8]]) },
    { side: "right", board: pin("var(--pin)", [[0, 20], [48, 20], [60, 32], [98, 32]]) },
  ];
</script>

<svelte:head>
  <title>{m.login_title()} | {name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page signin">
  <Card.Root class="signin-card w-full max-w-md">
    <Card.Header class="items-start gap-4">
      <span class="lock" aria-hidden="true"><Lock /></span>
      <Card.Title level={1} class="text-3xl">{m.login_title()}</Card.Title>
      <!-- What happened comes first, straight under the title. -->
      {#if cancelled}
        <div class="notice info" role="status">
          <Info aria-hidden="true" />
          <p><strong>{m.login_cancelled()}</strong> {m.login_cancelled_next()}</p>
        </div>
      {:else if failure}
        <p class="notice error" role="alert">
          <CircleAlert aria-hidden="true" /><span>{failure}</span>
        </p>
      {:else if !data.available}
        <p class="notice" role="status">
          <Info aria-hidden="true" /><strong>{m.login_unavailable()}</strong>
        </p>
      {/if}
      <Card.Description class="lead text-base text-foreground">
        {data.available ? lead : m.login_body()}
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4 text-base">
      {#if data.available}
        <form method="post" class="go">
          {#each pins as { side, board } (side)}
            <span class="pin {side}" aria-hidden="true"><CircuitPaths {board} /></span>
          {/each}
          <!-- The button keeps its full colour under the pointer: the traces are the answer. -->
          <Button type="submit" class="h-12 w-full px-4 text-base hover:bg-primary">
            {cancelled || failure ? m.login_try_again() : m.login_continue()}
          </Button>
          <p class="helper">{m.login_helper()}</p>
        </form>
      {/if}
      <!-- The way out. A phone has the rest of the site behind its menu button, so
           the card names two open parts there too. -->
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
        <li class="phone"><a class="gm-link" href={resolve("/studio")}>{m.nav_studio()}</a></li>
        <li class="phone"><a class="gm-link" href={resolve("/blog")}>{m.nav_writing()}</a></li>
      </ul>
    </Card.Content>
  </Card.Root>
</div>

<style>
  /* The card has the first screen to itself: the footer starts below the fold. On a
     phone it sits in the upper part of the screen, where the thumb finds the button. */
  .signin {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    place-items: start center;
    min-height: calc(100svh - 4rem);
    padding-block: clamp(1.5rem, 7svh, 4rem) 2rem;
  }
  @media (width >= 640px) {
    .signin {
      place-items: center;
      padding-block: 2rem;
    }
  }
  .lock {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--muted);
  }
  .lock :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
  }
  :global(.signin-card .lead) {
    line-height: 1.5;
    text-wrap: pretty;
  }
  .notice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    padding: 0.8rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--muted);
    line-height: 1.5;
    text-wrap: pretty;
  }
  .notice :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.15rem;
  }
  .notice strong {
    font-weight: 650;
  }
  .notice.info strong {
    display: block;
  }
  .notice.info {
    border-color: color-mix(in oklab, var(--gm-blue) 55%, transparent);
    background: color-mix(in oklab, var(--gm-blue) 9%, var(--card));
  }
  .notice.info :global(svg) {
    color: var(--gm-blue);
  }
  .notice.error {
    border-color: color-mix(in oklab, var(--destructive) 55%, transparent);
    background: color-mix(in oklab, var(--destructive) 10%, var(--card));
    font-weight: 550;
  }
  .notice.error :global(svg) {
    color: var(--destructive);
  }

  /* The button, wired to the board: a trace comes in through each edge of the card
     and stops at the button. Quiet at rest, lit while the button is under the
     pointer or the keyboard. */
  .go {
    position: relative;
  }
  .helper {
    margin-top: 0.6rem;
    font-size: 0.9375rem;
    line-height: 1.45;
    color: var(--muted-foreground);
    text-wrap: pretty;
  }
  /* A phone has no room beside the card, and no pointer to answer. */
  .pin {
    display: none;
  }
  @media (width >= 640px) {
    .pin {
      display: block;
    }
  }
  .pin {
    --pin: color-mix(in oklab, var(--foreground) 22%, var(--background));
    position: absolute;
    top: 0.25rem;
    width: 6.5rem;
    height: 2.5rem;
    pointer-events: none;
  }
  .pin.left {
    right: 100%;
  }
  .pin.right {
    left: 100%;
  }
  .pin :global(path),
  .pin :global(circle) {
    transition:
      stroke 0.2s,
      fill 0.2s;
  }
  .go:has(:global(button:hover), :global(button:focus-visible)) .pin {
    filter: drop-shadow(0 0 5px var(--pin));
  }
  .go:has(:global(button:hover), :global(button:focus-visible)) .pin.left {
    --pin: var(--gm-red);
  }
  .go:has(:global(button:hover), :global(button:focus-visible)) .pin.right {
    --pin: var(--gm-blue);
  }
  .go:has(:global(button:hover), :global(button:focus-visible)) .pin :global(.via) {
    fill: var(--pin);
  }
  @media (prefers-reduced-motion: reduce) {
    .pin :global(path),
    .pin :global(circle) {
      transition: none;
    }
  }

  .elsewhere {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 1.5rem;
  }
  .elsewhere .gm-link {
    min-height: 2.75rem;
  }
  @media (width >= 640px) {
    .elsewhere .phone {
      display: none;
    }
  }
</style>
