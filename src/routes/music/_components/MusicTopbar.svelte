<script lang="ts">
  import { browser } from "$app/environment";
  import Activity from "lucide-svelte/icons/activity";
  import Flame from "lucide-svelte/icons/flame";
  import Music2 from "lucide-svelte/icons/music-2";
  import Radio from "lucide-svelte/icons/radio";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Zap from "lucide-svelte/icons/zap";
  import { onDestroy } from "svelte";

  import type { InputRouterState } from "@repo/music-core/engines/input-router";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import { cn } from "@repo/ui/utils";

  import type { MusicRuntime } from "../_runtime.svelte";

  let { currentPath, runtime }: { currentPath: string; runtime: MusicRuntime } = $props();

  const progress = new ProgressEngine(browser ? new PracticeStore() : undefined);

  let xp = $state(0);
  let streakDays = $state(0);
  let level = $state(1);
  let lastInstrument = $state<string | undefined>();
  let inputState = $state<InputRouterState>({
    activeSource: "onscreen",
    confidence: 0.8,
  });

  const route = $derived(routeFor(currentPath));
  const inputLabel = $derived(labelForInput(inputState.activeSource));
  const confidence = $derived(Math.round(inputState.confidence * 100));
  const instrumentLabel = $derived(
    inputState.activeInstrument
      ? titleCase(inputState.activeInstrument)
      : lastInstrument
        ? titleCase(lastInstrument)
        : "Any instrument",
  );

  let unsubscribeRouter: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;

  $effect(() => {
    unsubscribeRouter?.();
    unsubscribeEvents?.();
    inputState = runtime.router.state;
    unsubscribeRouter = runtime.router.subscribeState((state) => {
      inputState = state;
    });
    unsubscribeEvents = runtime.router.subscribe((event) => {
      lastInstrument = event.instrument;
    });

    return () => {
      unsubscribeRouter?.();
      unsubscribeEvents?.();
      unsubscribeRouter = undefined;
      unsubscribeEvents = undefined;
    };
  });

  void loadProgress();

  async function loadProgress(): Promise<void> {
    await progress.load();
    const state = progress.state;
    xp = state.xp;
    streakDays = state.streakDays;
    level = state.level;
  }

  onDestroy(() => {
    unsubscribeRouter?.();
    unsubscribeEvents?.();
  });

  function routeFor(path: string): { title: string; description: string; section: string } {
    if (path.startsWith("/music/learn/ear")) {
      return {
        title: "Ear Training",
        description: "Recognize intervals and review weak spots.",
        section: "Learn",
      };
    }
    if (path.startsWith("/music/learn/reading")) {
      return {
        title: "Note Reading",
        description: "Read notation and answer with your instrument.",
        section: "Learn",
      };
    }
    if (path.startsWith("/music/learn/rhythm")) {
      return {
        title: "Rhythm Trainer",
        description: "Tap pulse, read timing, and tighten groove.",
        section: "Learn",
      };
    }
    if (path.startsWith("/music/learn/theory")) {
      return {
        title: "Theory Library",
        description: "Explore chords, scales, and voicings.",
        section: "Learn",
      };
    }
    if (path.startsWith("/music/learn")) {
      return {
        title: "Learn",
        description: "Choose a focused musicianship session.",
        section: "Learn",
      };
    }
    if (path.startsWith("/music/play/scales")) {
      return {
        title: "Scales & Technique",
        description: "Build accuracy, evenness, and tempo control.",
        section: "Play",
      };
    }
    if (path.startsWith("/music/play")) {
      return {
        title: "Play",
        description: "Practice instrument workflows and technique.",
        section: "Play",
      };
    }
    if (path.startsWith("/music/track")) {
      return {
        title: "Practice Journal",
        description: "Log sessions, notes, instruments, and routines.",
        section: "Track",
      };
    }
    if (path.startsWith("/music/progress")) {
      return {
        title: "Dashboard & Skill Tree",
        description: "Review XP, streaks, mastery, and practice-next picks.",
        section: "Progress",
      };
    }
    return {
      title: "Musicianship OS",
      description: "Connect instruments, route input, and run daily practice.",
      section: "Home",
    };
  }

  function labelForInput(source: InputRouterState["activeSource"]): string {
    if (source === "midi") return "MIDI";
    if (source === "audio") return "Audio";
    if (source === "onscreen") return "On-screen";
    return "Click";
  }

  function titleCase(value: string): string {
    return value
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ");
  }
</script>

<section
  aria-label="Music app status"
  class="sticky top-12 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
>
  <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{route.section}</Badge>
        <span class="text-xs text-muted-foreground">Practice OS</span>
      </div>
      <p
        data-testid="music-topbar-title"
        class="mt-1 truncate text-lg font-semibold tracking-tight text-foreground"
      >
        {route.title}
      </p>
      <p class="truncate text-sm text-muted-foreground">{route.description}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <div class="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Zap class="size-4 text-muted-foreground" aria-hidden="true" />
        <span class="font-medium tabular-nums">{xp.toLocaleString()} XP</span>
      </div>
      <div class="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Flame class="size-4 text-muted-foreground" aria-hidden="true" />
        <span class="font-medium tabular-nums">
          {streakDays} day{streakDays === 1 ? "" : "s"} streak
        </span>
      </div>
      <div class="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Activity class="size-4 text-muted-foreground" aria-hidden="true" />
        <span class="font-medium tabular-nums">Level {level}</span>
      </div>
    </div>
  </div>

  <div class="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
    <div class="flex min-w-0 items-center gap-3">
      <Volume2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p class="truncate text-sm text-muted-foreground" aria-live="polite">
        {runtime.audioMessage}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={runtime.audioEnabled || runtime.audioPending}
        onclick={() => runtime.enableAudio()}
      >
        {runtime.audioEnabled
          ? "Audio enabled"
          : runtime.audioPending
            ? "Enabling audio"
            : "Enable audio"}
      </Button>
    </div>

    <div
      role="group"
      aria-label="Input source"
      class="grid grid-cols-3 gap-1 rounded-md border bg-muted/40 p-1 sm:flex"
    >
      {#each ["midi", "audio", "onscreen"] as source}
        <span
          class={cn(
            "inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground",
            inputState.activeSource === source && "bg-background text-foreground shadow-sm",
          )}
          aria-current={inputState.activeSource === source ? "true" : undefined}
        >
          {#if source === "midi"}
            <Radio class="size-3.5" aria-hidden="true" />
          {:else if source === "audio"}
            <Volume2 class="size-3.5" aria-hidden="true" />
          {:else}
            <Music2 class="size-3.5" aria-hidden="true" />
          {/if}
          {labelForInput(source as InputRouterState["activeSource"])}
        </span>
      {/each}
      <span class="sr-only">{inputLabel} confidence {confidence}%</span>
    </div>

    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
      <span>{inputLabel}</span>
      <span aria-hidden="true">·</span>
      <span>{instrumentLabel}</span>
      <span aria-hidden="true">·</span>
      <span class="tabular-nums">{confidence}%</span>
    </div>
  </div>
</section>
