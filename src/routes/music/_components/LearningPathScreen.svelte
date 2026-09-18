<script lang="ts">
  import Check from "lucide-svelte/icons/check";
  import Lock from "lucide-svelte/icons/lock";
  import type { Snippet } from "svelte";

  import type {
    LearningPath,
    LearningPathStepDefinition,
  } from "@repo/music-core/engines/learning-path";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import PracticeScreen from "./PracticeScreen.svelte";
  import PracticeScreenHeader from "./PracticeScreenHeader.svelte";

  // One screen for every learning path (Ear Training, Jazz, and the three
  // instrument progressions). Steps are cards that say what the step adds and
  // what done means, carry the mastery bar for the skills behind them, and open
  // one drill with its setup. A `next` step is badged Next and keeps the primary
  // action; a `locked` step shows the lock, reads muted and offers no way in.
  let {
    title,
    subtitle,
    path,
    controls,
    children,
    testId = "learning-path",
  }: {
    title: string;
    subtitle?: string;
    path: LearningPath<LearningPathStepDefinition>;
    controls?: Snippet;
    /** Content under the steps (e.g. the drills the path draws on). */
    children?: Snippet;
    testId?: string;
  } = $props();

  const STATUS_LABELS: Record<string, string> = {
    done: "Done",
    next: "Next",
    locked: "Locked",
    "in-progress": "In progress",
    "not-assessed": "Not assessed",
  };
  const statusLabel = (status: string) => STATUS_LABELS[status] ?? "Reference";
  const statusBadge = (status: string) =>
    status === "done" ? "default" : status === "in-progress" || status === "next" ? "secondary" : "outline";
</script>

<PracticeScreen>
  <PracticeScreenHeader {title} {subtitle} {controls} />

  <div class="flex flex-wrap items-center gap-3" data-testid="{testId}-progress">
    <Progress value={path.done} max={path.total} class="max-w-xs" />
    <span class="text-sm text-muted-foreground tabular-nums">{path.done} / {path.total} done</span>
    {#if path.next?.href}
      <Button href={path.next.href} size="lg" class="ml-auto" data-testid="{testId}-continue">
        Continue: step {path.next.order}
      </Button>
    {/if}
  </div>

  <ol class="grid gap-3" data-testid="{testId}-steps">
    {#each path.steps as step (step.id)}
      {@const isNext = path.next?.id === step.id}
      <li>
        <Card.Root
          data-step-status={step.status}
          data-step-next={isNext ? "true" : undefined}
          class={step.status === "locked"
            ? "border-dashed text-muted-foreground"
            : isNext
              ? "border-primary ring-4 ring-primary/15"
              : step.status === "done"
                ? "border-success/40"
                : ""}
        >
          <Card.Header class="flex-row flex-wrap items-start gap-4">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold
                {step.status === 'done'
                ? 'border-success bg-success text-success-foreground'
                : isNext
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'}"
              aria-hidden="true"
            >
              {#if step.status === "done"}
                <Check class="size-4" />
              {:else if step.status === "locked"}
                <Lock class="size-4" data-testid="{testId}-lock-{step.id}" />
              {:else}
                {step.order}
              {/if}
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <Card.Title class="font-display text-lg">{step.title}</Card.Title>
                <Badge variant={statusBadge(step.status)}>{statusLabel(step.status)}</Badge>
                {#if isNext && step.status !== "next"}
                  <Badge variant="secondary" class="text-primary">Continue here</Badge>
                {/if}
                {#if step.kind === "reference"}
                  <Badge variant="outline">Reference</Badge>
                {/if}
              </div>
              <p class="text-sm">{step.summary}</p>
              {#if step.detail}
                <p class="text-sm text-muted-foreground">Done when: {step.detail}</p>
              {/if}

              {#if step.skillIds?.length && step.status !== "not-assessed"}
                <div class="flex items-center gap-2 pt-1">
                  <Progress value={Math.round(step.mastery * 100)} max={100} class="max-w-[10rem]" />
                  <span class="text-xs text-muted-foreground tabular-nums">
                    {Math.round(step.mastery * 100)}% independent score
                  </span>
                </div>
              {/if}

              {#if step.instrumentNote}
                <p class="text-xs text-muted-foreground">{step.instrumentNote}</p>
              {/if}

              <div class="flex flex-wrap items-center gap-2 pt-1">
                {#each step.resources ?? [] as resource}
                  <Badge variant="outline">{resource}</Badge>
                {/each}
                {#if step.status !== "locked"}
                  {#each step.links ?? [] as link (link.href)}
                    <Button href={link.href} variant="link" size="sm" class="h-auto p-0">
                      {link.label}
                    </Button>
                  {/each}
                {/if}
              </div>
            </div>
            {#if step.status === "locked"}
              <Button
                aria-disabled="true"
                tabindex={0}
                variant="outline"
                size="lg"
                class="shrink-0 self-center text-muted-foreground max-sm:basis-full"
              >
                Locked
              </Button>
            {:else if step.href}
              <Button
                href={step.href}
                variant={isNext ? "default" : "outline"}
                size="lg"
                class="shrink-0 self-center max-sm:basis-full"
              >
                {step.kind === "reference" ? "Open" : "Practice"}
              </Button>
            {/if}
          </Card.Header>
        </Card.Root>
      </li>
    {/each}
  </ol>

  {#if children}
    {@render children()}
  {/if}
</PracticeScreen>
