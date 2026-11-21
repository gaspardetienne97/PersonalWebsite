<!--
  Sign-in, one state at a time: the invitation with its button, a warning when
  sign-in is unavailable, a calm note after a cancelled sign-in, or an alert after
  one that failed. A notice takes the place of the opening paragraph, so it sits
  right over the thing to press. Every state has one way back out, "Back to home",
  at every width: the header carries the rest of the site.
-->
<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { resolve } from "$app/paths";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import CornerDownRight from "@lucide/svelte/icons/corner-down-right";
  import Info from "@lucide/svelte/icons/info";
  import Lock from "@lucide/svelte/icons/lock";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
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

  // Where signing in leads, by the name a visitor knows it by: the private area
  // unless another page sent the visitor here.
  const destination = $derived(
    !data.returnTo || data.returnTo === "/private"
      ? null
      : data.returnTo === "/music" || data.returnTo.startsWith("/music/")
        ? "Woodshed"
        : data.returnTo,
  );
  const lead = $derived(
    destination ? m.login_lead_page({ page: destination }) : m.login_lead_private(),
  );
  // Said only when a page sent the visitor here, never on a plain visit to this page.
  const from = $derived(
    !data.returnTo
      ? null
      : destination
        ? m.login_from_page({ page: destination })
        : m.login_from_private(),
  );
  const helper = $derived(
    destination ? m.login_helper_page({ page: destination }) : m.login_helper_private(),
  );
  const noticed = $derived(cancelled || !!failure || !data.available);

  // The two traces that leave the button through the card's edges, like a part's
  // leads. They light while the button is under the pointer, the keyboard or a press.
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
        <div class="notice warning" role="status">
          <TriangleAlert aria-hidden="true" />
          <p><strong>{m.login_unavailable()}</strong> {m.login_unavailable_next()}</p>
        </div>
      {/if}
      {#if !noticed}
        <Card.Description class="lead text-base text-foreground">{lead}</Card.Description>
      {/if}
    </Card.Header>
    <Card.Content class="flex flex-col gap-4 text-base">
      {#if data.available}
        <form method="post" class="go">
          {#if from && !noticed}
            <p class="from"><CornerDownRight aria-hidden="true" />{from}</p>
          {/if}
          <div class="wired">
            {#each pins as { side, board } (side)}
              <span class="pin {side}" aria-hidden="true"><CircuitPaths {board} /></span>
            {/each}
            <!-- The button keeps its full colour under the pointer: the traces are the answer. -->
            <Button type="submit" class="h-12 w-full px-4 text-base hover:bg-primary">
              {cancelled || failure ? m.login_try_again() : m.login_continue()}
            </Button>
          </div>
          <p class="helper">{helper}</p>
        </form>
      {/if}
      <!-- The one way out: the main button when there is nothing else to press. -->
      <p>
        <Button
          href={resolve("/")}
          variant={data.available ? "outline" : "default"}
          class="h-11 px-4 text-base"
        >
          <ArrowLeft aria-hidden="true" />{m.login_home()}
        </Button>
      </p>
    </Card.Content>
  </Card.Root>
</div>

<style>
  /* The card has the first screen to itself: the footer starts below the fold. It
     sits a little above the middle at every width, two parts of the spare room over
     it and three under, so a phone has neither a card pinned to the top over an
     empty half nor a button pushed low. */
  .signin {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(1.5rem, 2fr) auto minmax(2rem, 3fr);
    justify-items: center;
    min-height: calc(100svh - var(--gm-header-h, 4rem));
  }
  :global(.signin > .signin-card) {
    grid-row: 2;
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
  .notice:is(.info, .warning) strong {
    display: block;
  }
  /* The warning: an amber edge and tint, and its own icon. */
  .notice.warning {
    border-color: color-mix(in oklab, var(--gm-yellow) 75%, var(--foreground));
    background: color-mix(in oklab, var(--gm-yellow) 14%, var(--card));
  }
  .notice.warning :global(svg) {
    color: color-mix(in oklab, var(--gm-yellow) 62%, var(--foreground));
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

  /* Why the visitor is here, when a page sent them: one line over the button. */
  .from {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.4;
    text-wrap: pretty;
  }
  .from :global(svg) {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    margin-top: 0.1rem;
    color: var(--muted-foreground);
  }
  /* The button and its two leads: a trace leaves each side of the button, crosses
     the card's edge and ends in a pad beside it. On a phone there is no room beside
     the card, so each runs to the edge of the screen. Quiet at rest, lit while the
     button is under the pointer, the keyboard or a press. */
  .wired {
    position: relative;
  }
  .helper {
    margin-top: 0.6rem;
    font-size: 0.9375rem;
    line-height: 1.45;
    color: var(--muted-foreground);
    text-wrap: pretty;
  }
  .pin {
    --pin: color-mix(in oklab, var(--foreground) 30%, var(--background));
    position: absolute;
    top: 0.25rem;
    /* The card's padding plus the page's gutter: from the button to the screen's edge. */
    width: calc(1.5rem + clamp(1rem, 4vw, 3rem));
    height: 2.5rem;
    pointer-events: none;
  }
  @media (width >= 640px) {
    .pin {
      width: 6.5rem;
    }
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
  .wired:has(:global(button:is(:hover, :focus-visible, :active))) .pin {
    filter: drop-shadow(0 0 3px var(--pin));
  }
  .wired:has(:global(button:is(:hover, :focus-visible, :active))) .pin.left {
    --pin: var(--gm-red);
  }
  .wired:has(:global(button:is(:hover, :focus-visible, :active))) .pin.right {
    --pin: var(--gm-blue);
  }
  .wired:has(:global(button:is(:hover, :focus-visible, :active))) .pin :global(.via) {
    fill: var(--pin);
  }
  @media (prefers-reduced-motion: reduce) {
    .pin :global(path),
    .pin :global(circle) {
      transition: none;
    }
    .wired:has(:global(button:is(:hover, :focus-visible, :active))) .pin {
      filter: none;
    }
  }
</style>
