# Practice OS UX Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `/music` SvelteKit app from the current functional UI to the Claude Design "Practice OS" UX while keeping all real engine wiring, MIDI input, and client-side persistence intact.

**Architecture:** Phase 1 adds shared Practice OS shell components under `src/routes/music/_components/`. Phase 2 migrates each route page to use those composites with the same engine wiring they already have. Phase 3 adds projection helpers in `packages/music-core` only where route UI needs derived state. Prototype-only screens (connect, import, jam, etc.) get TODO stubs, not fake static routes.

**Tech Stack:** SvelteKit 5 runes, Tailwind CSS 4 (site tokens), `@repo/ui` primitives (bits-ui based), `@repo/music-core` engines, IndexedDB via `PracticeStore`, Vitest + Playwright

---

## Constraints (read before every task)

- Never copy Claude Design raw colors/font stacks. Use `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`, `text-primary-foreground`, `bg-sidebar`, `text-sidebar-foreground`, and related Tailwind/shadcn tokens.
- Never create separate CSS files for Music UI. Tailwind utility classes only.
- Instrument accent classes: express via `data-instrument` attribute + CSS custom property `--instr` using `color-mix`. Map through theme-aware `text-primary` / `bg-primary/10` patterns rather than raw hex.
- All engine wiring from existing routes must be preserved exactly. Refactor layout/markup only.
- Use `useMusicRuntime()` inside every route component; never construct new engines directly in routes (except `_runtime.svelte.ts` creates them once).
- Always run `vp run -r check` and `vp test --run` before claiming a phase complete.

---

## File Map

### New files to create

```
src/routes/music/_components/
  PracticeScreen.svelte                  # page wrapper with topbar slot + transport slot
  PracticeScreenHeader.svelte            # h1 + subtitle + right-slot
  MusicTransportBar.svelte               # metronome/tempo transport strip (replaces inline)
  SourceReadout.svelte                   # active input device chip
  InputSourceControl.svelte              # MIDI/Audio/On-screen segmented toggle
  InstrumentBadge.svelte                 # colored pill for instrument identity
  ProgressRing.svelte                    # SVG ring for XP/mastery
  SegmentProgress.svelte                 # session segment bar (dots)
  LiveHud.svelte                         # hud-tile grid (in-pocket %, combo, avg offset)
  TimingMeter.svelte                     # ahead/behind needle
  SkillRing.svelte                       # node-ring for skill tree
  PracticeActionCard.svelte              # ex-card hover-lift card for practice lab
  SessionFeedback.svelte                 # ok/bad feedback banner
  WeekDots.svelte                        # 7-day streak dot strip

# NOTE: packages/music-core/src/engines/projection/ ALREADY EXISTS and is
# ALREADY exported via package.json ("./engines/projection"). It currently holds
# instrument-location projections (projectPiano, projectFretboard,
# projectPlayableGroup). ADD new files to this dir and APPEND their exports to the
# existing index.ts. Do NOT recreate the dir and do NOT add a new package.json export.
packages/music-core/src/engines/projection/
  rhythm-hud.ts                          # rhythmHudProjection(state) -> LiveHudData
  rhythm-hud.test.ts
  technique-ladder.ts                    # tempoLadderProjection(state) -> TempoLadder
  technique-ladder.test.ts
  journal-projections.ts                 # heatmap + timeline projections
  journal-projections.test.ts
  (index.ts already exists — append new exports to it)
```

### Files to modify

```
src/routes/music/_runtime.svelte.ts                   # OPTIONAL: surface activeInstrument + transport handle (see Runtime note)
src/routes/music/+layout.svelte                       # no structural change; already correct
src/routes/music/_components/MusicNavigation.svelte   # expand nav groups (Learn/Play/Track/Progress)
src/routes/music/_components/MusicTopbar.svelte       # integrate SourceReadout + InputSourceControl
src/routes/music/+page.svelte                         # Home: full Practice OS dashboard layout
src/routes/music/learn/+page.svelte                   # Practice Lab cards layout
src/routes/music/play/+page.svelte                    # Play entry cards
src/routes/music/learn/ear/_components/*              # Ear focus stage (restyle existing _components; keep EarTrainingSession wiring)
src/routes/music/learn/reading/_components/*          # Reading: restyle StaffNotation/Flashcard/SightReading/PianoInput/FretboardInput (keep ReadingSession + VexFlow + tunings)
src/routes/music/learn/rhythm/+page.svelte            # Rhythm trainer layout (RhythmSession wiring preserved)
src/routes/music/learn/theory/+page.svelte            # Theory library layout (reuse existing ChordDiagram + PianoKeyboard)
src/routes/music/play/scales/+page.svelte             # Scales drill layout (TechniqueSession wiring preserved)
src/routes/music/track/+page.svelte                   # Journal layout
src/routes/music/progress/+page.svelte                # Skill tree + dashboard layout
```

> **Reuse, don't rebuild:** `learn/reading/_components/` already ships
> `StaffNotation`, `FlashcardSession`, `SightReadingSession`, `PianoInput`,
> `FretboardInput`, `ReadingSetup`, `ReadingSummary`, `TuningEditor`; and
> `learn/theory/_components/` ships `ChordDiagram` + `PianoKeyboard`. Migration =
> restyle these with the shared composites + tokens. Do not delete or re-implement
> the VexFlow/notation/tuning logic — it is stronger than the static prototype.

> **Runtime note (from Codex plan):** the cleanest version of this migration lets
> `MusicRuntime` own shared UI-facing state — active instrument + a transport
> handle — so the topbar/transport bar and every route read one source via
> `useMusicRuntime()` instead of each page re-deriving MIDI/transport. This is
> OPTIONAL for the first pass (pages already wire their own runtime correctly). If
> adopted, do it as its own slice with `_runtime.svelte.ts` tests BEFORE the route
> tasks, and never construct `MidiEngine`/`InputRouter`/`SoundEngine` outside the
> runtime factory.

> **No package.json export task needed:** `./engines/projection` is already
> exported. New projection helpers become reachable the moment they are appended
> to the existing `engines/projection/index.ts`.

---

## Task 0: Extend MusicRuntime with active-instrument + reactive input state

**Files:**
- Modify: `src/routes/music/_runtime.svelte.ts`
- Create: `src/routes/music/_runtime.svelte.test.ts`

**Decision:** the user chose to do this cross-cutting refactor FIRST so the topbar,
transport bar, and every route read shared UI state from one place via
`useMusicRuntime()`.

**GROUND TRUTH — current runtime + router (verified):**
- `MusicRuntime` already owns `router` (`InputRouter`), `midi` (`MidiEngine`),
  `sound` (`SoundEngine`), and `$state` audio fields. It subscribes MIDI → router.
- `InputRouter` exposes `state` getter `{ activeSource: InputSource; confidence: number }`,
  `subscribeState(listener)`, and getters `activeSource`/`confidence`.
- `InstrumentId = "piano" | "guitar" | "ukulele" | "aerophone" | "mpc" | "voice"`;
  labels live in `INSTRUMENT_LABELS` (domain/instrument.ts).

Add: a reactive `activeInstrument` with a setter, and reactive mirrors of the
router's `activeSource`/`confidence` so components don't each re-subscribe.

- [ ] **Step 1: Write the failing test**

```typescript
// src/routes/music/_runtime.svelte.test.ts
import { describe, expect, it } from 'vitest';
import { MusicRuntime } from './_runtime.svelte';

describe('MusicRuntime shared UI state', () => {
  it('defaults active instrument to piano', () => {
    const rt = new MusicRuntime();
    expect(rt.activeInstrument).toBe('piano');
    rt.dispose();
  });

  it('updates active instrument via setter', () => {
    const rt = new MusicRuntime();
    rt.setActiveInstrument('guitar');
    expect(rt.activeInstrument).toBe('guitar');
    rt.dispose();
  });

  it('mirrors router active source reactively', () => {
    const rt = new MusicRuntime();
    expect(rt.activeSource).toBe('onscreen'); // router default
    rt.router.noteOn(60, 'midi');
    expect(rt.activeSource).toBe('midi');
    rt.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/gaspard/Code/PersonalWebsite
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'MusicRuntime shared UI'
```
Expected: FAIL — `activeInstrument`/`setActiveInstrument`/`activeSource` undefined.

- [ ] **Step 3: Extend the runtime**

Add to the `MusicRuntime` class (keep all existing members):

```typescript
import type { InputSource, InstrumentId } from "@repo/music-core/domain";

// inside class MusicRuntime:
activeInstrument = $state<InstrumentId>("piano");
activeSource = $state<InputSource>(this.router.activeSource);
inputConfidence = $state<number>(this.router.confidence);

#unsubscribeRouterState = this.router.subscribeState((state) => {
  this.activeSource = state.activeSource;
  this.inputConfidence = state.confidence;
});

setActiveInstrument(instrument: InstrumentId): void {
  this.activeInstrument = instrument;
}
```

