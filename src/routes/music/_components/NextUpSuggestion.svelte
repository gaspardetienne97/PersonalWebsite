<script lang="ts">
  import ArrowRight from "lucide-svelte/icons/arrow-right";

  import type { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import type { DailyRoutineState } from "@repo/music-core/engines/daily-routine";
  import { buildSkillTreeView } from "@repo/music-core/engines/dashboard";
  import type { SkillGraphStore } from "@repo/music-core/engines/skills";
  import { Button } from "@repo/ui/button";

  // Post-drill dead-end fix: one coach suggestion after a NON-routine run —
  // the current weakest skill at its own drill (remediation, post-R5). The
  // page passes its own engine instances, which have already ingested the run
  // that just finished, so the pick reflects "after this run". When a routine
  // is active, RoutineContinueAction owns "next" and this renders nothing.
  let {
    skills,
    analytics,
    currentPath,
    routine,
  }: {
    skills: SkillGraphStore;
    analytics: AnalyticsEngine;
    /** The hosting drill's pathname — never suggest the drill just finished. */
    currentPath: string;
    routine?: DailyRoutineState;
  } = $props();

  // Computed once when the summary mounts (the engines aren't reactive).
  const pick = $derived.by(() => {
    if (routine?.status === "active" || routine?.status === "summary") return undefined;
    try {
      return buildSkillTreeView({ skills, analytics }).practiceNext.find(
        (candidate) => pathnameOf(candidate.href) !== currentPath,
      );
    } catch {
      return undefined;
    }
  });

  function pathnameOf(href: string): string {
    return href.split(/[?#]/, 1)[0] ?? href;
  }
</script>

{#if pick}
  <div
    data-testid="next-up"
    class="flex w-full flex-wrap items-center gap-3 rounded-md border p-3"
  >
    <div class="min-w-0 flex-1">
      <p class="eyebrow">Next up</p>
      <p class="font-semibold">{pick.skillName}</p>
      <p class="text-xs text-muted-foreground">
        Your weakest spot right now · {Math.round(pick.accuracy * 100)}% accuracy
      </p>
    </div>
    <Button href={pick.href} variant="outline">
      Practice it
      <ArrowRight class="size-4" aria-hidden="true" />
    </Button>
  </div>
{/if}
