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
    runtime: runtimeProp,
    focus = true,
    startPending = false,
    setup,
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
    /** Shared runtime for focus mode; resolved from context when omitted. */
    runtime?: MusicRuntime;
    /** A shell nested inside another shell's stage passes false. */
    focus?: boolean;
    /** Renders the setup region disabled while a start settles (preflight only). */
    startPending?: boolean;
    setup?: Snippet;
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
</script>

{#if focus}
  <DrillFocusScope active={phase === "stage"} {runtime} />
{/if}

<!-- #key replays the shared entrance and rebinds route-owned focus refs on phase changes. -->
{#key phase}
  <div class="reveal-up">
    {#if phase === "summary"}
      <div class={cn("space-y-4", cls)}>
        {#if summary}{@render summary()}{/if}
      </div>
    {:else if phase === "stage"}
      <div class={cn("grid gap-6", rail ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : "", cls)}>
        <div class="min-w-0 space-y-4">
          {#if stageAction}
            <div class="flex flex-wrap items-center justify-end gap-2">{@render stageAction()}</div>
          {/if}
          {#if stage}{@render stage()}{/if}
          {#if feedback}{@render feedback()}{/if}
          {#if children}{@render children()}{/if}
        </div>
        {#if rail}
          <aside class="grid content-start gap-4">{@render rail()}</aside>
        {/if}
      </div>
    {:else}
      <fieldset disabled={startPending} class={cn("m-0 min-w-0 border-0 p-0 disabled:opacity-70", cls)}>
        {#if setup}{@render setup()}{/if}
      </fieldset>
    {/if}
  </div>
{/key}
