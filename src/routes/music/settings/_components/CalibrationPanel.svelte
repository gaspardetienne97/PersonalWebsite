<script lang="ts" module>
  /** A metronome run in flight: `done` settles once every click is scheduled. */
  export interface ClickRun {
    stop(): void;
    done: Promise<void>;
  }

  export interface ClickRunInput {
    bpm: number;
    beats: number;
    /** Called per click with its time on the `performance.now()` basis. */
    onClick: (atMs: number) => void;
  }

  /** How long taps keep counting after the last click is scheduled. */
  const TAIL_MS = 700;
</script>

<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    CALIBRATION_BPM,
    CALIBRATION_TAPS,
    estimateInputOffset,
    type OffsetEstimate,
  } from "@repo/music-core/engines/input-router";
  import { Button } from "@repo/ui/button";

  let {
    label,
    offsetMs,
    detail,
    disabledReason,
    runClicks,
    subscribeTaps,
    onSave,
    onReset,
    onStatus,
  }: {
    /** What is being calibrated, e.g. "Microphone" or a MIDI device alias. */
    label: string;
    /** The offset already applied to this input, in ms. */
    offsetMs: number;
    detail?: string;
    /** Why calibration cannot start right now, when it cannot. */
    disabledReason?: string;
    runClicks: (input: ClickRunInput) => Promise<ClickRun>;
    /** Taps as the router delivers them, i.e. with `offsetMs` already applied. */
    subscribeTaps: (listener: (atMs: number) => void) => () => void;
    onSave: (offsetMs: number) => void | Promise<void>;
    onReset: () => void | Promise<void>;
    onStatus?: (message: string) => void;
  } = $props();

  type Phase = "idle" | "running" | "estimated" | "saved" | "checking" | "checked";

  let phase = $state<Phase>("idle");
  let estimate = $state<OffsetEstimate>();
  let residual = $state<OffsetEstimate>();
  let clicksHeard = $state(0);
  let tapsHeard = $state(0);
  let error = $state<string>();
  /**
   * The offset a run proposes: what was already applied when the run started
   * plus what it still measured. Fixed at estimate time, because saving moves
   * the `offsetMs` prop and re-deriving it then would double the shift.
   */
  let proposedMs = $state(0);
  /** The live run. Each run takes a number so a superseded one cannot land. */
  let active: ClickRun | undefined;
  let generation = 0;
  let tailTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ends the tail wait early; cancelling the timer alone would strand the run. */
  let endTail: (() => void) | undefined;
  const busy = $derived(phase === "running" || phase === "checking");

  onDestroy(() => abandon());

  /** Drop everything a run holds: the clock, its tail wait and its claim. */
  function abandon(): void {
    generation += 1;
    endTail?.();
    active?.stop();
    active = undefined;
  }

  /** Keep counting taps for a moment after the last click. */
  function waitForTail(): Promise<void> {
    return new Promise<void>((resolve) => {
      endTail = () => {
        clearTimeout(tailTimer);
        tailTimer = undefined;
        endTail = undefined;
        resolve();
      };
      tailTimer = setTimeout(() => endTail?.(), TAIL_MS);
    });
  }

  function report(message: string): void {
    onStatus?.(message);
  }

  async function run(mode: "measure" | "check"): Promise<void> {
    // A second press must not leave the first engine ticking on the shared clock.
    abandon();
    const mine = generation;
    error = undefined;
    clicksHeard = 0;
    tapsHeard = 0;
    if (mode === "measure") {
      estimate = undefined;
      residual = undefined;
    }
    phase = mode === "measure" ? "running" : "checking";
    report(`${label}: tap on every click.`);

    const clicks: number[] = [];
    const taps: number[] = [];
    const unsubscribe = subscribeTaps((atMs) => {
      taps.push(atMs);
      tapsHeard = taps.length;
    });
    let started: ClickRun | undefined;
    try {
      started = await runClicks({
        bpm: CALIBRATION_BPM,
        beats: CALIBRATION_TAPS,
        onClick: (atMs) => {
          clicks.push(atMs);
          clicksHeard = clicks.length;
        },
      });
      // Stop may have been pressed while the clock was starting up; `finally`
      // still stops what this run started.
      if (mine !== generation) return;
      active = started;
      await started.done;
      if (mine !== generation) return;
      await waitForTail();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "The metronome could not start.";
      phase = mode === "check" ? "saved" : "idle";
      report(`${label}: ${error}`);
      return;
    } finally {
      unsubscribe();
      started?.stop();
      if (active === started) active = undefined;
    }
    if (mine !== generation) return;

    const result = estimateInputOffset(taps, clicks);
    if (mode === "measure") {
      estimate = result;
      proposedMs = offsetMs + result.offsetMs;
      phase = "estimated";
      report(
        result.accepted
          ? `${label}: estimated offset ${proposedMs} ms.`
          : `${label}: ${result.reason}`,
      );
      return;
    }
    residual = result;
    phase = "checked";
    report(
      result.accepted
        ? `${label}: ${result.offsetMs} ms left after the offset.`
        : `${label}: ${result.reason}`,
    );
  }

  function stop(): void {
    abandon();
    phase = "idle";
    report(`${label}: calibration stopped.`);
  }

  async function save(): Promise<void> {
    await onSave(proposedMs);
    phase = "saved";
    report(`${label}: offset saved as ${proposedMs} ms.`);
  }

  async function reset(): Promise<void> {
    await onReset();
    estimate = undefined;
    residual = undefined;
    phase = "idle";
    report(`${label}: offset reset.`);
  }
