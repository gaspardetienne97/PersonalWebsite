<script lang="ts">
  import { browser } from "$app/environment";
  import Check from "lucide-svelte/icons/check";

  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";
  import { buildJazzLessonPath } from "@repo/music-core/engines/jazz";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);

  let instrument = $state<InstrumentId>(
    VIEWABLE_INSTRUMENTS.includes(runtime.activeInstrument) ? runtime.activeInstrument : "piano",
  );
  let ready = $state(false);

  void skills.load().then(() => (ready = true));

  const path = $derived.by(() => {
    void ready;
    return buildJazzLessonPath({
      instrument,
      mastery: ready ? (id) => skills.getMastery(id).mastery : undefined,
    });
  });
  const done = $derived(path.filter((step) => step.status === "done").length);

  const statusBadge = (status: string) =>
    status === "done" ? "default" : status === "in-progress" ? "secondary" : "outline";
</script>

<svelte:head>
  <title>Jazz Path | Practice OS</title>
  <meta
    name="description"
    content="An ordered jazz-piano learning path that threads ear training, theory, voicings, the graded ii-V-I drill, and improv — tracked by real skill progress."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Jazz Path"
    subtitle="Learn it in order. Each step opens a real tool; progress comes from your actual practice."
  >
    {#snippet controls()}
      <SegmentedControl
        size="sm"
        ariaLabel="Instrument"
        options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
        value={instrument}
        onChange={(v) => (instrument = v as InstrumentId)}
      />
    {/snippet}
  </PracticeScreenHeader>

  <div class="flex items-center gap-3">
    <Progress value={done} max={path.length} class="max-w-xs" />
    <span class="text-sm text-muted-foreground tabular-nums">{done} / {path.length} complete</span>
  </div>

  <ol class="grid gap-3">
    {#each path as step (step.id)}
      <li>
        <Card.Root class={step.status === "done" ? "border-primary/40" : ""}>
          <Card.Header class="flex-row items-start gap-4">
            <div
              class="flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold
                {step.status === 'done'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-muted'}"
              aria-hidden="true"
            >
              {#if step.status === "done"}
                <Check class="size-4" />
              {:else}
                {step.order}
              {/if}
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <Card.Title class="text-lg">{step.title}</Card.Title>
                <Badge variant={statusBadge(step.status)}>
                  {step.status === "in-progress" ? "in progress" : step.status}
                </Badge>
              </div>
              <p class="text-sm text-muted-foreground">{step.summary}</p>

              {#if step.skillId}
                <div class="flex items-center gap-2 pt-1">
                  <Progress value={Math.round(step.mastery * 100)} max={100} class="max-w-[10rem]" />
                  <span class="text-xs text-muted-foreground tabular-nums">
                    {Math.round(step.mastery * 100)}% mastery
                  </span>
                </div>
              {/if}

              {#if step.instrumentNote}
                <p class="text-xs text-muted-foreground">↳ {step.instrumentNote}</p>
              {/if}

              <div class="flex flex-wrap items-center gap-2 pt-1">
                {#each step.resources as resource}
                  <Badge variant="outline">{resource}</Badge>
                {/each}
                {#if step.href}
                  <Button href={step.href} variant="link" size="sm" class="h-auto p-0">
                    Practice →
                  </Button>
                {/if}
              </div>
            </div>
          </Card.Header>
        </Card.Root>
      </li>
    {/each}
  </ol>
</PracticeScreen>
