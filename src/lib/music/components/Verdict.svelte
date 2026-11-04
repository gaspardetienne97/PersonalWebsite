<script lang="ts" module>
  export type VerdictKind = "ontime" | "early" | "late" | "miss" | "wrong" | "right";
  /** The word each verdict reads when the drill passes no `text`. */
  export const VERDICT_WORD: Record<VerdictKind, string> = { ontime: "On time", early: "Early", late: "Late", miss: "Missed", wrong: "Wrong note", right: "Right" };
</script>

<script lang="ts">
  // The word for one note as it lands ("On time", "Late 40 ms", "Wanted G, heard A"),
  // with an icon so colour is never the only cue. It pops in, then fades; a new
  // `key` shows the next one. Drills place it at the stage's now-line or over the
  // instrument, and pass only what the input measured (no timing word when timing
  // is not measured).
  import Check from "lucide-svelte/icons/check";
  import X from "lucide-svelte/icons/x";
  import ChevronsLeft from "lucide-svelte/icons/chevrons-left";
  import ChevronsRight from "lucide-svelte/icons/chevrons-right";
  import { FLASH_MS } from "./feedback.svelte";

  let { kind, text, key, class: cls = "" }: { kind?: VerdictKind | null; text?: string; key: number; class?: string } = $props();

  let shown = $state(false);
  $effect(() => {
    void key;
    if (!kind) return;
    shown = true;
    const t = setTimeout(() => (shown = false), FLASH_MS * 3);
    return () => clearTimeout(t);
  });

  const tone = $derived(
    kind === "ontime" || kind === "right" ? "bg-success text-success-foreground" : kind === "early" || kind === "late" ? "bg-warn text-warn-foreground" : "bg-destructive text-white",
  );
  const Icon = $derived(kind === "early" ? ChevronsLeft : kind === "late" ? ChevronsRight : kind === "ontime" || kind === "right" ? Check : X);
</script>

<div class="pointer-events-none {cls}" aria-live="polite" data-testid="verdict">
  {#if kind}
    {#key key}
      <!-- The fade sits on a wrapper: the pop's fill would hold the word at full opacity. -->
      <span class="inline-block {shown ? '' : 'opacity-0 transition-opacity duration-300'}">
        <span class="ws-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm font-semibold shadow-sm {tone}" data-kind={kind}>
          <Icon class="size-4" strokeWidth={3} aria-hidden="true" />{text ?? VERDICT_WORD[kind]}
        </span>
      </span>
    {/key}
  {/if}
</div>
