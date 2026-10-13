// Drill setup that survives: the defaults, then the last setup used, then the
// URL's keys on top (paths and shared links land on their setup; the rest of
// what the player chose stays). A later link to the same page applies its keys
// too, and a change to a key the URL carries is written back to the URL, so a
// reload shows what the player last picked.
import { untrack } from "svelte";
import { page } from "$app/state";
import { replaceState } from "$app/navigation";
import { getSetting, putSetting } from "./runtime";

type Scalar = string | number | boolean;

function coerce(raw: string, like: Scalar): Scalar {
  if (typeof like === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : like;
  }
  if (typeof like === "boolean") return raw === "1" || raw === "true";
  return raw;
}

export class DrillSetup<T extends Record<string, Scalar>> {
  value = $state() as T;
  #key: string;
  #defaults: T;

  constructor(drillId: string, defaults: T) {
    this.#key = `drill-setup.${drillId}`;
    this.#defaults = defaults;
    this.value = { ...defaults, ...this.#fromUrl() };
    void getSetting<Partial<T>>(this.#key, {}).then((saved) => {
      const clean: Partial<T> = {};
      for (const k of Object.keys(defaults) as (keyof T & string)[]) {
        if (saved && typeof saved[k] === typeof defaults[k]) clean[k] = saved[k];
      }
      this.value = { ...defaults, ...clean, ...this.#fromUrl() };
    });
    // Same page, new link (another mode chip): apply its keys.
    $effect(() => {
      const fromUrl = this.#fromUrl();
      if (Object.keys(fromUrl).length) untrack(() => (this.value = { ...this.value, ...fromUrl }));
    });
  }

  #fromUrl(): Partial<T> {
    const params = page.url.searchParams;
    const out: Partial<T> = {};
    for (const k of Object.keys(this.#defaults) as (keyof T & string)[]) {
      const raw = params.get(k);
      if (raw !== null) out[k] = coerce(raw, this.#defaults[k]) as T[typeof k];
    }
    return out;
  }

  set(patch: Partial<T>) {
    this.value = { ...this.value, ...patch };
    void putSetting(this.#key, $state.snapshot(this.value));
    // Keep the address in step with keys it already carries.
    const url = new URL(page.url);
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (url.searchParams.has(k) && url.searchParams.get(k) !== String(v)) {
        url.searchParams.set(k, String(v));
        changed = true;
      }
    }
    if (changed) {
      try {
        replaceState(url, page.state);
      } catch {
        // Before the router starts (tests, prerender): the setup still changed.
      }
    }
  }

  /** Stable key for "vs last run with this setup". */
  key(...fields: (keyof T)[]) {
    return fields.map((f) => `${String(f)}=${this.value[f]}`).join("&");
  }
}
