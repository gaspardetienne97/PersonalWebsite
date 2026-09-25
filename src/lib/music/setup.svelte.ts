// Drill setup that survives: URL query parameters win (paths and shared links
// land on the same setup), else the last setup used, else the defaults.
import { page } from "$app/state";
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

  constructor(drillId: string, defaults: T) {
    this.#key = `drill-setup.${drillId}`;
    const params = page.url.searchParams;
    const fromUrl: Partial<T> = {};
    for (const k of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = params.get(k);
      if (raw !== null) fromUrl[k] = coerce(raw, defaults[k]) as T[typeof k];
    }
    this.value = { ...defaults, ...fromUrl };
    if (Object.keys(fromUrl).length === 0) {
      void getSetting<Partial<T>>(this.#key, {}).then((saved) => {
        const clean: Partial<T> = {};
        for (const k of Object.keys(defaults) as (keyof T & string)[]) {
          if (saved && typeof saved[k] === typeof defaults[k]) clean[k] = saved[k];
        }
        this.value = { ...defaults, ...clean };
      });
    }
  }

  set(patch: Partial<T>) {
    this.value = { ...this.value, ...patch };
    void putSetting(this.#key, $state.snapshot(this.value));
  }

  /** Stable key for "vs last run with this setup". */
  key(...fields: (keyof T)[]) {
    return fields.map((f) => `${String(f)}=${this.value[f]}`).join("&");
  }
}
