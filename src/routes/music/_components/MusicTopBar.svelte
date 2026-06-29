<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import Flame from "lucide-svelte/icons/flame";
  import Search from "lucide-svelte/icons/search";
  import Zap from "lucide-svelte/icons/zap";

  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { PracticeStore } from "@repo/music-core/engines/store";

  let { onSearch }: { onSearch: () => void } = $props();

  let xp = $state(0);
  let streak = $state(0);
  let level = $state(1);

  const progress = browser ? new ProgressEngine(new PracticeStore()) : undefined;

  async function refresh(): Promise<void> {
    if (!progress) return;
    await progress.load();
    const state = progress.state;
    xp = state.xp;
    streak = state.streakDays;
    level = state.level;
  }

  void refresh();
  // Re-read after each navigation so finishing a drill updates the chip on return.
  afterNavigate(() => void refresh());
</script>

<div
  class="sticky top-12 z-30 flex h-11 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur"
>
  <button
    type="button"
    onclick={onSearch}
    class="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  >
    <Search class="size-3.5" aria-hidden="true" />
    <span>Search</span>
    <kbd class="rounded border bg-background px-1 font-mono text-[10px]">⌘K</kbd>
  </button>

  <div class="flex items-center gap-3 text-xs font-medium" aria-label="Your progress">
    <span class="flex items-center gap-1" title="Day streak">
      <Flame class="size-3.5 text-warn" aria-hidden="true" />
      <span class="tabular-nums">{streak}</span>
    </span>
    <span class="flex items-center gap-1" title="Total XP">
      <Zap class="size-3.5 text-info" aria-hidden="true" />
      <span class="tabular-nums">{xp}</span>
    </span>
    <span class="text-muted-foreground">
      Lv <span class="tabular-nums text-foreground">{level}</span>
    </span>
  </div>
</div>
