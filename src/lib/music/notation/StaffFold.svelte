<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // A staff the player can fold away, so the lane and the keys share the screen. While a run is
  // live on a phone it starts folded (the lane above the keys carries the notes); the player's own
  // choice, once made, is kept on this device.
  import type { Snippet } from "svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";

  // `aside` shares the fold's row (the view switch, a setup toggle), so the staff starts one row higher.
  // `fold` starts it folded before a run too: a short stage where the lane, not the staff, shares the view with the keys.
  let { children, live = false, aside, fold = false }: { children: Snippet; live?: boolean; aside?: Snippet; fold?: boolean } = $props();
  const KEY = "woodshed.staff";
  let pref = $state<"shown" | "hidden" | null>(null);
  let narrow = $state(false);
  $effect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "shown" || v === "hidden") pref = v;
    } catch {
      /* no storage: the default holds */
    }
    const q = matchMedia("(max-width: 639px)");
    const set = () => (narrow = q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  });
  const shown = $derived(pref ? pref === "shown" : !(fold || (live && narrow)));
  function toggle() {
    pref = shown ? "hidden" : "shown";
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* kept for this page only */
    }
  }
</script>

<div class="mb-3">
  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" class:mb-1={!!aside}>
    <button type="button" class="-ml-1 flex min-h-11 max-sm:order-last items-center gap-1 px-1 text-sm font-medium text-ws-stage-soft hover:text-ws-stage-ink" aria-expanded={shown} onclick={toggle}>
      <ChevronRight class="size-4 transition-transform {shown ? 'rotate-90' : ''}" aria-hidden="true" />{shown ? m.music_shell_nt_staff() : m.music_shell_nt_staff_hidden()}
    </button>
    {#if aside}{@render aside()}{/if}
  </div>
  {#if shown}{@render children()}{/if}
</div>
