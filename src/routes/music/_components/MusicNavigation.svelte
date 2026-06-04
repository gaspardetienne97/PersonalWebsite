<script lang="ts">
  import BookOpen from "lucide-svelte/icons/book-open";
  import ChartNoAxesColumnIncreasing from "lucide-svelte/icons/chart-no-axes-column-increasing";
  import House from "lucide-svelte/icons/house";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Play from "lucide-svelte/icons/play";

  import { cn } from "@repo/ui/utils";

  let { currentPath }: { currentPath: string } = $props();

  const items = [
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

  const isActive = (href: string) =>
    href === "/music" ? currentPath === href : currentPath.startsWith(href);
</script>

<aside class="hidden w-48 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
  <nav aria-label="Music sections" class="sticky top-12 grid gap-1 p-3">
    {#each items as item}
      {@const Icon = item.icon}
      <a
        href={item.href}
        aria-current={isActive(item.href) ? "page" : undefined}
        class={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        <Icon class="size-4" aria-hidden="true" />
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>
</aside>

<nav
  aria-label="Music sections mobile"
  class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background md:hidden"
>
  {#each items as item}
    {@const Icon = item.icon}
    <a
      href={item.href}
      aria-current={isActive(item.href) ? "page" : undefined}
      class={cn(
        "grid min-w-0 justify-items-center gap-1 px-1 py-2 text-xs text-muted-foreground",
        isActive(item.href) && "text-foreground",
      )}
    >
      <Icon class="size-4" aria-hidden="true" />
      <span class="truncate">{item.label}</span>
    </a>
  {/each}
</nav>
