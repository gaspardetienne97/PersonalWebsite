<script lang="ts">
  import type { ScoreSection } from "@repo/music-core/domain";
  import type {
    LoopOrder,
    LoopSnap,
    ScorePracticeSelection,
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
    value,
    active = false,
    onChange,
  }: {
    sections: ScoreSection[];
    scoreEndBeat: number;
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
    value.selection.kind === "custom" ? value.selection.snap : "note-group",
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
      setSelection({ kind: "custom", startBeat: 0, endBeat: scoreEndBeat, snap: "note-group" });
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

  function setRangeBoundary(boundary: "start" | "end", event: Event): void {
    const next = Number((event.currentTarget as HTMLInputElement).value);
    setSelection({
      kind: "custom",
      startBeat: boundary === "start" ? next : customStart,
      endBeat: boundary === "end" ? next : customEnd,
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
          <Label for="score-range-start">Start beat</Label>
          <Input
            id="score-range-start"
            aria-label="Range start beat"
            type="number"
            min={0}
            step={0.25}
            value={value.selection.startBeat}
            oninput={(event) => setRangeBoundary("start", event)}
          />
        </div>
        <div class="grid gap-2">
          <Label for="score-range-end">End beat</Label>
          <Input
            id="score-range-end"
            aria-label="Range end beat"
            type="number"
            min={0}
            step={0.25}
            value={value.selection.endBeat}
            oninput={(event) => setRangeBoundary("end", event)}
          />
        </div>
      </div>
    </div>
  {/if}

  {#if value.mode === "performance"}
    <div class="grid gap-4 rounded-md border p-3">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="score-practice-bpm">Practice BPM</Label>
          <Input
            id="score-practice-bpm"
            aria-label="Practice BPM"
            type="number"
            min={40}
            max={240}
            value={value.bpm}
            oninput={(event) =>
              update({ bpm: Number((event.currentTarget as HTMLInputElement).value) })}
          />
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
        <Label>Count in</Label>
        <SegmentedControl
          ariaLabel="Count in"
          size="sm"
          options={[
            { value: "0", label: "Off" },
            { value: "1", label: "1 bar" },
            { value: "2", label: "2 bars" },
          ]}
          value={String(value.countInBars)}
          onChange={(bars) =>
            update({ countInBars: Number(bars) as ScorePracticeSetupValue["countInBars"] })}
        />
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
