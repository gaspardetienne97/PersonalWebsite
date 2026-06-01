import { writable, derived } from "svelte/store";
import type { AppSettings } from "$lib/types/index.js";
import { DEFAULT_SETTINGS } from "$lib/types/index.js";

const STORAGE_KEY = "finger-drumming-settings";

function loadSettings(): AppSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<AppSettings>(loadSettings());

  return {
    subscribe,
    set: (value: AppSettings) => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
      set(value);
    },
    update: (updater: (settings: AppSettings) => AppSettings) => {
      update((current) => {
        const updated = updater(current);
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
        return updated;
      });
    },
    reset: () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
      set(DEFAULT_SETTINGS);
    },
  };
}

export const settings = createSettingsStore();

// Derived stores for easy access
export const theme = derived(settings, ($s) => $s.theme);
export const timingWindows = derived(settings, ($s) => $s.timingWindows);
export const velocitySettings = derived(settings, ($s) => $s.velocitySettings);
