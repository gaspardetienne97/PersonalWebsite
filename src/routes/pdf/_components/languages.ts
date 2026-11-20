// The interface languages, each by its own name. This changes Narrator's menus
// and messages only: the voice that reads a document is a separate setting.
import type { Locale } from "@repo/i18n/runtime.js";

export const LANGUAGES: { locale: Locale; name: string }[] = [
  { locale: "en", name: "English" },
  { locale: "es", name: "Español" },
  { locale: "fr", name: "Français" },
  { locale: "ht", name: "Kreyòl ayisyen" },
];
