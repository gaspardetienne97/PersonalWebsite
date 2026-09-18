<script lang="ts" module>
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";

  import { padNumber } from "./pad-labels";

  /** Bank-A pads, MPC visual order: top row is the highest notes. */
  export const MPC_PAD_MIDI: number[][] = [
    [48, 49, 50, 51],
    [44, 45, 46, 47],
    [40, 41, 42, 43],
    [36, 37, 38, 39],
  ];

  /** Default QWERTY layout mirroring the 4×4 pad grid. */
  export const DEFAULT_PAD_KEYS: Record<number, string> = {
    48: "1", 49: "2", 50: "3", 51: "4",
    44: "q", 45: "w", 46: "e", 47: "r",
    40: "a", 41: "s", 42: "d", 43: "f",
    36: "z", 37: "x", 38: "c", 39: "v",
  };

  /** A hit with no release of its own (click, MIDI without note-off) stays lit this long. */
  const FLASH_MS = 140;
</script>

<script lang="ts">
  import { monotonicMs } from "@repo/music-core/domain";
  import { cn } from "@repo/ui/utils";

  let {
    router,
    onAccepted,
    editable = false,
    keymap = $bindable({ ...DEFAULT_PAD_KEYS }),
    targetMidi,
    labels,
  }: {
    router: InputRouter;
    editable?: boolean;
    onAccepted?: (event: NoteEvent) => void;
    keymap?: Record<number, string>;
    /** The pad the exercise wants next: a ring, never a fill (fill means "you hit it"). */
    targetMidi?: number;
    /** Optional voice names per pad (kick, snare, hat) shown under the pad number. */
    labels?: Record<number, string>;
  } = $props();

  let assigning = $state<number | null>(null);

  /**
   * Pads currently down, keyed by who holds them: `key:z`, `pointer:3`,
   * `midi:38`. One pad lights while any holder remains, and every holder has a
   * release path (key-up, pointer-up/cancel, note-off, window blur, timer), so
   * a pad can never stay lit after the finger has left.
   */
  const holders = new Map<string, number>();
  let held = $state<ReadonlySet<number>>(new Set());
  const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function syncHeld(): void {
    held = new Set(holders.values());
  }

  function emit(type: "noteOn" | "noteOff", midi: number): NoteEvent | undefined {
    if (type === "noteOn") {
      const event = router.noteOn(midi, "onscreen", "mpc");
      onAccepted?.(event);
      return event;
    }
    const event: NoteEvent = {
      type: "noteOff",
      midiNote: midi,
      source: "onscreen",
      instrument: "mpc",
      timestamp: monotonicMs(performance.now()),
      clock: "performance",
    };
    router.push(event);
    return event;
  }

  function press(holder: string, midi: number, sound = true): void {
    if (holders.has(holder)) return;
    holders.set(holder, midi);
    syncHeld();
    if (sound) emit("noteOn", midi);
  }

  function release(holder: string, sound = true): void {
    const midi = holders.get(holder);
    if (midi === undefined) return;
    holders.delete(holder);
    syncHeld();
    if (sound) emit("noteOff", midi);
  }

  /** A momentary hit: lit for a beat of the eye, then released. */
  function flash(holder: string, midi: number, sound: boolean): void {
    clearTimeout(flashTimers.get(holder));
    holders.set(holder, midi);
    syncHeld();
    if (sound) emit("noteOn", midi);
    flashTimers.set(
      holder,
      setTimeout(() => {
        flashTimers.delete(holder);
        release(holder, sound);
      }, FLASH_MS),
    );
  }

  let pointerHandled = false;

  function onPadPointerDown(event: PointerEvent, midi: number): void {
    pointerHandled = true;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointer */
    }
    press(`pointer:${event.pointerId}`, midi);
  }

  function onPadClick(midi: number): void {
    // A pointer sequence already played this pad; a bare click (assistive or
    // programmatic) is one momentary hit.
    if (pointerHandled) {
      pointerHandled = false;
      return;
    }
    flash(`click:${midi}`, midi, true);
  }

  /** Rebind `midi`'s key, removing the key from any pad that already held it. */
  function assignKey(midi: number, key: string): void {
    const next: Record<number, string> = {};
    for (const [pad, existing] of Object.entries(keymap)) {
      if (existing !== key) next[Number(pad)] = existing;
    }
    next[midi] = key;
    keymap = next;
    assigning = null;
  }

  function padForKey(key: string): number | undefined {
    const pad = Object.entries(keymap).find(([, k]) => k === key);
    return pad ? Number(pad[0]) : undefined;
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

    const key = event.key.toLowerCase();
    if (editable && assigning !== null) {
      if (key === "escape") {
        assigning = null;
      } else if (key.length === 1) {
        assignKey(assigning, key);
      }
      event.preventDefault();
      return;
    }

    const pad = padForKey(key);
    if (pad === undefined) return;
    event.preventDefault();
    // Auto-repeat while held is not a new stroke.
    if (event.repeat) return;
    press(`key:${key}`, pad);
  }

  function onWindowKeyup(event: KeyboardEvent): void {
    release(`key:${event.key.toLowerCase()}`);
  }

  /** The window lost focus with a key down: its key-up will never arrive. */
  function onWindowBlur(): void {
    for (const holder of Array.from(holders.keys())) {
      if (holder.startsWith("key:") || holder.startsWith("pointer:")) release(holder);
    }
  }

  $effect(() => {
    window.addEventListener("keydown", onWindowKeydown);
    window.addEventListener("keyup", onWindowKeyup);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onWindowKeydown);
      window.removeEventListener("keyup", onWindowKeyup);
      window.removeEventListener("blur", onWindowBlur);
    };
  });

  // Hardware pads light from the router: a MIDI note-on holds the pad until
  // its note-off (or velocity-0 note-on, which the MIDI engine normalises);
  // a source that never releases falls back to the flash timer.
  $effect(() => {
    const unsubscribe = router.subscribe((event) => {
      if (event.source === "onscreen" || event.source === "click") return;
      if (event.type === "noteOn") {
        const shown = MPC_PAD_MIDI.some((row) => row.includes(event.midiNote));
        if (!shown) return;
        flash(`ext:${event.midiNote}`, event.midiNote, false);
      } else if (event.type === "noteOff") {
        clearTimeout(flashTimers.get(`ext:${event.midiNote}`));
        flashTimers.delete(`ext:${event.midiNote}`);
        release(`ext:${event.midiNote}`, false);
      }
    });
    return () => {
      unsubscribe();
      for (const timer of flashTimers.values()) clearTimeout(timer);
      flashTimers.clear();
      holders.clear();
      syncHeld();
    };
  });
