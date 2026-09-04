<script lang="ts" module>
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";

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
</script>

<script lang="ts">
  import { cn } from "@repo/ui/utils";

  let {
    router,
    onAccepted,
    keymap = $bindable({ ...DEFAULT_PAD_KEYS }),
  }: {
    router: InputRouter;
    onAccepted?: (event: NoteEvent) => void;
    keymap?: Record<number, string>;
  } = $props();

  let assigning = $state<number | null>(null);
  let lastHit = $state<number | null>(null);

  function trigger(midi: number): void {
    const event = router.noteOn(midi, "onscreen", "mpc");
    lastHit = midi;
    onAccepted?.(event);
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

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

    const key = event.key.toLowerCase();
    if (assigning !== null) {
      if (key === "escape") {
        assigning = null;
      } else if (key.length === 1) {
        assignKey(assigning, key);
      }
      event.preventDefault();
      return;
    }

    const pad = Object.entries(keymap).find(([, k]) => k === key);
    if (pad) {
      trigger(Number(pad[0]));
      event.preventDefault();
    }
  }

  $effect(() => {
    window.addEventListener("keydown", onWindowKeydown);
    return () => window.removeEventListener("keydown", onWindowKeydown);
  });
</script>

<div class="grid w-full grid-cols-4 gap-2" role="group" aria-label="MPC pad grid">
  {#each MPC_PAD_MIDI as row, rowIndex (rowIndex)}
    {#each row as midi (midi)}
      {@const key = keymap[midi]}
      <div class="relative">
        <button
          type="button"
          aria-label={`Pad ${midi}`}
          class={cn(
            "grid aspect-square w-full place-items-center rounded-xl border text-xs font-semibold transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            lastHit === midi
              ? "border-practice-accent bg-practice-accent text-practice-accent-foreground"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
          )}
          onclick={() => trigger(midi)}
        >
          <span class="tabular-nums opacity-70">{midi}</span>
        </button>
        <button
          type="button"
          aria-label={`Assign key for pad ${midi}`}
          class={cn(
            "absolute right-1 top-1 grid size-5 place-items-center rounded text-[0.625rem] font-bold uppercase",
            assigning === midi
              ? "bg-primary text-primary-foreground"
              : "bg-background/70 text-foreground",
          )}
          onclick={() => (assigning = assigning === midi ? null : midi)}
        >
          {assigning === midi ? "…" : (key ?? "—")}
        </button>
      </div>
    {/each}
  {/each}
</div>
{#if assigning !== null}
  <p class="mt-2 text-xs text-muted-foreground" aria-live="polite">
    Press a key to assign it to pad {assigning} (Esc to cancel).
  </p>
{/if}
