// Translations for the reading and two-hand data: fields of this folder's JSON read through messages.

import readingLevelsJson from "../reading-levels.json";
import twoHandJson from "../two-hand-patterns.json";
import { localizeFields } from "../localize";

localizeFields(readingLevelsJson, "music_content_reading_level", (l) => l.id, [
  "label",
  "description",
  "rhythm",
]);
localizeFields(twoHandJson.options, "music_content_two_hand", (o) => o.id, ["label"]);
localizeFields(twoHandJson.handModes, "music_content_two_hand_mode", (o) => o.id, ["label"]);
