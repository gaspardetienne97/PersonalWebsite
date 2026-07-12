<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import ChartNoAxesColumnIncreasing from "lucide-svelte/icons/chart-no-axes-column-increasing";
  import CircleHelp from "lucide-svelte/icons/circle-help";
  import Gauge from "lucide-svelte/icons/gauge";
  import Grid3x3 from "lucide-svelte/icons/grid-3x3";
  import Library from "lucide-svelte/icons/library";
  import Music from "lucide-svelte/icons/music";
  import Play from "lucide-svelte/icons/play";
  import Plug from "lucide-svelte/icons/plug";
  import Settings from "lucide-svelte/icons/settings";

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
</script>

<!-- Desktop sidebar: sticky under the site header so the shell stays put while content scrolls -->
<aside
  class="sticky top-12 hidden h-[calc(100dvh-3rem)] w-60 shrink-0 flex-col self-start border-r bg-sidebar text-sidebar-foreground md:flex"
>
  <div class="flex flex-col gap-0.5 border-b p-4">
    <span class="flex items-center gap-2 text-base font-bold tracking-tight">
      <Music class="size-4 text-primary" aria-hidden="true" />
      Practice OS
    </span>
    <span class="eyebrow">cross-instrument</span>
  </div>

  <nav aria-label="Music sections" class="flex-1 overflow-y-auto py-3">
    <div class="grid gap-px px-2">
      {#each primary as item (item.href)}
        {@const Icon = item.icon}
        <a
          href={item.href}
          aria-current={isActive(item) ? "page" : undefined}
          class={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            isActive(item) && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
          )}
        >
          <Icon class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{item.label}</span>
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
        class={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive(item) && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
        )}
      >
        <Icon class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{item.label}</span>
      </a>
    {/each}
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
        isActive(item) && "font-medium text-foreground",
      )}
    >
      <Icon class="size-4" aria-hidden="true" />
      <span class="truncate">{item.label}</span>
    </a>
  {/each}
</nav>
