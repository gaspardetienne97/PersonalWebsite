<script lang="ts">
  import type { ScoreSection } from "@repo/music-core/domain";
  import {
    barBeatRange,
    barRangeOf,
    type LoopOrder,
    type LoopSnap,
    type ScorePracticeSelection,
    type ScoreSelectionBoundary,
  } from "@repo/music-core/engines/score-practice";
  import type { TimingStrictness } from "@repo/music-core/engines/score-follower";
  import { Button } from "@repo/ui/button";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";

  import SegmentedControl from "../../../_components/SegmentedControl.svelte";
  import type { ScorePracticeSetupValue } from "./score-practice-types";

  let {
    sections,
    scoreEndBeat,
    measureBoundaries = [],
    value,
    active = false,
    onChange,
  }: {
    sections: ScoreSection[];
    scoreEndBeat: number;
    measureBoundaries?: ScoreSelectionBoundary[];
    value: ScorePracticeSetupValue;
    active?: boolean;
    onChange?: (value: ScorePracticeSetupValue) => void;
  } = $props();

  const selectionMode = $derived(value.selection.kind);
  const sectionIds = $derived(
    value.selection.kind === "sections" ? value.selection.sectionIds : [],
  );
  const loopOrder = $derived(
    value.selection.kind === "sections" ? value.selection.order : "sequence",
  );
  const customStart = $derived(
    value.selection.kind === "custom" ? value.selection.startBeat : 0,
  );
  const customEnd = $derived(
    value.selection.kind === "custom" ? value.selection.endBeat : scoreEndBeat,
  );
  const customSnap = $derived(
    value.selection.kind === "custom" ? value.selection.snap : "measure",
  );
  // Bars are what a player reads off the page; beats stay the model underneath.
  const lastBar = $derived(Math.max(1, measureBoundaries.length - 1));
  const bars = $derived(
    barRangeOf({ startBeat: customStart, endBeat: customEnd }, measureBoundaries),
  );

  function update(patch: Partial<ScorePracticeSetupValue>): void {
    onChange?.({ ...value, ...patch });
  }

  function setSelection(selection: ScorePracticeSelection): void {
    update({ selection });
  }

  function setSelectionMode(mode: string): void {
    if (mode === "full") setSelection({ kind: "full" });
    if (mode === "sections") {
      setSelection({ kind: "sections", sectionIds: [], order: "sequence" });
    }
    if (mode === "custom") {
      setSelection({ kind: "custom", startBeat: 0, endBeat: scoreEndBeat, snap: "measure" });
    }
  }

  function toggleSection(id: string): void {
    const next = sectionIds.includes(id)
      ? sectionIds.filter((sectionId) => sectionId !== id)
      : [...sectionIds, id];
    setSelection({ kind: "sections", sectionIds: next, order: loopOrder });
  }

  function setLoopOrder(order: string): void {
    setSelection({
      kind: "sections",
      sectionIds: [...sectionIds],
      order: order as LoopOrder,
    });
  }

  function setSnap(snap: string): void {
    setSelection({
      kind: "custom",
      startBeat: customStart,
      endBeat: customEnd,
      snap: snap as LoopSnap,
    });
  }

  /**
   * Committed on `change`, so typing "12" is not read as bar 1 then bar 12. The
   * typed number is clamped into the score and the field is written back to the
   * bar that was actually applied: the box can never disagree with the range.
   */
  function setRangeBar(boundary: "start" | "end", event: Event): void {
    const field = event.currentTarget as HTMLInputElement;
    // An emptied field is not bar 0: it resyncs to the bar already in force.
    const typed = field.value.trim() === "" ? Number.NaN : Number(field.value);
    const other = boundary === "start" ? bars.endBar : bars.startBar;
    const bar = Number.isFinite(typed)
      ? Math.min(lastBar, Math.max(1, Math.round(typed)))
      : boundary === "start"
        ? bars.startBar
        : bars.endBar;
    // Neither end may cross the other; the moving end stops at it.
    const applied =
      boundary === "start" ? Math.min(bar, other) : Math.max(bar, other);
    const range = barBeatRange(applied, measureBoundaries);
    field.value = String(applied);
    if (!range) return;
    setSelection({
      kind: "custom",
      startBeat: boundary === "start" ? range.startBeat : customStart,
      endBeat: boundary === "end" ? range.endBeat : customEnd,
      snap: customSnap,
    });
  }
