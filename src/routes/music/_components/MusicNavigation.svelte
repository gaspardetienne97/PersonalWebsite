<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import ChartNoAxesColumnIncreasing from "lucide-svelte/icons/chart-no-axes-column-increasing";
  import CircleHelp from "lucide-svelte/icons/circle-help";
  import Gauge from "lucide-svelte/icons/gauge";
  import Grid3x3 from "lucide-svelte/icons/grid-3x3";
  import Library from "lucide-svelte/icons/library";
  import PanelLeftClose from "lucide-svelte/icons/panel-left-close";
  import PanelLeftOpen from "lucide-svelte/icons/panel-left-open";
  import Play from "lucide-svelte/icons/play";
  import Plug from "lucide-svelte/icons/plug";
  import Settings from "lucide-svelte/icons/settings";

  import PracticeOsMark from "./PracticeOsMark.svelte";

  import { cn } from "@repo/ui/utils";

  let { currentPath }: { currentPath: string } = $props();

  type NavItem = {
    label: string;
    href: string;
    icon: typeof IconType;
    /** Exact path that activates this item (in addition to prefixes). */
    exact?: string;
    /** Sub-routes this hub owns; a drill under here lights up the hub. */
    prefixes: string[];
  };

  // Four intent-based hubs. Drills/songs/etc. live under sub-routes that each hub
  // "owns", so visiting a drill lights up its hub instead of a 30-item dump.
  const primary: NavItem[] = [
    {
      label: "Practice",
      href: "/music",
      icon: Play,
      exact: "/music",
      prefixes: ["/music/play", "/music/learn", "/music/jam"],
    },
    {
      label: "Library",
      href: "/music/library",
      icon: Library,
      prefixes: ["/music/library", "/music/songs"],
    },
    {
      label: "Create",
      href: "/music/create",
      icon: Grid3x3,
      prefixes: ["/music/create"],
    },
    {
      label: "Progress",
      href: "/music/progress",
      icon: ChartNoAxesColumnIncreasing,
      prefixes: ["/music/progress", "/music/track"],
    },
  ];

  const utilities: NavItem[] = [
    { label: "Connect", href: "/music/connect", icon: Plug, prefixes: ["/music/connect"] },
    {
      label: "Tuner",
      href: "/music/tuner",
      icon: Gauge,
      prefixes: ["/music/tuner"],
    },
    { label: "Settings", href: "/music/settings", icon: Settings, prefixes: ["/music/settings"] },
    { label: "Guide", href: "/music/guide", icon: CircleHelp, prefixes: ["/music/guide"] },
  ];

  function isActive(item: NavItem): boolean {
    if (item.exact && currentPath === item.exact) return true;
    return item.prefixes.some(
      (prefix) => currentPath === prefix || currentPath.startsWith(prefix + "/"),
    );
  }

  // Collapsed, the sidebar is an icon rail so a drill gets the width back. The
  // choice is a per-browser convenience, so it lives in localStorage.
  const COLLAPSED_KEY = "music.sidebar.collapsed";
  let collapsed = $state(readCollapsed());

  function readCollapsed(): boolean {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function toggleCollapsed(): void {
    collapsed = !collapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* private mode: the choice lasts for the session only */
    }
  }

  function linkClass(item: NavItem): string {
    return cn(
      "relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-sidebar-foreground/70",
      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      collapsed ? "justify-center px-0" : "px-3",
      isActive(item) && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
    );
  }
</script>

<!-- Desktop sidebar. The column stretches with the shell (so a short page keeps
     the footer in view); the sticky panel inside is at most one viewport tall,
     so on a long page the utilities sit at the bottom edge of the window. -->
<aside
  data-collapsed={collapsed ? "true" : undefined}
  class={cn(
    "relative hidden shrink-0 self-stretch border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 motion-reduce:transition-none md:block",
    collapsed ? "w-14" : "w-60",
  )}
>
<!-- Absolute, so the panel adds no height of its own: the column is exactly as
     tall as the page content, and the sticky panel is clamped to it. -->
<div class="absolute inset-0">
<div class="sticky top-12 flex h-[calc(100dvh-3rem)] max-h-full flex-col">
  <div class={cn("flex flex-col gap-0.5 border-b", collapsed ? "items-center px-0 py-4" : "p-4")}>
    <span class="flex items-center gap-2 font-display text-base font-bold tracking-tight">
      <PracticeOsMark />
      <span class={collapsed ? "sr-only" : ""}>Practice OS</span>
    </span>
    {#if !collapsed}
      <span class="eyebrow">cross-instrument</span>
    {/if}
  </div>

  <nav aria-label="Music sections" class="flex-1 overflow-y-auto py-3">
    <div class="grid gap-px px-2">
      {#each primary as item (item.href)}
        {@const Icon = item.icon}
        <a
          href={item.href}
          aria-current={isActive(item) ? "page" : undefined}
          title={collapsed ? item.label : undefined}
          class={linkClass(item)}
        >
          {#if isActive(item)}
            <!-- Active marker in the instrument hue (identity only). -->
            <span class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-instr" aria-hidden="true"></span>
          {/if}
          <Icon class="size-4 shrink-0" aria-hidden="true" />
          <span class={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
        </a>
      {/each}
    </div>
  </nav>

  <div class="mt-auto flex flex-col gap-px border-t p-2">
    {#each utilities as item (item.href)}
      {@const Icon = item.icon}
      <a
        href={item.href}
        aria-current={isActive(item) ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        class={linkClass(item)}
      >
        <Icon class="size-4 shrink-0" aria-hidden="true" />
        <span class={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
      </a>
    {/each}
    <button
      type="button"
      aria-pressed={collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      class={cn(
        "mt-1 flex min-h-10 items-center gap-3 rounded-lg py-2 text-xs font-medium text-sidebar-foreground/60",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "justify-center px-0" : "px-3",
      )}
      onclick={toggleCollapsed}
    >
      {#if collapsed}
        <PanelLeftOpen class="size-4 shrink-0" aria-hidden="true" />
      {:else}
        <PanelLeftClose class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate">Collapse</span>
      {/if}
    </button>
  </div>
</div>
</div>
</aside>

<!-- Mobile bottom tab bar -->
<nav
  aria-label="Music sections mobile"
  class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background md:hidden"
>
  {#each primary as item (item.href)}
    {@const Icon = item.icon}
    <a
      href={item.href}
      aria-current={isActive(item) ? "page" : undefined}
      class={cn(
        "grid min-w-0 justify-items-center gap-1 px-1 py-2 text-xs text-muted-foreground",
        isActive(item) && "font-medium text-foreground shadow-[inset_0_2px_0_var(--instr)]",
      )}
    >
      <Icon class="size-4" aria-hidden="true" />
      <span class="truncate">{item.label}</span>
    </a>
  {/each}
</nav>
