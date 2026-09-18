<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "@repo/ui/utils";

  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";
  import DrillFocusScope from "./DrillFocusScope.svelte";

  // Shared layout for the route-driven setup → stage → summary anatomy.
  // Layout only — routes own phase changes, lifecycle, scoring and heading
  // focus. The one runtime flag the shell sets is focus mode: while the phase
  // is "stage" the chrome yields to the drill, the same way on every route.
  let {
    phase,
    mode = "practice",
    runtime: runtimeProp,
    focus = true,
    startPending = false,
    setup,
    setupSummary,
    readyStage,
    stage,
    feedback,
    rail,
    stageAction,
    summary,
    children,
    class: cls = "",
  }: {
    /** Route-computed phase. The shell renders exactly this phase. */
    phase: "setup" | "stage" | "summary";
    /**
     * Stage mode. Route-owned like the phase; the shell only dresses it. Demo
     * gets a dashed frame and an eyebrow saying nothing is being scored.
     */
    mode?: "demo" | "practice" | "check";
    /** Shared runtime for focus mode; resolved from context when omitted. */
    runtime?: MusicRuntime;
    /** A shell nested inside another shell's stage passes false. */
    focus?: boolean;
    /**
     * Renders the setup region disabled while the route says the setup must not
     * change under it: a start settling (preflight) or a demonstration sounding.
     */
    startPending?: boolean;
    setup?: Snippet;
    /**
     * One-line summary of the remembered setup. When given, the setup controls
     * collapse behind an "Edit setup" toggle and the ready stage shows first.
     */
    setupSummary?: Snippet;
    /** The stage in its ready state (target visible, Start on it), shown under setup. */
    readyStage?: Snippet;
    stage?: Snippet;
    feedback?: Snippet;
    rail?: Snippet;
    /** Reserved slot at the end of the stage header row (e.g. mid-run Cancel). */
    stageAction?: Snippet;
    summary?: Snippet;
    children?: Snippet;
    class?: string;
  } = $props();

  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a shell mount
  const runtime = runtimeProp ?? useMusicRuntime();

  // Disclosure state for the collapsed setup; the route still owns the values.
  let setupOpen = $state(false);
  const setupControlsId = `drill-setup-${Math.random().toString(36).slice(2, 8)}`;
</script>

{#if focus}
  <DrillFocusScope active={phase === "stage"} {runtime} />
{/if}

<!-- Demo dresses whichever stage is on screen; every other mode renders it bare. -->
{#snippet staged(content: Snippet)}
  {#if mode === "demo"}
    <div
      data-testid="demo-frame"
      class="grid gap-2 rounded-2xl border border-dashed border-practice-accent/60 p-2"
    >
      <p class="eyebrow px-2">listening, not scored</p>
      {@render content()}
    </div>
  {:else}
    {@render content()}
  {/if}
{/snippet}

<!-- #key replays the shared entrance and rebinds route-owned focus refs on phase changes. -->
{#key phase}
  <div class="reveal-up" data-mode={mode}>
    {#if phase === "summary"}
      <div class={cn("space-y-4", cls)}>
        {#if summary}{@render summary()}{/if}
      </div>
    {:else if phase === "stage"}
      <!-- One column: the stage keeps the full width, stats follow underneath. -->
      <div class={cn("min-w-0 space-y-4", cls)}>
        {#if stageAction}
          <div class="flex flex-wrap items-center justify-end gap-2">{@render stageAction()}</div>
        {/if}
        {#if stage}{@render staged(stage)}{/if}
        {#if feedback}{@render feedback()}{/if}
        {#if children}{@render children()}{/if}
        {#if rail}
          <section class="grid gap-4" aria-label="Run details">{@render rail()}</section>
        {/if}
      </div>
    {:else}
      <div class={cn("min-w-0 space-y-4", cls)}>
        {#if setupSummary}
          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm"
          >
            <span class="eyebrow">Setup</span>
            <div class="min-w-0 font-medium">{@render setupSummary()}</div>
            <button
              type="button"
              class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={setupOpen}
              aria-controls={setupControlsId}
              onclick={() => (setupOpen = !setupOpen)}
            >
              {setupOpen ? "Hide setup" : "Edit setup"}
            </button>
          </div>
        {/if}
        {#if !setupSummary || setupOpen}
          <fieldset
            id={setupControlsId}
            disabled={startPending}
            class="m-0 min-w-0 border-0 p-0 disabled:opacity-70"
          >
            {#if setup}{@render setup()}{/if}
          </fieldset>
        {/if}
        {#if readyStage}{@render staged(readyStage)}{/if}
      </div>
    {/if}
  </div>
{/key}