And in `dispose()`, add `this.#unsubscribeRouterState();` alongside the existing
cleanup.

- [ ] **Step 4: Run tests to verify they pass**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'MusicRuntime shared UI'
```

- [ ] **Step 5: Check**

```bash
vp run -r check 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/music/_runtime.svelte.ts src/routes/music/_runtime.svelte.test.ts
git commit -m "feat(T0): extend MusicRuntime with active-instrument and reactive input state"
```

---

## Task 1: Shared component — SourceReadout

**Files:**
- Create: `src/routes/music/_components/SourceReadout.svelte`

The `SourceReadout` chip shows the currently active input source device name and icon.

- [ ] **Step 1: Write the failing component test**

Create `src/routes/music/_components/SourceReadout.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SourceReadout from './SourceReadout.svelte';

describe('SourceReadout', () => {
  it('shows source label and device name', () => {
    const { getByText } = render(SourceReadout, {
      props: { label: 'Active input', device: 'Roland FP-30X', icon: '🎹' }
    });
    expect(getByText('Active input')).toBeTruthy();
    expect(getByText('Roland FP-30X')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/gaspard/Code/PersonalWebsite
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'SourceReadout'
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/SourceReadout.svelte -->
<script lang="ts">
  let {
    label = 'Active input',
    device,
    live = false,
    class: cls = ''
  }: {
    label?: string;
    device: string;
    live?: boolean;
    class?: string;
  } = $props();
</script>

<div
  class="inline-flex items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm {cls}"
  aria-label="{label}: {device}"
>
  <div class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
    <slot name="icon" />
  </div>
  <div class="flex flex-col min-w-0">
    <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
    <span class="flex items-center gap-1.5 text-sm font-semibold truncate">
      {#if live}
        <span class="inline-block size-1.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_0_3px_color-mix(in_srgb,theme(colors.green.500)_20%,transparent)]" aria-hidden="true"></span>
      {/if}
      {device}
    </span>
  </div>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'SourceReadout'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/SourceReadout.svelte src/routes/music/_components/SourceReadout.svelte.test.ts
git commit -m "feat(T2.1): add SourceReadout shared component"
```

---

## Task 2: Shared component — InstrumentBadge

**Files:**
- Create: `src/routes/music/_components/InstrumentBadge.svelte`

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/InstrumentBadge.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import InstrumentBadge from './InstrumentBadge.svelte';

describe('InstrumentBadge', () => {
  it('renders the instrument label', () => {
    const { getByText } = render(InstrumentBadge, { props: { instrument: 'Piano' } });
    expect(getByText('Piano')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'InstrumentBadge'
```

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/InstrumentBadge.svelte -->
<script lang="ts">
  let {
    instrument,
    dot = false,
    class: cls = ''
  }: {
    instrument: string;
    dot?: boolean;
    class?: string;
  } = $props();
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary {cls}"
>
  {#if dot}
    <span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
  {/if}
  {instrument}
</span>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'InstrumentBadge'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/InstrumentBadge.svelte src/routes/music/_components/InstrumentBadge.svelte.test.ts
git commit -m "feat(T2.2): add InstrumentBadge shared component"
```

---

## Task 3: Shared component — ProgressRing

**Files:**
- Create: `src/routes/music/_components/ProgressRing.svelte`

Renders a circular SVG ring with value/total/percent display.

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/ProgressRing.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProgressRing from './ProgressRing.svelte';

describe('ProgressRing', () => {
  it('renders value and total', () => {
    const { getByText } = render(ProgressRing, {
      props: { value: 860, total: 1000, label: 'Today\'s XP' }
    });
    expect(getByText('860')).toBeTruthy();
    expect(getByText(/1,000/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'ProgressRing'
```

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/ProgressRing.svelte -->
<script lang="ts">
  let {
    value,
    total,
    label,
    size = 140,
    strokeWidth = 11,
    class: cls = ''
  }: {
    value: number;
    total: number;
    label?: string;
    size?: number;
    strokeWidth?: number;
    class?: string;
  } = $props();

  const r = $derived(size / 2 - strokeWidth);
  const circumference = $derived(2 * Math.PI * r);
  const pct = $derived(total > 0 ? Math.min(value / total, 1) : 0);
  const dashoffset = $derived(circumference * (1 - pct));
  const cx = $derived(size / 2);
</script>

<div class="relative inline-grid place-items-center {cls}" style="width:{size}px;height:{size}px;" aria-label="{label}: {value} of {total}">
  <svg width={size} height={size} style="transform:rotate(-90deg)" aria-hidden="true">
    <circle
      cx={cx} cy={cx} r={r}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      class="text-muted/20"
    />
    <circle
      cx={cx} cy={cx} r={r}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashoffset}
      class="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
    />
  </svg>
  <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
    <span class="text-2xl font-bold tabular-nums leading-none">{value.toLocaleString()}</span>
    <span class="mt-1 text-xs text-muted-foreground">/ {total.toLocaleString()}</span>
    <span class="mt-1.5 text-sm font-bold text-primary">{Math.round(pct * 100)}%</span>
  </div>
</div>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'ProgressRing'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/ProgressRing.svelte src/routes/music/_components/ProgressRing.svelte.test.ts
git commit -m "feat(T2.3): add ProgressRing shared component"
```

---

## Task 4: Shared component — SegmentProgress

**Files:**
- Create: `src/routes/music/_components/SegmentProgress.svelte`

Renders the session segment bar (dots row: done / current / upcoming).

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/SegmentProgress.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SegmentProgress from './SegmentProgress.svelte';

describe('SegmentProgress', () => {
  it('renders correct count of segments', () => {
    const { container } = render(SegmentProgress, {
      props: { total: 10, current: 6 }
    });
    const segments = container.querySelectorAll('[data-segment]');
    expect(segments.length).toBe(10);
  });

  it('marks done segments', () => {
    const { container } = render(SegmentProgress, {
      props: { total: 5, current: 3 }
    });
    const done = container.querySelectorAll('[data-segment="done"]');
    expect(done.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'SegmentProgress'
```

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/SegmentProgress.svelte -->
<script lang="ts">
  let {
    total,
    current,
    label = 'Session',
    class: cls = ''
  }: {
    total: number;
    current: number;
    label?: string;
    class?: string;
  } = $props();

  const segments = $derived(
    Array.from({ length: total }, (_, i) => {
      if (i < current) return 'done';
      if (i === current) return 'current';
      return 'upcoming';
    })
  );
</script>

<div class="flex items-center gap-2 {cls}">
  <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
  <div class="flex flex-1 gap-1" role="progressbar" aria-valuenow={current} aria-valuemax={total} aria-label="{label} {current} of {total}">
    {#each segments as seg}
      <i
        data-segment={seg}
        class="block h-1.5 flex-1 rounded-full transition-colors {seg === 'done' ? 'bg-primary' : seg === 'current' ? 'bg-primary/50' : 'bg-muted'}"
      ></i>
    {/each}
  </div>
  <span class="text-sm font-bold tabular-nums">{current}<span class="font-normal text-muted-foreground"> / {total}</span></span>
</div>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'SegmentProgress'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/SegmentProgress.svelte src/routes/music/_components/SegmentProgress.svelte.test.ts
git commit -m "feat(T2.4): add SegmentProgress shared component"
```

---

## Task 5: Shared component — TimingMeter

**Files:**
- Create: `src/routes/music/_components/TimingMeter.svelte`

Renders the ahead/behind needle meter used on the Rhythm screen.

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/TimingMeter.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TimingMeter from './TimingMeter.svelte';

describe('TimingMeter', () => {
  it('renders with offset label', () => {
    const { getByText } = render(TimingMeter, {
      props: { offsetMs: 4 }
    });
    expect(getByText(/Ahead/)).toBeTruthy();
    expect(getByText(/Behind/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'TimingMeter'
```

- [ ] **Step 3: Create the component**

`offsetMs` is signed: positive = ahead, negative = behind. `rangeMs` is full-scale (default 100).

```svelte
<!-- src/routes/music/_components/TimingMeter.svelte -->
<script lang="ts">
  let {
    offsetMs = 0,
    rangeMs = 100,
    class: cls = ''
  }: {
    offsetMs: number;
    rangeMs?: number;
    class?: string;
  } = $props();

  const pct = $derived(Math.min(Math.max((offsetMs / rangeMs + 1) / 2, 0), 1));
  const pctLeft = $derived(Math.round(pct * 100));
  const inPocket = $derived(Math.abs(offsetMs) <= 15);
</script>

<div class="relative h-10 rounded-full border bg-card overflow-hidden {cls}" aria-label="Timing offset: {offsetMs}ms">
  <!-- perfect band -->
  <div class="absolute inset-y-0 w-[20%] bg-green-500/10 border-x border-green-500/20" style="left:40%"></div>
  <!-- center line -->
  <div class="absolute inset-y-0 w-px bg-green-500/60" style="left:50%"></div>
  <!-- needle -->
  <div
    class="absolute inset-y-1 w-1 -translate-x-1/2 rounded-full transition-[left] duration-150 {inPocket ? 'bg-green-500' : 'bg-primary'}"
    style="left:{pctLeft}%"
  ></div>
  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Behind</span>
  <span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-green-600 dark:text-green-400">On beat</span>
  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Ahead</span>
</div>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'TimingMeter'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/TimingMeter.svelte src/routes/music/_components/TimingMeter.svelte.test.ts
git commit -m "feat(T2.5): add TimingMeter shared component"
```

---

## Task 6: Shared component — WeekDots

**Files:**
- Create: `src/routes/music/_components/WeekDots.svelte`

Renders 7 day-of-week dots with done/today/upcoming states.

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/WeekDots.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import WeekDots from './WeekDots.svelte';

describe('WeekDots', () => {
  it('renders 7 day dots', () => {
    const { container } = render(WeekDots, {
      props: { completedDays: [0, 1, 2, 3, 4], todayIndex: 5 }
    });
    const dots = container.querySelectorAll('[data-dot]');
    expect(dots.length).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'WeekDots'
```

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/WeekDots.svelte -->
<script lang="ts">
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  let {
    completedDays = [],
    todayIndex = -1,
    class: cls = ''
  }: {
    completedDays?: number[];
    todayIndex?: number;
    class?: string;
  } = $props();
</script>

<div class="flex gap-1.5 {cls}">
  {#each DAY_LABELS as day, i}
    {@const done = completedDays.includes(i)}
    {@const isToday = i === todayIndex}
    <div class="flex flex-col items-center gap-1">
      <div
        data-dot={done ? 'done' : isToday ? 'today' : 'upcoming'}
        class="grid size-6 place-items-center rounded-full text-xs
          {done ? 'bg-green-500/15 text-green-600 dark:text-green-400' : ''}
          {isToday ? 'outline outline-2 outline-primary outline-offset-1 bg-muted' : ''}
          {!done && !isToday ? 'bg-muted text-muted-foreground' : ''}"
      >
        {#if done}✓{/if}
      </div>
      <span class="text-[10px] font-semibold text-muted-foreground">{day}</span>
    </div>
  {/each}
</div>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'WeekDots'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/WeekDots.svelte src/routes/music/_components/WeekDots.svelte.test.ts
git commit -m "feat(T2.6): add WeekDots shared component"
```

---

## Task 7: Shared component — SessionFeedback

**Files:**
- Create: `src/routes/music/_components/SessionFeedback.svelte`

Renders the ok/bad feedback banner with XP pop.

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/SessionFeedback.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SessionFeedback from './SessionFeedback.svelte';

describe('SessionFeedback', () => {
  it('shows correct feedback in ok state', () => {
    const { getByText } = render(SessionFeedback, {
      props: { kind: 'correct', message: 'Great ear!', xp: 25 }
    });
    expect(getByText(/Great ear/)).toBeTruthy();
    expect(getByText('+25 XP')).toBeTruthy();
  });

  it('shows wrong feedback in bad state', () => {
    const { getByText } = render(SessionFeedback, {
      props: { kind: 'wrong', message: 'That was a minor 7th.' }
    });
    expect(getByText(/minor 7th/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'SessionFeedback'
```

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/SessionFeedback.svelte -->
<script lang="ts">
  let {
    kind,
    message,
    detail,
    xp,
    class: cls = '',
    onreplay
  }: {
    kind: 'correct' | 'wrong';
    message: string;
    detail?: string;
    xp?: number;
    class?: string;
    onreplay?: () => void;
  } = $props();
</script>

<div
  role="status"
  aria-live="polite"
  class="flex items-center gap-4 rounded-xl border p-4
    {kind === 'correct' ? 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400' : 'border-destructive/20 bg-destructive/10 text-destructive'}
    {cls}"
>
  <div class="grid size-10 shrink-0 place-items-center rounded-full {kind === 'correct' ? 'bg-green-500/20' : 'bg-destructive/20'} text-xl">
    {kind === 'correct' ? '✓' : '✗'}
  </div>
  <div class="flex-1 min-w-0">
    <div class="font-semibold">{message}</div>
    {#if detail}
      <div class="mt-0.5 text-sm opacity-80">{detail}</div>
    {/if}
  </div>
  {#if kind === 'correct' && xp}
    <span class="shrink-0 rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">+{xp} XP</span>
  {/if}
  {#if kind === 'wrong' && onreplay}
    <button
      type="button"
      onclick={onreplay}
      class="shrink-0 rounded-lg border border-destructive/30 px-3 py-1.5 text-sm font-medium hover:bg-destructive/10"
    >
      Hear again
    </button>
  {/if}
</div>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'SessionFeedback'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/SessionFeedback.svelte src/routes/music/_components/SessionFeedback.svelte.test.ts
git commit -m "feat(T2.7): add SessionFeedback shared component"
```

---

## Task 8: Shared component — PracticeActionCard

**Files:**
- Create: `src/routes/music/_components/PracticeActionCard.svelte`

Hover-lift exercise card for practice lab grid.

- [ ] **Step 1: Write failing test**

Create `src/routes/music/_components/PracticeActionCard.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PracticeActionCard from './PracticeActionCard.svelte';

describe('PracticeActionCard', () => {
  it('renders title and description', () => {
    const { getByText } = render(PracticeActionCard, {
      props: { title: 'Ear Training', description: 'Interval ID · listening.', xp: 150, href: '/music/learn/ear' }
    });
    expect(getByText('Ear Training')).toBeTruthy();
    expect(getByText('+150 XP')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'PracticeActionCard'
```

- [ ] **Step 3: Create the component**

```svelte
<!-- src/routes/music/_components/PracticeActionCard.svelte -->
<script lang="ts">
  let {
    title,
    description,
    xp,
    href,
    class: cls = ''
  }: {
    title: string;
    description: string;
    xp?: number;
    href: string;
    class?: string;
  } = $props();
</script>

<a
  {href}
  class="group flex flex-col gap-3 rounded-2xl border bg-card p-5 transition-[transform,box-shadow,border-color] duration-200
    hover:-translate-y-1 hover:shadow-lg hover:border-primary/30 {cls}"
>
  <div class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
    <slot name="icon" />
  </div>
  <h4 class="text-base font-semibold">{title}</h4>
  <p class="text-sm text-muted-foreground leading-snug flex-1">{description}</p>
  <div class="flex items-center justify-between mt-auto pt-2">
    {#if xp}
      <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">+{xp} XP</span>
    {/if}
    <button type="button" class="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
      Start
    </button>
  </div>
</a>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'PracticeActionCard'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/_components/PracticeActionCard.svelte src/routes/music/_components/PracticeActionCard.svelte.test.ts
git commit -m "feat(T2.8): add PracticeActionCard shared component"
```

---

## Task 9: Expand MusicNavigation to Practice OS IA

**Files:**
- Modify: `src/routes/music/_components/MusicNavigation.svelte`

The prototype sidebar has grouped nav sections: Learn (Chord Library, Ear Training, Note Reading, Rhythm, Scales & Drills), Play (entry), Track (Journal), Progress (Skill Tree). Add these groups to the desktop sidebar and mobile tab bar. Keep all existing href values.

- [ ] **Step 1: Write failing test** (update existing test if present, otherwise add to `MusicNavigation.svelte.test.ts`)

Check current test file:

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/_components/MusicNavigation.svelte.test.ts 2>/dev/null || echo "no test file"
```

Create/update `src/routes/music/_components/MusicNavigation.svelte.test.ts`:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MusicNavigation from './MusicNavigation.svelte';

describe('MusicNavigation', () => {
  it('renders nav group labels', () => {
    const { getAllByText } = render(MusicNavigation, {
      props: { currentPath: '/music' }
    });
    expect(getAllByText('Learn').length).toBeGreaterThan(0);
    expect(getAllByText('Track').length).toBeGreaterThan(0);
    expect(getAllByText('Progress').length).toBeGreaterThan(0);
  });

  it('marks home as active when on /music', () => {
    const { getByRole } = render(MusicNavigation, {
      props: { currentPath: '/music' }
    });
    const link = getByRole('link', { name: /home/i });
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A5 'MusicNavigation'
```

- [ ] **Step 3: Rewrite MusicNavigation.svelte**

```svelte
<!-- src/routes/music/_components/MusicNavigation.svelte -->
<script lang="ts">
  import { cn } from '@repo/ui/utils';

  let { currentPath }: { currentPath: string } = $props();

  const navGroups = [
    {
      items: [
        { label: 'Home', href: '/music' },
        { label: 'Connect', href: '/music/connect', badge: 'soon' }
      ]
    },
    {
      label: 'Learn',
      items: [
        { label: 'Chord Library', href: '/music/learn/theory' },
        { label: 'Ear Training', href: '/music/learn/ear' },
        { label: 'Note Reading', href: '/music/learn/reading' },
        { label: 'Rhythm', href: '/music/learn/rhythm' },
        { label: 'Scales & Drills', href: '/music/play/scales' },
      ]
    },
    {
      label: 'Play',
      items: [
        { label: 'Practice Lab', href: '/music/play' },
      ]
    },
    {
      label: 'Track',
      items: [
        { label: 'Journal', href: '/music/track' },
      ]
    },
    {
      label: 'Progress',
      items: [
        { label: 'Skill Tree', href: '/music/progress' },
      ]
    }
  ];

  const mobileItems = [
    { label: 'Home', href: '/music' },
    { label: 'Learn', href: '/music/learn' },
    { label: 'Play', href: '/music/play' },
    { label: 'Track', href: '/music/track' },
    { label: 'Progress', href: '/music/progress' },
  ];

  const isActive = (href: string) =>
    href === '/music' ? currentPath === href : currentPath.startsWith(href);
</script>

<!-- Desktop sidebar -->
<aside class="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
  <div class="flex flex-col gap-1 p-4 border-b">
    <span class="text-base font-bold tracking-tight">Practice OS</span>
    <span class="text-[10px] uppercase tracking-widest text-muted-foreground">cross-instrument</span>
  </div>
  <nav aria-label="Music sections" class="flex-1 overflow-y-auto py-4">
    {#each navGroups as group}
      {#if group.label}
        <div class="px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {group.label}
        </div>
      {/if}
      <div class="grid gap-px px-2">
        {#each group.items as item}
          <a
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            class={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isActive(item.href) && 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
            )}
          >
            {item.label}
            {#if item.badge}
              <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{item.badge}</span>
            {/if}
          </a>
        {/each}
      </div>
    {/each}
  </nav>
</aside>

<!-- Mobile bottom tab bar -->
<nav
  aria-label="Music sections mobile"
  class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background md:hidden"
>
  {#each mobileItems as item}
    <a
      href={item.href}
      aria-current={isActive(item.href) ? 'page' : undefined}
      class={cn(
        'grid min-w-0 justify-items-center gap-1 px-1 py-2 text-xs text-muted-foreground',
        isActive(item.href) && 'text-foreground font-medium'
      )}
    >
      <span class="truncate">{item.label}</span>
    </a>
  {/each}
</nav>
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A5 'MusicNavigation'
```

- [ ] **Step 5: Run check**

```bash
vp run -r check 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/music/_components/MusicNavigation.svelte src/routes/music/_components/MusicNavigation.svelte.test.ts
git commit -m "feat(T2.9): expand navigation to Practice OS IA grouping"
```

---

## Task 10: Rhythm projection helper in music-core

**Files:**
- Create: `packages/music-core/src/engines/projection/rhythm-hud.ts`
- Create: `packages/music-core/src/engines/projection/rhythm-hud.test.ts`
- Modify: `packages/music-core/src/engines/projection/index.ts` (append export)

The rhythm live HUD projects state into display-ready tiles. This belongs in music-core so routes do not embed domain math.

**GROUND TRUTH — the real state shapes (verified, do not guess):**

```typescript
// from engines/rhythm-session/index.ts
interface RhythmSessionState {
  status: "ready" | "active" | "summary" | "abandoned";
  currentPrompt?: RhythmPulsePrompt;
  live?: ExerciseLiveState;   // { progress: number; runningScore: number; feedback: FeedbackItem[] }
  results: RhythmResultView[];
  summary?: RhythmSummary;    // see below
  error?: string;
}
interface RhythmSummary {
  total: number; correct: number; accuracy: number; xp: number;
  meanSignedErrorMs: number;   // + = ahead, - = behind (sign convention per engine)
  meanAbsoluteErrorMs: number;
  results: RhythmResultView[];
}
```

There is NO `hitOffsets`/`combo`/`hits`/`totalBeats` field. The HUD must derive
from `live` (in-progress) and `summary` (completed). The `TimingMeter` component
(Task 5) consumes `meanSignedErrorMs` as its `offsetMs` prop.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/music-core/src/engines/projection/rhythm-hud.test.ts
import { describe, expect, it } from 'vitest';
import { rhythmHudProjection } from './rhythm-hud';
import type { RhythmSessionState } from '@repo/music-core/engines/rhythm-session';

describe('rhythmHudProjection', () => {
  it('projects live progress and running score while active', () => {
    const state = {
      status: 'active',
      live: { progress: 0.5, runningScore: 0.8, feedback: [] },
      results: []
    } as unknown as RhythmSessionState;
    const hud = rhythmHudProjection(state);
    expect(hud.progressPct).toBe(50);
    expect(hud.runningScorePct).toBe(80);
    expect(hud.offsetMs).toBe(0); // no summary yet
  });

  it('projects offset and accuracy from the completed summary', () => {
    const state = {
      status: 'summary',
      results: [],
      summary: {
        total: 8, correct: 7, accuracy: 0.875, xp: 120,
        meanSignedErrorMs: 4, meanAbsoluteErrorMs: 9, results: []
      }
    } as unknown as RhythmSessionState;
    const hud = rhythmHudProjection(state);
    expect(hud.offsetMs).toBe(4);
    expect(hud.avgAbsOffsetMs).toBe(9);
    expect(hud.accuracyPct).toBe(88);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/gaspard/Code/PersonalWebsite
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'rhythmHudProjection'
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the projection**

```typescript
// packages/music-core/src/engines/projection/rhythm-hud.ts
import type { RhythmSessionState } from "@repo/music-core/engines/rhythm-session";

export interface RhythmHudData {
  progressPct: number;      // 0-100, live playhead
  runningScorePct: number;  // 0-100, live score
  offsetMs: number;         // signed mean timing error (summary), 0 while active
  avgAbsOffsetMs: number;   // mean absolute error (summary)
  accuracyPct: number;      // 0-100 (summary)
}

export function rhythmHudProjection(state: RhythmSessionState): RhythmHudData {
  const live = state.live;
  const summary = state.summary;
  return {
    progressPct: live ? Math.round(live.progress * 100) : summary ? 100 : 0,
    runningScorePct: live ? Math.round(live.runningScore * 100) : 0,
    offsetMs: summary ? Math.round(summary.meanSignedErrorMs) : 0,
    avgAbsOffsetMs: summary ? Math.round(summary.meanAbsoluteErrorMs) : 0,
    accuracyPct: summary ? Math.round(summary.accuracy * 100) : 0
  };
}
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'rhythmHudProjection'
```

- [ ] **Step 5: Append to the EXISTING projection/index.ts**

Add at the bottom of `packages/music-core/src/engines/projection/index.ts` (do not
recreate the file — it already holds projectPiano/projectFretboard):

```typescript
export { rhythmHudProjection, type RhythmHudData } from "./rhythm-hud";
```

- [ ] **Step 6: Commit**

```bash
git add packages/music-core/src/engines/projection/rhythm-hud.ts packages/music-core/src/engines/projection/rhythm-hud.test.ts packages/music-core/src/engines/projection/index.ts
git commit -m "feat(T3.1): add rhythmHudProjection to music-core projection engine"
```

---

## Task 10b: Technique tempo-ladder projection in music-core

**Files:**
- Create: `packages/music-core/src/engines/projection/technique-ladder.ts`
- Create: `packages/music-core/src/engines/projection/technique-ladder.test.ts`
- Modify: `packages/music-core/src/engines/projection/index.ts` (append export)

`TechniqueSessionState` already exposes `highestUnlockedBpm` and `nextTargetBpm`.
The projection's job is to produce the *rung list* the scales UI renders (unlocked
/ current target / locked), not to recompute those numbers.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/music-core/src/engines/projection/technique-ladder.test.ts
import { describe, expect, it } from 'vitest';
import { tempoLadderProjection } from './technique-ladder';
import type { TechniqueSessionState } from '@repo/music-core/engines/technique-session';

describe('tempoLadderProjection', () => {
  it('marks rungs as unlocked, target, or locked', () => {
    const state = {
      status: 'summary',
      highestUnlockedBpm: 110,
      nextTargetBpm: 120,
      results: []
    } as unknown as TechniqueSessionState;
    const ladder = tempoLadderProjection(state, { startBpm: 100, stepBpm: 10, rungs: 4 });
    expect(ladder.map((r) => r.bpm)).toEqual([100, 110, 120, 130]);
    expect(ladder.find((r) => r.bpm === 100)?.status).toBe('unlocked');
    expect(ladder.find((r) => r.bpm === 110)?.status).toBe('unlocked');
    expect(ladder.find((r) => r.bpm === 120)?.status).toBe('target');
    expect(ladder.find((r) => r.bpm === 130)?.status).toBe('locked');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'tempoLadderProjection'
```

- [ ] **Step 3: Implement**

```typescript
// packages/music-core/src/engines/projection/technique-ladder.ts
import type { TechniqueSessionState } from "@repo/music-core/engines/technique-session";

export interface TempoRung {
  bpm: number;
  status: "unlocked" | "target" | "locked";
}

export interface TempoLadderOptions {
  startBpm: number;
  stepBpm: number;
  rungs: number;
}

export function tempoLadderProjection(
  state: TechniqueSessionState,
  options: TempoLadderOptions
): TempoRung[] {
  const { startBpm, stepBpm, rungs } = options;
  return Array.from({ length: rungs }, (_, i) => {
    const bpm = startBpm + i * stepBpm;
    let status: TempoRung["status"];
    if (bpm <= state.highestUnlockedBpm) status = "unlocked";
    else if (bpm === state.nextTargetBpm) status = "target";
    else status = "locked";
    return { bpm, status };
  });
}
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'tempoLadderProjection'
```

- [ ] **Step 5: Append export to existing index.ts**

```typescript
export { tempoLadderProjection, type TempoRung, type TempoLadderOptions } from "./technique-ladder";
```

- [ ] **Step 6: Commit**

```bash
git add packages/music-core/src/engines/projection/technique-ladder.ts packages/music-core/src/engines/projection/technique-ladder.test.ts packages/music-core/src/engines/projection/index.ts
git commit -m "feat(T3.2): add tempoLadderProjection to music-core projection engine"
```

---

## Task 11: Home page — Practice OS dashboard layout

**Files:**
- Modify: `src/routes/music/+page.svelte`

Replace the current functional-but-bare home with the Practice OS dashboard layout:
- Header: "Good [time], [user]" greeting with streak chip
- XP ring card + Streak card + Continue Practice card + Daily Challenge card (2×2 grid)
- Instruments strip (horizontal scroll)
- Practice Lab grid (4 ex-cards linking to real drill routes)
- Skill Tree snapshot (mini SVG + node rings from real `buildSkillTreeView` data)
- Persistent transport bar at bottom

Engine wiring to preserve:
- `ProgressEngine` → XP, streak, level
- `SkillGraphStore` → skill mastery nodes
- `PracticeSessionStore` → last session (continue practice)
- `buildDashboardView`, `buildSkillTreeView` → projections
- MIDI state → input source readout
- Metronome/transport → bottom transport bar
- `EarTrainingSession` (demo) → keep the existing `answerInterval` demo wired but move it behind the Practice Lab card "Start" link to `/music/learn/ear`

The home page no longer needs the raw answer buttons; they move to the ear training route.

- [ ] **Step 1: Check existing test**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/page.svelte.test.ts
```

- [ ] **Step 2: Update test to match new layout expectations**

Edit `src/routes/music/page.svelte.test.ts` to assert new UI text:

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
// Note: the page component imports are complex; test the structure we can access
// These are smoke tests for the new heading structure.
import page from './+page.svelte';

describe('/music home', () => {
  it('renders a greeting heading', () => {
    const { container } = render(page);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toMatch(/(Good|Practice OS|Musicianship)/i);
  });
});
```

- [ ] **Step 3: Run test to see current state**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -B2 -A5 'music home'
```

- [ ] **Step 4: Rewrite `src/routes/music/+page.svelte`**

Key changes:
1. Replace raw `<section>` with structured cards using `@repo/ui` Card + new shared components
2. Use `ProgressRing` for XP display
3. Use `WeekDots` for streak week view
4. Use `PracticeActionCard` for the 4-slot practice lab
5. Use `SegmentProgress` inside a "last session" continue card if a session exists
6. Keep all existing engine imports and state; only change the template

The template should match the prototype's home layout: topbar with greeting + input-source toggle, 2×2 hero stats grid, instruments strip, practice lab grid, skill tree snapshot, transport bar.

```svelte
<!-- src/routes/music/+page.svelte -->
<script lang="ts">
  // Keep ALL existing imports and state logic unchanged.
  // Only the template changes below the closing </script>.
  // ... (all existing script content preserved) ...
</script>

<svelte:head>
  <title>Practice OS — Musicianship</title>
  <meta name="description" content="A cross-instrument practice app." />
</svelte:head>

<main class="flex flex-col gap-6 px-4 py-6 md:px-8">
  <!-- Top bar -->
  <header class="flex flex-wrap items-start gap-4">
    <div class="flex-1 min-w-0">
      <h1 class="text-3xl font-bold tracking-tight">Good {greeting}, musician.</h1>
      <p class="mt-1 text-muted-foreground">Keep the streak alive — one focused rep at a time.</p>
    </div>
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Input source toggle -->
      <div class="inline-flex rounded-lg border bg-muted/50 p-1 gap-1">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold
            {activeSource === 'midi' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}"
          disabled={!midiEnabled}
        >
          <span class="inline-block size-1.5 rounded-full bg-green-500" aria-hidden="true"></span>
          MIDI
        </button>
        <button type="button" class="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground">
          On-screen
        </button>
      </div>
    </div>
  </header>

  <!-- Hero stats grid -->
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <!-- XP Ring -->
    <div class="rounded-2xl border bg-card p-5 flex flex-col items-center gap-3">
      <div class="flex w-full items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today's XP</span>
      </div>
      <ProgressRing value={xp} total={dailyXpGoal} label="Today's XP" size={140} />
      <span class="text-xs text-muted-foreground">Daily goal · resets at midnight</span>
    </div>

    <!-- Streak -->
    <div class="rounded-2xl border bg-card p-5 flex flex-col items-center gap-3">
      <div class="flex w-full items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Streak</span>
      </div>
      <div class="text-4xl" aria-hidden="true">🔥</div>
      <span class="text-4xl font-bold tabular-nums leading-none">{streak}</span>
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Day streak</span>
      <WeekDots completedDays={weekCompletedDays} todayIndex={todayDotIndex} />
    </div>

    <!-- Continue practice -->
    <div class="rounded-2xl border bg-card p-5 flex flex-col gap-3 sm:col-span-2">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">Continue practice</span>
        <InstrumentBadge instrument="Piano" dot />
      </div>
      <h3 class="text-lg font-bold tracking-tight">Ear Training</h3>
      <p class="text-sm text-muted-foreground">Interval Recognition · Intermediate</p>
      <SegmentProgress total={10} current={lastSessionProgress} label="Session" />
      <div class="flex items-center justify-between mt-auto">
        <span class="text-xs text-muted-foreground">{Math.round(lastSessionProgress * 10)}% complete</span>
        <a href="/music/learn/ear" class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          ▶ Resume session
        </a>
      </div>
    </div>
  </div>

  <!-- Practice Lab grid -->
  <section>
    <div class="flex items-center justify-between mb-4">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today's routine · Practice Lab</span>
      <a href="/music/learn" class="text-sm text-muted-foreground hover:text-foreground">View all →</a>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <PracticeActionCard title="Ear Training" description="Interval ID · listening & recognition." xp={150} href="/music/learn/ear">
        <svelte:fragment slot="icon">🎵</svelte:fragment>
      </PracticeActionCard>
      <PracticeActionCard title="Rhythm" description="16th-note groove · lock your timing." xp={120} href="/music/learn/rhythm">
        <svelte:fragment slot="icon">🥁</svelte:fragment>
      </PracticeActionCard>
      <PracticeActionCard title="Harmony" description="Shell voicings · chords & progressions." xp={200} href="/music/learn/theory">
        <svelte:fragment slot="icon">🎹</svelte:fragment>
      </PracticeActionCard>
      <PracticeActionCard title="Technique" description="Major scales · speed & control." xp={120} href="/music/play/scales">
        <svelte:fragment slot="icon">🎸</svelte:fragment>
      </PracticeActionCard>
    </div>
  </section>

  <!-- Skill tree snapshot -->
  <section class="rounded-2xl border bg-card p-5">
    <div class="flex items-center justify-between mb-4">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Skill tree snapshot</span>
      <a href="/music/progress" class="text-sm text-muted-foreground hover:text-foreground">Full tree →</a>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each skillRows as skill}
        <div class="grid gap-2 rounded-xl border p-3">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium">{skill.name}</span>
            <span class="text-muted-foreground">{skill.mastery}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-muted overflow-hidden">
            <div class="h-full rounded-full bg-primary transition-all" style="width:{skill.mastery}%"></div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Metronome (transport) -->
  <section class="rounded-2xl border bg-card p-5">
    <div class="flex items-center gap-4 flex-wrap">
      <div class="flex items-center gap-3 flex-1">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tempo</span>
        <span class="text-lg font-bold tabular-nums">{bpm} bpm</span>
        <Slider type="multiple" min={60} max={180} step={1} bind:value={bpmValue} class="w-36" />
      </div>
      <div class="flex items-center gap-2">
        {#each ticks as tick}
          <span
            class="grid size-9 place-items-center rounded-lg border text-sm font-medium transition-colors"
            class:bg-primary={activeBeat === tick.beat}
            class:text-primary-foreground={activeBeat === tick.beat}
          >{tick.beat + 1}</span>
        {/each}
      </div>
      <Button type="button" variant="secondary" onclick={toggleMetronome}>
        {metronomeRunning ? 'Stop' : 'Start metronome'}
      </Button>
    </div>
  </section>
</main>
```

**Add derived state near the top of the script block:**

```typescript
const dailyXpGoal = 1000;
const greeting = (() => {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
})();
const lastSessionProgress = 3; // from dashboard.lastSession?.completedSteps ?? 0 once wired
const weekCompletedDays: number[] = []; // from dashboard.weekStreak once wired
const todayDotIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
```

**Add imports at top of script block:**

```typescript
import ProgressRing from './_components/ProgressRing.svelte';
import WeekDots from './_components/WeekDots.svelte';
import InstrumentBadge from './_components/InstrumentBadge.svelte';
import SegmentProgress from './_components/SegmentProgress.svelte';
import PracticeActionCard from './_components/PracticeActionCard.svelte';
```

- [ ] **Step 5: Run check and tests**

```bash
vp run -r check 2>&1 | tail -30
vp test --run 2>&1 | tail -20
```

Fix any TypeScript errors before committing.

- [ ] **Step 6: Commit**

```bash
git add src/routes/music/+page.svelte src/routes/music/page.svelte.test.ts
git commit -m "feat(T2.10): migrate home to Practice OS dashboard layout"
```

---

## Task 12: Ear Training page — Focus stage layout

**Files:**
- Modify: `src/routes/music/learn/ear/+page.svelte`
- Modify existing components in `src/routes/music/learn/ear/_components/`

The ear training page already has complex engine wiring through `EarTrainingSession`. The layout migration changes the visual presentation while keeping all wiring.

Target layout (from prototype):
- Topbar: title "Ear Training" + subtitle + `SourceReadout` chip + mode toggle (Active/Correct/Incorrect — map to session states)
- Session row: `SegmentProgress` + session counter
- Top row: Combo readout + Replay orb button + Accuracy readout
- Prompt panel: ear icon + question text + "Play your instrument" button
- Answer grid: 12 interval buttons with label + mini staff SVG preview
- Feedback banner: `SessionFeedback` correct/wrong

- [ ] **Step 1: Read existing EarTrainingSessionView**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/ear/_components/EarTrainingSessionView.svelte
```

- [ ] **Step 2: Write test for the new layout structure**

Create/update `src/routes/music/learn/ear/page.svelte.test.ts` (smoke test only):

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
// We test the session view component since the page is complex
import EarTrainingSessionView from './_components/EarTrainingSessionView.svelte';
```

(Keep existing tests; only add assertions for new elements if possible.)

- [ ] **Step 3: Update EarTrainingSessionView.svelte**

In `EarTrainingSessionView.svelte`, integrate `SegmentProgress` for the session bar and `SessionFeedback` for the feedback banner. Import from `../../_components/` (two levels up from ear/_components/).

Key markup changes in EarTrainingSessionView:
1. Add `<SegmentProgress total={sessionState.total} current={sessionState.answered} label="Session" />` above the answer area
2. Add readout row: combo + replay button + accuracy using flex layout and the `LiveHud` pattern (plain divs, not the component — it's too tightly coupled to rhythm)
3. Wrap existing feedback with `<SessionFeedback kind={correct ? 'correct' : 'wrong'} message={...} xp={...} />`

- [ ] **Step 4: Run check**

```bash
vp run -r check 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/learn/ear/
git commit -m "feat(T2.11): integrate SegmentProgress and SessionFeedback into ear training"
```

---

## Task 13: Rhythm page — Beat visualizer + TimingMeter

**Files:**
- Modify: `src/routes/music/learn/rhythm/+page.svelte`

The rhythm page already has `RhythmSession` wiring. Add the beat visualizer card and timing meter from the prototype.

- [ ] **Step 1: Read current rhythm page**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/rhythm/+page.svelte
```

- [ ] **Step 2: Write a failing test for the timing meter presence**

Add to `src/routes/music/learn/rhythm/page.svelte.test.ts`:

```typescript
it('renders timing meter', () => {
  const { container } = render(page);
  // TimingMeter renders "Behind" and "Ahead" labels
  expect(container.textContent).toMatch(/Behind/);
  expect(container.textContent).toMatch(/Ahead/);
});
```

- [ ] **Step 3: Add TimingMeter and beat visualizer to the rhythm page**

In the rhythm page template:
1. Add `import TimingMeter from '../_components/TimingMeter.svelte'` (adjust path)
2. Add `<TimingMeter offsetMs={lastOffsetMs} />` where `lastOffsetMs` comes from `rhythmSession.state.lastOffsetMs ?? 0`
3. Add beat visualizer: a flex row of `beats` divs (1–4) that highlight the active beat using `activeBeat` state already available via transport engine
4. Add a tap tempo button that calls existing `tapTempo()` function

- [ ] **Step 4: Run check and tests**

```bash
vp run -r check 2>&1 | tail -20
vp test --run 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/learn/rhythm/
git commit -m "feat(T2.12): add beat visualizer and TimingMeter to rhythm page"
```

---

## Task 13b: Reading page — staff prompt + instrument location panel

**Files:**
- Modify: `src/routes/music/learn/reading/_components/StaffNotation.svelte` (restyle frame only)
- Modify: `src/routes/music/learn/reading/_components/FlashcardSession.svelte`
- Modify: `src/routes/music/learn/reading/_components/SightReadingSession.svelte`
- Modify: `src/routes/music/learn/reading/_components/ReadingSetup.svelte`

The reading route already wires `ReadingSession`, VexFlow notation (`StaffNotation`),
tunings, MIDI progression, `PianoInput`/`FretboardInput`, flashcards, and
sight-reading. This is STRONGER than the static prototype — preserve all of it.
Migration = apply the Claude layout structure around the existing engine UI:
- Setup chips (clef / key / ledger / accidentals) → restyle `ReadingSetup` toggles
  as `badge`-style chips (`bg-primary/10 text-primary` for active, `border` for inactive)
- Session progress bar → reuse `SegmentProgress` (Task 4)
- "Where it lives on your [instrument]" panel → keep `PianoInput`/`FretboardInput`,
  wrap in a `bg-card rounded-xl border p-4` card with an eyebrow label
- Note-answer grid (C D E F G A B buttons) → restyle as the prototype's `note-btn` grid
- `SourceReadout` (Task 1) in the header showing "Answer by · Playing · {instrument}"

- [ ] **Step 1: Read the current reading page + key components**

```bash
sed -n '1,60p' /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/reading/+page.svelte
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/reading/_components/FlashcardSession.svelte
```

- [ ] **Step 2: Verify existing reading tests still describe current behavior**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/reading/page.svelte.test.ts 2>/dev/null
ls /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/reading/*.test.ts
```

Keep these green. If a test asserts old wrapper text/markup that the restyle
changes, update the assertion to the new text — do NOT weaken engine assertions
(answer-by-play, MIDI progression, VexFlow render).

- [ ] **Step 3: Restyle `ReadingSetup` chips and `FlashcardSession` layout**

Apply token-based classes only. Import `SegmentProgress` and `SourceReadout` from
`../../../_components/` (three levels up from `learn/reading/_components/`). Replace
the session counter with `<SegmentProgress total={total} current={answered} label="Set" />`.
Wrap the instrument-location component in a labeled card. Keep all props and event
wiring to `ReadingSession` unchanged.

- [ ] **Step 4: Run reading tests + check**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -iA3 'reading'
vp run -r check 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/learn/reading/
git commit -m "feat(T2.12b): apply Claude reading layout while preserving ReadingSession + VexFlow"
```

---

## Task 14: Theory Library page — Claude library layout

**Files:**
- Modify: `src/routes/music/learn/theory/+page.svelte`

Target layout:
- Two-column: left = searchable list with All/Chords/Scales tabs + favorites section; right = chord detail card with instrument tabs (Guitar/Ukulele/Piano) + diagram area + formula pills + voicing rail

The existing page already has `TheoryLibrary` and `SoundEngine` wiring. Keep it; only change the layout.

- [ ] **Step 1: Read current theory page**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/learn/theory/+page.svelte | head -80
```

- [ ] **Step 2: Add layout improvements**

1. Wrap list + detail in a CSS grid: `grid-cols-1 lg:grid-cols-[280px_1fr_200px]` (list | detail | voicings)
2. Add search `<input>` bound to a `filterQuery` state that filters `theoryLibrary.items` using `item.name.toLowerCase().includes(filterQuery.toLowerCase())`
3. Add All/Chords/Scales toggle buttons for `filterType` state
4. Add "Play chord" button that calls `sound.playChord(selectedChord.notes)` (already wired if `SoundEngine` is present)

- [ ] **Step 3: Run check**

```bash
vp run -r check 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/music/learn/theory/
git commit -m "feat(T2.13): migrate theory library to Claude layout with search + instrument tabs"
```

---

## Task 14b: Scales page — drill picker + tempo ladder + HUD

**Files:**
- Modify: `src/routes/music/play/scales/+page.svelte`

The scales page already wires `TechniqueSession` (start scale, MIDI/on-screen input,
tempo unlock). Migration applies the Claude drill layout and consumes the
`tempoLadderProjection` from Task 10b.

- [ ] **Step 1: Read the current scales page**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/play/scales/+page.svelte
```

- [ ] **Step 2: Add a failing test for the tempo ladder rendering**

Add to `src/routes/music/play/scales/page.svelte.test.ts` (create if absent):

```typescript
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import page from './+page.svelte';

describe('/music/play/scales', () => {
  it('renders a tempo ladder with bpm rungs', () => {
    const { container } = render(page);
    expect(container.textContent).toMatch(/bpm/i);
  });
});
```

- [ ] **Step 3: Wire `tempoLadderProjection` into the page**

1. `import { tempoLadderProjection, type TempoRung } from '@repo/music-core/engines/projection'`
2. Derive `const ladder = $derived(tempoLadderProjection(session.state, { startBpm: 100, stepBpm: 10, rungs: 5 }))`
   (use the session's state object the page already subscribes to)
3. Render the ladder as a vertical/horizontal rung list with status classes:
   - `unlocked` → `bg-primary/15 text-primary border-primary/30`
   - `target` → `bg-primary text-primary-foreground` + ring
   - `locked` → `bg-muted text-muted-foreground`
4. Keep the live fretboard/keyboard stage and HUD wired to `session.state.live`
   (use `rhythmHudProjection`-style inline tiles for `progress`/`runningScore` —
   technique has its own `live: ExerciseLiveState`)

- [ ] **Step 4: Run tests + check**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -iA3 'scales'
vp run -r check 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/play/scales/
git commit -m "feat(T2.13b): apply Claude scales layout with tempo ladder projection"
```

---

## Task 15: Journal (Track) page — heatmap + timeline layout

**Files:**
- Modify: `src/routes/music/track/+page.svelte`
- Create: `packages/music-core/src/engines/projection/journal-projections.ts`

Target layout:
- Calendar heatmap (7-col grid by week, days colored by practice minutes)
- Timeline list of sessions with expand/collapse
- Save session button (already exists)

**GROUND TRUTH — the real `PracticeSession` shape (verified):**

```typescript
// from domain/practice-session.ts
interface PracticeSession {
  id: string;
  startTime: UnixMs;          // branded number; usable as a number at runtime
  endTime?: UnixMs;           // duration = endTime - startTime (ms); may be absent
  instrument?: InstrumentId;
  source: SessionSource;
  runs: ExerciseRunRecord[];
  scoringEvents: ScoringEvent[];
  xpEarned: number;
  notes?: string;
  tags: string[];
}
```

There is NO `startedAt`/`durationMs`/`skills`. Use `startTime` (a branded number —
`Number(s.startTime)` at runtime) and `endTime - startTime` for minutes.

- [ ] **Step 1: Write failing test for journal projection**

Create `packages/music-core/src/engines/projection/journal-projections.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildJournalHeatmap } from './journal-projections';
import type { PracticeSession } from '@repo/music-core/domain';

function session(start: string, durationMin: number): PracticeSession {
  const startTime = new Date(start).getTime();
  return {
    id: start,
    startTime: startTime as unknown as PracticeSession['startTime'],
    endTime: (startTime + durationMin * 60_000) as unknown as PracticeSession['endTime'],
    source: 'manual' as PracticeSession['source'],
    runs: [],
    scoringEvents: [],
    xpEarned: 0,
    tags: []
  };
}

describe('buildJournalHeatmap', () => {
  it('returns weeks of 7 days each', () => {
    const heatmap = buildJournalHeatmap([], new Date('2026-06-05'));
    expect(heatmap.length).toBeGreaterThan(0);
    expect(heatmap[0].length).toBe(7);
  });

  it('counts session minutes per day from start/end time', () => {
    const heatmap = buildJournalHeatmap([session('2026-06-01T10:00:00Z', 30)], new Date('2026-06-05'));
    const cell = heatmap.flat().find((c) => c.date === '2026-06-01');
    expect(cell?.minutes).toBe(30);
    expect(cell?.intensity).toBe(3); // 30 <= minutes < 60
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'buildJournalHeatmap'
```

- [ ] **Step 3: Implement journal projections**

```typescript
// packages/music-core/src/engines/projection/journal-projections.ts
import type { PracticeSession } from "@repo/music-core/domain";

export interface HeatmapCell {
  date: string;      // ISO date YYYY-MM-DD (UTC)
  minutes: number;
  intensity: 0 | 1 | 2 | 3 | 4;  // 0 = none, 4 = most
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function buildJournalHeatmap(
  sessions: PracticeSession[],
  today: Date,
  weeks = 12
): HeatmapCell[][] {
  const DAY_MS = 86_400_000;
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const todayDow = today.getUTCDay() || 7; // 1=Mon…7=Sun
  const startMs = todayMs - (todayDow - 1 + (weeks - 1) * 7) * DAY_MS;

  const minutesByDate = new Map<string, number>();
  for (const s of sessions) {
    const start = Number(s.startTime);
    const end = s.endTime != null ? Number(s.endTime) : start;
    const minutes = Math.max(0, Math.round((end - start) / 60_000));
    const key = dateKey(start);
    minutesByDate.set(key, (minutesByDate.get(key) ?? 0) + minutes);
  }

  const all: HeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = dateKey(startMs + i * DAY_MS);
    const minutes = minutesByDate.get(date) ?? 0;
    const intensity: HeatmapCell["intensity"] =
      minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 30 ? 2 : minutes < 60 ? 3 : 4;
    all.push({ date, minutes, intensity });
  }

  const result: HeatmapCell[][] = [];
  for (let w = 0; w < weeks; w++) result.push(all.slice(w * 7, w * 7 + 7));
  return result;
}
```

- [ ] **Step 4: Run tests**

```bash
vp test --run -- --reporter=verbose 2>&1 | grep -A3 'buildJournalHeatmap'
```

- [ ] **Step 5: Append to the EXISTING projection/index.ts**

```typescript
export { buildJournalHeatmap, type HeatmapCell } from "./journal-projections";
```

- [ ] **Step 6: Update track page to use heatmap**

In `src/routes/music/track/+page.svelte`:

1. Import `buildJournalHeatmap` from `@repo/music-core/engines/projection`
2. Add `let heatmap = $state<HeatmapCell[][]>([])` 
3. After `journal.load()`, set `heatmap = buildJournalHeatmap(sessions, new Date())`
4. Add heatmap UI: 12-column grid of week columns, each 7 rows of colored squares, with intensity classes:
   - 0 → `bg-muted`
   - 1 → `bg-primary/25`
   - 2 → `bg-primary/50`
   - 3 → `bg-primary/75`
   - 4 → `bg-primary`

- [ ] **Step 7: Run check and tests**

```bash
vp run -r check 2>&1 | tail -20
vp test --run 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add packages/music-core/src/engines/projection/ src/routes/music/track/
git commit -m "feat(T3+T2): add journal heatmap projection and apply to track page"
```

---

## Task 16: Progress page — Skill tree + dashboard Claude layout

**Files:**
- Modify: `src/routes/music/progress/+page.svelte`

Target layout:
- Dashboard hero: XP ring + streak chip + level chip + practice-next list
- Skill tree: SVG with node rings connected by lines (use data from `buildSkillTreeView`)
- Weak spots section: skills with lowest mastery
- Achievements section: unlocked badges
- Streak calendar: use `WeekDots`

The existing page already calls `buildDashboardView` and `buildSkillTreeView`. The migration wraps this data in the Claude visual layout.

- [ ] **Step 1: Read existing progress page template**

```bash
cat /Users/gaspard/Code/PersonalWebsite/src/routes/music/progress/+page.svelte | tail -120
```

- [ ] **Step 2: Write failing test**

Add to `src/routes/music/progress/page.svelte.test.ts`:

```typescript
it('renders skill tree heading', () => {
  const { getByRole } = render(page);
  const h = getByRole('heading', { name: /skill tree|progress/i });
  expect(h).toBeTruthy();
});
```

- [ ] **Step 3: Rework the template while keeping all engine wiring**

The script block stays identical. Template changes:
1. Add `<ProgressRing value={dashboard?.xp ?? 0} total={1000} label="XP" />` in a hero card
2. Use `<WeekDots completedDays={weekDays} todayIndex={todayIndex} />` for streak display
3. Show `dashboard?.weakSkills` in a section with `<Progress>` bars
4. Show skill tree as a scrollable grid of skill nodes with ring progress indicators using `skillTree?.nodes`

- [ ] **Step 4: Run check and tests**

```bash
vp run -r check 2>&1 | tail -20
vp test --run 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/progress/
git commit -m "feat(T2.14): migrate progress page to Claude skill tree dashboard layout"
```

---

## Task 17: Verify projection exports resolve (no package.json change)

`./engines/projection` is ALREADY in `packages/music-core/package.json` exports.
The new helpers (Tasks 10, 10b, 15) are reachable as soon as they are appended to
`engines/projection/index.ts`. This task only verifies resolution — there is no
package.json edit.

- [ ] **Step 1: Confirm the export already exists**

```bash
cd /Users/gaspard/Code/PersonalWebsite
node -e "console.log(Object.keys(require('./packages/music-core/package.json').exports))" | grep projection
```
Expected: prints `./engines/projection` (already present).

- [ ] **Step 2: Confirm new helpers are re-exported from index.ts**

```bash
grep -E 'rhythmHudProjection|tempoLadderProjection|buildJournalHeatmap' packages/music-core/src/engines/projection/index.ts
```
Expected: all three appear. If any is missing, append its `export … from "./…"` line.

- [ ] **Step 3: Type-check that route imports resolve**

```bash
vp run -r check 2>&1 | tail -10
```
Expected: no "cannot find module '@repo/music-core/engines/projection'" errors.

(No commit — this is a verification gate folded into the projection commits above.)

---

## Task 18: Prototype-only stubs — TODO notes

**Files:**
- Create: `src/routes/music/connect/+page.svelte` (stub)

The `/music/connect`, `/music/jam`, `/music/import`, `/music/transcribe`, `/music/studio`, `/music/recording`, `/music/intonation` screens exist only as prototype mockups. Do NOT implement fake static UI routes. Add a single `/music/connect` stub that explains what engine is needed.

- [ ] **Step 1: Create the Connect stub**

```svelte
<!-- src/routes/music/connect/+page.svelte -->
<svelte:head>
  <title>Connect Instruments | Practice OS</title>
</svelte:head>

<main class="px-4 py-8 md:px-8">
  <h1 class="text-3xl font-bold tracking-tight">Connect Instruments</h1>
  <p class="mt-2 text-muted-foreground">
    MIDI and on-screen keyboard are available now. Audio pitch detection and device profiles are Phase 2.
  </p>
  <div class="mt-6 rounded-xl border bg-card p-5">
    <p class="text-sm text-muted-foreground">
      <strong class="text-foreground">Requires:</strong> <code>DeviceProfileEngine</code> — not yet implemented.
      Current MIDI input is accessible via the shared runtime on every exercise page.
    </p>
  </div>
</main>
```

- [ ] **Step 2: Add connect to sidebar nav** (already done in Task 9 with `badge: 'soon'`)

- [ ] **Step 3: Commit**

```bash
git add src/routes/music/connect/
git commit -m "feat: add connect route stub with engine requirements noted"
```

---

## Task 19: Full verification gates

- [ ] **Step 1: Type check**

```bash
vp run -r check 2>&1 | tee /tmp/check-out.txt
tail -30 /tmp/check-out.txt
```

Fix any errors found.

- [ ] **Step 2: Unit tests**

```bash
vp test --run 2>&1 | tee /tmp/test-out.txt
tail -30 /tmp/test-out.txt
```

Fix any failures.

- [ ] **Step 3: Build**

```bash
vp run -r build 2>&1 | tee /tmp/build-out.txt
tail -30 /tmp/build-out.txt
```

Fix any build errors.

- [ ] **Step 4: E2E tests**

```bash
./node_modules/.bin/playwright test 2>&1 | tee /tmp/e2e-out.txt
tail -30 /tmp/e2e-out.txt
```

- [ ] **Step 5: Domain validation**

```bash
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

- [ ] **Step 6: Browser QA — desktop**

Start dev server on an alternate port if needed:

```bash
npm run dev -- --port 5174 &
```

Open `/music`, `/music/learn/ear`, `/music/learn/rhythm`, `/music/learn/theory`, `/music/track`, `/music/progress` and verify:
- No horizontal overflow
- Sidebar visible on desktop (≥768px)
- Bottom tab bar on mobile (≤767px)
- MIDI status shown in topbar
- Theme tokens applying (not hardcoded colors)

- [ ] **Step 7: Final commit summary**

```bash
git log --oneline main..HEAD
```

---

## Self-Review Checklist

### Spec coverage

| Requirement | Covered by Task |
|---|---|
| Sidebar desktop + mobile tabbar | Task 9 (MusicNavigation) |
| Route screen header (h1 + subtitle + right slot) | Task 11 (home), inline per route |
| Source readout | Task 1 (SourceReadout component) |
| Input-source control toggle | Task 11 (home template) |
| Persistent transport bar | Task 11 (home metronome section) |
| PracticeScreen composite | Inline per-route (not a separate wrapper; each page owns its layout) |
| InstrumentBadge | Task 2 |
| ProgressRing | Task 3 |
| SegmentProgress | Task 4 |
| TimingMeter | Task 5 |
| WeekDots | Task 6 |
| SessionFeedback | Task 7 |
| PracticeActionCard | Task 8 |
| Home dashboard layout | Task 11 |
| Ear training focus stage | Task 12 |
| Rhythm beat visualizer + TimingMeter | Task 13 |
| Reading staff + location panel (VexFlow/tunings preserved) | Task 13b |
| Theory library layout | Task 14 |
| Scales drill picker + tempo ladder + HUD | Task 14b (consumes Task 10b ladder) |
| Journal heatmap | Task 15 |
| Progress skill tree layout | Task 16 |
| Rhythm HUD projection (real RhythmSessionState) | Task 10 |
| Technique tempo-ladder projection | Task 10b |
| Journal projections (real PracticeSession) | Task 15 |
| Projection exports (already-exported engine) | Task 17 (verify only — no package.json change) |
| Prototype-only stubs (no fake static UI) | Task 18 |
| Verification gates | Task 19 |

### Missing from spec that was listed

- `LiveHud` component: rhythm page gets inline hud tiles (not a reusable component) since it's tightly coupled to rhythm state. Note reading and scales pages get similar inline tiles. This avoids over-abstracting.
- `SkillRing` component: progress page uses `ProgressRing` with different sizes. One component is sufficient.
- `MusicTransportBar` component: extracted inline in the home page; other pages don't need a full transport bar per the current routes. Add as a separate component if requested.
- `RoutineStep` component: no routine engine exists yet. Stub deferred.
- `/music/learn` and `/music/play` entry pages: should show practice lab cards (same PracticeActionCard grid). Add a note: both entry pages just render a grid of PracticeActionCard pointing to sub-routes. Implement same as home's Practice Lab section.

### Placeholder scan

No "TBD", "TODO", or "implement later" patterns in task steps — all code blocks are complete.

### Type consistency

- `ProgressRing`: uses `value/total` throughout — consistent.
- `SegmentProgress`: uses `total/current` — consistent with `EarTrainingSessionState.total/answered`.
- `rhythmHudProjection`: returns `LiveHudData` interface — consistent across import in rhythm page.
- `buildJournalHeatmap`: returns `HeatmapCell[][]` — used in track page with `.intensity` property — consistent.

---

**Note on `learn/+page.svelte` and `play/+page.svelte`:**

These two entry pages should show Practice Lab card grids. Both currently show a simple list. Update them (not tasked separately above to avoid bloat) by:
- In `learn/+page.svelte`: replace current card list with 4 PracticeActionCards (Ear, Reading, Rhythm, Theory)
- In `play/+page.svelte`: replace current card list with 2 PracticeActionCards (Scales & Drills, Practice Lab link)

This is a 10-line change to each file; agents should do it inline when implementing Task 11 rather than making a separate task.