</script>

<div class="space-y-3 py-3 first:pt-0 last:pb-0" data-settings-row>
  <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
    <div class="min-w-0 flex-1 basis-48">
      <p class="text-sm font-medium">{label}</p>
      <p class="text-xs text-muted-foreground">
        {detail ? `${detail} · ` : ""}{offsetMs === 0 ? "Not calibrated" : `Offset ${offsetMs} ms`}
      </p>
    </div>
    <div class="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-2">
      {#if busy}
        <Button type="button" variant="outline" class="min-h-11" onclick={stop}>Stop</Button>
      {:else}
        <Button
          type="button"
          variant="outline"
          class="min-h-11"
          disabled={disabledReason !== undefined}
          onclick={() => void run("measure")}
        >
          Calibrate
        </Button>
      {/if}
      {#if offsetMs !== 0 && !busy}
        <Button type="button" variant="ghost" class="min-h-11" onclick={() => void reset()}>
          Reset
        </Button>
      {/if}
    </div>
  </div>

  {#if disabledReason}
    <p class="text-xs text-warn">{disabledReason}</p>
  {/if}

  <p class="text-xs text-muted-foreground">
    Tap along with {CALIBRATION_TAPS} clicks at {CALIBRATION_BPM} BPM. The result is an estimate that
    includes your reaction time and your speakers' own delay, not a hardware measurement, so treat it
    as a starting point you can redo: a positive offset means your hits arrive late and are pulled
    earlier.
  </p>

  {#if busy}
    <p class="text-sm">
      Click {clicksHeard} of {CALIBRATION_TAPS} · {tapsHeard}
      {tapsHeard === 1 ? "tap" : "taps"} heard
    </p>
  {/if}

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  {#if estimate && (phase === "estimated" || phase === "saved" || phase === "checking" || phase === "checked")}
    {#if estimate.accepted}
      <p class="text-sm">
        Estimated offset: <span class="font-mono tabular-nums">{proposedMs} ms</span>
        · spread {estimate.iqrMs} ms across {estimate.matched} taps.
      </p>
    {:else}
      <p class="text-sm text-warn">{estimate.reason}</p>
    {/if}
  {/if}

  {#if residual && phase === "checked"}
    <p class="text-sm">
      {#if residual.accepted}
        Residual with the offset applied:
        <span class="font-mono tabular-nums">{residual.offsetMs} ms</span>.
      {:else}
        Residual could not be read: {residual.reason}
      {/if}
    </p>
  {/if}

  {#if !busy && (phase === "estimated" || phase === "saved" || phase === "checked")}
    <div class="flex flex-wrap items-center gap-2">
      {#if phase === "estimated" && estimate?.accepted}
        <Button type="button" class="min-h-11" onclick={() => void save()}>Save offset</Button>
      {/if}
      {#if phase === "saved" || phase === "checked"}
        <Button type="button" variant="outline" class="min-h-11" onclick={() => void run("check")}>
          Check it
        </Button>
      {/if}
      <Button type="button" variant="ghost" class="min-h-11" onclick={() => void run("measure")}>
        Try again
      </Button>
    </div>
  {/if}
</div>
