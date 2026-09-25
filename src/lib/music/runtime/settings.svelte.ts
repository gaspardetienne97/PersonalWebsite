// App settings: one reactive object persisted to the settings row `music.settings`.
import { browser } from "$app/environment";
import { DEFAULT_SETTINGS, type Settings } from "@repo/music-core";
import { getSetting, putSetting } from "./db.svelte";

const KEY = "music.settings";

let value = $state<Settings>({ ...DEFAULT_SETTINGS });
let loaded = false;
const early: Partial<Settings> = {};

function applyReduceMotion() {
  if (browser) document.documentElement.toggleAttribute("data-reduce-motion", value.reduceMotion);
}

async function load() {
  try {
    const stored = await getSetting<Partial<Settings>>(KEY, {});
    // Patches made before the row arrived win over what was stored.
    value = { ...DEFAULT_SETTINGS, ...stored, ...early };
  } catch (e) {
    console.error("Woodshed: could not read settings", e);
  }
  loaded = true;
  applyReduceMotion();
}

export const settings = {
  get value(): Settings {
    return value;
  },
  ready: browser ? load() : Promise.resolve(),
  update(patch: Partial<Settings>): Promise<void> {
    if (!loaded) Object.assign(early, patch);
    value = { ...value, ...patch };
    applyReduceMotion();
    return browser ? putSetting(KEY, value) : Promise.resolve();
  },
};
