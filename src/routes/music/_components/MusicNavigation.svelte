<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import BookOpen from "lucide-svelte/icons/book-open";
  import ChartNoAxesColumnIncreasing from "lucide-svelte/icons/chart-no-axes-column-increasing";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import CircleUser from "lucide-svelte/icons/circle-user";
  import Disc from "lucide-svelte/icons/disc";
  import Drum from "lucide-svelte/icons/drum";
  import Ear from "lucide-svelte/icons/ear";
  import FlaskConical from "lucide-svelte/icons/flask-conical";
  import House from "lucide-svelte/icons/house";
  import Library from "lucide-svelte/icons/library";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Music from "lucide-svelte/icons/music";
  import NotebookPen from "lucide-svelte/icons/notebook-pen";
  import Play from "lucide-svelte/icons/play";
  import Plug from "lucide-svelte/icons/plug";
  import Settings from "lucide-svelte/icons/settings";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import Upload from "lucide-svelte/icons/upload";
  import WandSparkles from "lucide-svelte/icons/wand-sparkles";
  import Grid3x3 from "lucide-svelte/icons/grid-3x3";

  import { cn } from "@repo/ui/utils";

  let { currentPath }: { currentPath: string } = $props();

  type NavItem = {
    label: string;
    href: string;
    icon: typeof IconType;
    badge?: string;
  };
  type NavGroup = { label?: string; items: NavItem[] };

  const navGroups: NavGroup[] = [
    {
      items: [
        { label: "Home", href: "/music", icon: House },
        { label: "Connect", href: "/music/connect", icon: Plug, badge: "soon" },
      ],
    },
    {
      label: "Learn",
      items: [
        { label: "Chord Library", href: "/music/learn/theory", icon: Library },
        { label: "Ear Training", href: "/music/learn/ear", icon: Ear },
        { label: "Note Reading", href: "/music/learn/reading", icon: BookOpen },
        { label: "Rhythm", href: "/music/learn/rhythm", icon: Drum },
        {
          label: "Scales & Drills",
          href: "/music/play/scales",
          icon: SlidersHorizontal,
        },
      ],
    },
    {
      label: "Play",
      items: [
        { label: "Practice Lab", href: "/music/play", icon: FlaskConical },
        { label: "Import & Play", href: "/music/import", icon: Upload },
        { label: "Jam / Improv", href: "/music/jam", icon: WandSparkles },
        { label: "Studio", href: "/music/studio", icon: Grid3x3 },
        { label: "Recording", href: "/music/recording", icon: Disc },
      ],
    },
    {
      label: "Track",
      items: [{ label: "Journal", href: "/music/track", icon: NotebookPen }],
    },
    {
      label: "Progress",
      items: [
        {
          label: "Skill Tree",
          href: "/music/progress",
          icon: ChartNoAxesColumnIncreasing,
        },
      ],
    },
  ];

  const mobileItems: NavItem[] = [
    { label: "Home", href: "/music", icon: House },
    { label: "Learn", href: "/music/learn", icon: BookOpen },
    { label: "Play", href: "/music/play", icon: Play },
    { label: "Track", href: "/music/track", icon: ListMusic },
    {
      label: "Progress",
      href: "/music/progress",
      icon: ChartNoAxesColumnIncreasing,
    },
  ];

  // Most specific match wins so a sub-route doesn't also light up a broader entry.
  const allHrefs = $derived(
    navGroups.flatMap((group) => group.items.map((item) => item.href)),
  );

  function isActive(href: string): boolean {
    if (href === "/music") return currentPath === href;
    if (!currentPath.startsWith(href)) return false;
    // Only active if no longer href also matches (more specific entry).
    return !allHrefs.some(
      (other) =>
        other !== href &&
        other.startsWith(href) &&
        currentPath.startsWith(other),
    );
  }

  function isMobileActive(href: string): boolean {
    return href === "/music"
      ? currentPath === href
      : currentPath.startsWith(href);
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
    <span class="text-[10px] uppercase tracking-widest text-muted-foreground"
      >cross-instrument</span
    >
  </div>
  <nav aria-label="Music sections" class="flex-1 overflow-y-auto py-3">
    {#each navGroups as group}
      {#if group.label}
        <div
          class="px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          {group.label}
        </div>
      {/if}
      <div class="grid gap-px px-2">
        {#each group.items as item}
          {@const Icon = item.icon}
          <a
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            class={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive(item.href) &&
                "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
            )}
          >
            <Icon class="size-4 shrink-0" aria-hidden="true" />
            <span class="truncate">{item.label}</span>
            {#if item.badge}
              <span
                class="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {item.badge}
              </span>
            {/if}
          </a>
        {/each}
      </div>
    {/each}
  </nav>

  <div class="mt-auto flex flex-col gap-2 border-t p-3">
    <a
      href="/music/settings"
      aria-current={currentPath.startsWith("/music/settings")
        ? "page"
        : undefined}
      class={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        currentPath.startsWith("/music/settings") &&
          "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
      )}
    >
      <Settings class="size-4 shrink-0" aria-hidden="true" />
      <span>Settings</span>
    </a>
    <div class="flex items-center gap-3 rounded-xl border bg-card p-2.5">
      <span
        class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <CircleUser class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold">Your practice</div>
        <div class="truncate text-[11px] text-muted-foreground">
          Local profile
        </div>
      </div>
      <ChevronDown
        class="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  </div>
</aside>

<!-- Mobile bottom tab bar -->
<nav
  aria-label="Music sections mobile"
  class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background md:hidden"
>
  {#each mobileItems as item}
    {@const Icon = item.icon}
    <a
      href={item.href}
      aria-current={isMobileActive(item.href) ? "page" : undefined}
      class={cn(
        "grid min-w-0 justify-items-center gap-1 px-1 py-2 text-xs text-muted-foreground",
        isMobileActive(item.href) && "font-medium text-foreground",
      )}
    >
      <Icon class="size-4" aria-hidden="true" />
      <span class="truncate">{item.label}</span>
    </a>
  {/each}
</nav>