</script>

<!--
  Sixteen rubber pads on a dark panel, A01 bottom-left as on the hardware. A
  lit pad means "this pad is down right now"; the target ring means "hit this
  next". The two never share a form, so a hit on the wrong pad reads at once.
-->
<div
  class="grid w-full grid-cols-4 gap-2 rounded-2xl border border-stage-line/70 bg-[color-mix(in_oklab,var(--stage-2)_70%,black)] p-2.5 shadow-[inset_0_1px_0_oklch(1_0_0/6%),inset_0_-1px_0_oklch(0_0_0/40%)] sm:gap-2.5 sm:p-3"
  role="group"
  aria-label="MPC pad grid"
>
  {#each MPC_PAD_MIDI as row, rowIndex (rowIndex)}
    {#each row as midi (midi)}
      {@const key = keymap[midi]}
      {@const down = held.has(midi)}
      {@const target = targetMidi === midi}
      <div class="relative min-w-0">
        <button
          type="button"
          aria-label={`Pad ${midi}`}
          aria-pressed={down}
          data-pad={midi}
          data-state={down ? "down" : target ? "target" : "idle"}
          class={cn(
            "relative grid aspect-square w-full touch-none select-none place-items-center rounded-[7px] border text-xs font-semibold transition-[background-color,box-shadow,transform] duration-75",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-practice-accent",
            // Rubber: a soft top light, a darker bottom edge, a hairline bevel.
            !down &&
              "border-white/10 bg-linear-to-b from-[color-mix(in_oklab,var(--stage-2)_88%,white)] to-stage-2 text-stage-muted shadow-[inset_0_1px_0_oklch(1_0_0/10%),inset_0_-3px_0_oklch(0_0_0/35%),0_1px_2px_oklch(0_0_0/40%)] hover:from-[color-mix(in_oklab,var(--stage-2)_78%,white)]",
            // Down: the LED under the rubber lights, the pad sinks.
            down &&
              "translate-y-px border-practice-accent bg-practice-accent text-practice-accent-foreground shadow-[inset_0_2px_6px_oklch(0_0_0/25%),0_0_18px_color-mix(in_oklab,var(--practice-accent)_60%,transparent)]",
            target && !down && "ring-2 ring-inset ring-practice-accent/80 text-stage-foreground",
          )}
          onpointerdown={(event) => onPadPointerDown(event, midi)}
          onpointerup={(event) => release(`pointer:${event.pointerId}`)}
          onpointercancel={(event) => {
            pointerHandled = false;
            release(`pointer:${event.pointerId}`);
          }}
          onlostpointercapture={(event) => release(`pointer:${event.pointerId}`)}
          onclick={() => onPadClick(midi)}
        >
          <span class="grid place-items-center gap-0.5 leading-none">
            <span class="font-mono text-[0.8125rem] tabular-nums sm:text-sm">{midi}</span>
            {#if labels?.[midi]}
              <span class="text-[0.625rem] font-medium opacity-80">{labels[midi]}</span>
            {/if}
          </span>
          <span
            class="pointer-events-none absolute bottom-1 left-1.5 text-[0.5625rem] font-medium tabular-nums opacity-55"
            aria-hidden="true">A{String(padNumber(midi, MPC_PAD_MIDI)).padStart(2, "0")}</span
          >
          {#if target && !down}
            <span class="sr-only">, next</span>
          {/if}
        </button>
        {#if editable}
          <button
            type="button"
            aria-label={`Assign key for pad ${midi}`}
            class={cn(
              "absolute right-1 top-1 grid size-8 place-items-center rounded-md text-[0.625rem] font-bold uppercase",
              assigning === midi
                ? "bg-primary text-primary-foreground"
                : "bg-background/70 text-foreground hover:bg-background",
            )}
            onclick={() => (assigning = assigning === midi ? null : midi)}
          >
            {assigning === midi ? "…" : (key ?? "—")}
          </button>
        {:else}
          <kbd
            class="pointer-events-none absolute right-1.5 top-1.5 rounded-[3px] border border-white/10 bg-black/25 px-1 font-mono text-[0.625rem] font-semibold uppercase leading-4 text-stage-foreground/80"
            aria-hidden="true">{key ?? "—"}</kbd
          >
        {/if}
      </div>
    {/each}
  {/each}
</div>
{#if editable && assigning !== null}
  <p class="mt-2 text-xs text-muted-foreground">
    Press a key to assign it to pad {assigning} (Esc to cancel).
  </p>
{/if}
