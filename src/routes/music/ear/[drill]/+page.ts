import { error } from "@sveltejs/kit";
import { EAR_DRILLS } from "@repo/music-core/content/ear";
import { m } from "@repo/i18n/messages.js";

export function load({ params }) {
  const def = EAR_DRILLS.find((d) => d.slug === params.drill);
  if (!def) error(404, m.music_drills_earroute_not_found());
  return { title: def.title };
}
