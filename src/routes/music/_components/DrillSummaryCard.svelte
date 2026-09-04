<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { cn } from "@repo/ui/utils";

  // Thin results frame shared by every drill's summary phase. It standardizes
  // the header/focus wiring and the footer action row; the whole body is a
  // snippet, so grade rows, session reviews, per-hand grids, and tempo ladders
  // all live inside the same frame without the card knowing their shape.
  //
  // Focus authority stays with the route: the card exposes `headingRef` via
  // bind: and never focuses itself. No lifecycle, scoring, or session state.
  let {
    heading,
    headingRef = $bindable(null),
    children,
    metric,
    actions,
    onChangeSetup,
    changeSetupLabel = "Change setup",
    lastRunDelta,
    routineContinue,
    nextUp,
    class: cls = "",
  }: {
    /** Results headline. Wrapped by the card in a focusable, non-self-focusing element. */
    heading: Snippet;
    /** Bindable ref to the focusable heading wrapper; the ROUTE calls .focus() on phase entry. */
    headingRef?: HTMLElement | null;
    /** The whole body — grade rows, session review, per-hand grid, tempo ladder, etc. */
    children: Snippet;
    /** The drill's primary number, rendered large before the body with the delta beside it. */
    metric?: Snippet;
    /** Footer action row (retry bar, tempo buttons, Repeat). */
    actions?: Snippet;
    /** Route-owned handler; renders the consistent "Change setup" action when present. */
    onChangeSetup?: () => void;
    changeSetupLabel?: string;
    /** Optional pass-throughs, given one consistent footer placement. */
    lastRunDelta?: Snippet;
    routineContinue?: Snippet;
    nextUp?: Snippet;
    class?: string;
  } = $props();

  // With a metric the delta sits beside it; otherwise it keeps its footer spot.
  const deltaInFooter = $derived(Boolean(lastRunDelta) && !metric);
  const hasFooter = $derived(
    Boolean(actions) || Boolean(onChangeSetup) || deltaInFooter || Boolean(routineContinue) || Boolean(nextUp),
  );
</script>

<Card.Root class={cn("overflow-hidden", cls)}>
  <Card.Header>
    <!-- Focusable so the route can move focus here on phase entry, but the card
         never self-focuses — the route owns focus authority. -->
    <div tabindex="-1" bind:this={headingRef} class="space-y-1 outline-none">
      {@render heading()}
    </div>
  </Card.Header>
  <Card.Content class="grid gap-4">
    {#if metric}
      <div data-testid="summary-metric" class="flex flex-wrap items-end gap-x-6 gap-y-2 font-display tracking-tight">
        {@render metric()}
        {#if lastRunDelta}{@render lastRunDelta()}{/if}
      </div>
    {/if}
    {@render children()}
  </Card.Content>
  {#if hasFooter}
    <Card.Footer class="flex-wrap gap-3">
      {#if deltaInFooter && lastRunDelta}{@render lastRunDelta()}{/if}
      {#if actions}{@render actions()}{/if}
      {#if onChangeSetup}
        <Button type="button" variant="ghost" onclick={onChangeSetup}>{changeSetupLabel}</Button>
      {/if}
      {#if routineContinue}{@render routineContinue()}{/if}
      {#if nextUp}{@render nextUp()}{/if}
    </Card.Footer>
  {/if}
</Card.Root>