</script>

<fieldset disabled={active} class="grid gap-5 disabled:opacity-70">
  <div class="grid gap-2">
    <Label>Practice mode</Label>
    <SegmentedControl
      ariaLabel="Practice mode"
      options={[
        { value: "wait", label: "Wait" },
        { value: "performance", label: "Performance" },
      ]}
      value={value.mode}
      onChange={(mode) => update({ mode: mode as ScorePracticeSetupValue["mode"] })}
    />
  </div>

  <div class="grid gap-2">
    <Label>Practice range</Label>
    <SegmentedControl
      ariaLabel="Practice range"
      options={[
        { value: "full", label: "Whole score" },
        { value: "sections", label: "Sections" },
        { value: "custom", label: "Custom range" },
      ]}
      value={selectionMode}
      onChange={setSelectionMode}
    />
  </div>

  {#if value.selection.kind === "sections"}
    <div class="grid gap-3 rounded-md border p-3">
      <div class="flex flex-wrap gap-2" aria-label="Score sections">
        {#each sections as section (section.id)}
          <Button
            type="button"
            size="sm"
            variant={sectionIds.includes(section.id) ? "default" : "outline"}
            aria-pressed={sectionIds.includes(section.id)}
            onclick={() => toggleSection(section.id)}
          >
            {section.name}
          </Button>
        {/each}
      </div>
      <SegmentedControl
        ariaLabel="Loop order"
        size="sm"
        options={[
          { value: "sequence", label: "Sequence" },
          { value: "per-section", label: "Per section" },
        ]}
        value={value.selection.order}
        onChange={setLoopOrder}
      />
    </div>
  {:else if value.selection.kind === "custom"}
    <div class="grid gap-4 rounded-md border p-3">
      <SegmentedControl
        ariaLabel="Range snap"
        size="sm"
        options={[
          { value: "note-group", label: "Note groups" },
          { value: "measure", label: "Measures" },
        ]}
        value={value.selection.snap}
        onChange={setSnap}
      />
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="score-range-start">Start bar</Label>
          <Input
            id="score-range-start"
            aria-label="Range start bar"
            type="number"
            min={1}
            max={lastBar}
            step={1}
            value={bars.startBar}
            onchange={(event) => setRangeBar("start", event)}
          />
        </div>
        <div class="grid gap-2">
          <Label for="score-range-end">End bar</Label>
          <Input
            id="score-range-end"
            aria-label="Range end bar"
            type="number"
            min={1}
            max={lastBar}
            step={1}
            value={bars.endBar}
            onchange={(event) => setRangeBar("end", event)}
          />
        </div>
      </div>
    </div>
  {/if}

  {#if value.mode === "performance"}
    <div class="grid gap-4 rounded-md border p-3">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label>Practice tempo</Label>
          <p class="text-sm font-semibold tabular-nums">{value.bpm} BPM · floating controls</p>
        </div>
        <div class="grid gap-2">
          <Label for="score-strictness">Strictness</Label>
          <select
            id="score-strictness"
            aria-label="Strictness"
            value={value.strictness}
            onchange={(event) =>
              update({
                strictness: (event.currentTarget as HTMLSelectElement).value as TimingStrictness,
              })}
            class="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="relaxed">Relaxed</option>
            <option value="normal">Normal</option>
            <option value="strict">Strict</option>
          </select>
        </div>
      </div>
      <div class="grid gap-2">
        <Label>Takes</Label>
        <SegmentedControl
          ariaLabel="Takes"
          size="sm"
          options={[
            { value: "1", label: "1 take" },
            { value: "2", label: "2 takes" },
            { value: "4", label: "4 takes" },
            { value: "8", label: "8 takes" },
          ]}
          value={String(value.totalTakes)}
          onChange={(takes) =>
            update({ totalTakes: Number(takes) as ScorePracticeSetupValue["totalTakes"] })}
        />
      </div>
    </div>
  {/if}
</fieldset>
