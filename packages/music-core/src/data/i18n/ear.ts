// Translations for the ear data: fields of this folder's JSON read through messages.

import cadencesJson from "../cadences-and-chord-qualities.json";
import earTrainingJson from "../ear-training.json";
import { localizeFields } from "../localize";

localizeFields(earTrainingJson.drills, "music_content_ear_data_drill", (d) => d.slug, [
  "title",
  "description",
]);
localizeFields(cadencesJson.cadences, "music_content_ear_data_cadence", (c) => c.token, ["label"]);
localizeFields(cadencesJson.chordQualities, "music_content_ear_data_quality", (q) => q.token, [
  "label",
]);
