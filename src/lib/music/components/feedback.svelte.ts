// Transient per-note feedback with a fixed lifetime. Correct and wrong are
// moments, not state: they clear on their own (the old wrong-set only grew).
export type FlashKind = "correct" | "wrong";

export const FLASH_MS = 320;

export class Flashes<K extends string = FlashKind> {
  #map = $state<Record<number, K>>({});
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  add(key: number, kind: K, ms = FLASH_MS) {
    clearTimeout(this.#timers.get(key));
    this.#map[key] = kind;
    this.#timers.set(
      key,
      setTimeout(() => {
        delete this.#map[key];
        this.#timers.delete(key);
      }, ms),
    );
  }

  get(key: number): K | undefined {
    return this.#map[key];
  }

  clear() {
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
    this.#map = {};
  }
}

/** Visual states a surface cell can take, in paint order. */
export interface CellMarks {
  target?: boolean;
  demo?: boolean;
  /** Short label drawn on the cell (finger, degree, voice). */
  label?: string;
  /** Tone role or hand colour key. */
  role?: "chord" | "scale" | "avoid" | "left" | "right";
}

/** Keep a pressed key's pointer events on it; best-effort (throws for untracked pointers). */
export function capturePointer(e: PointerEvent) {
  try {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  } catch {
    /* synthetic or already-released pointer: the release handlers still run */
  }
}
