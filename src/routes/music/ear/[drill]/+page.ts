import { error } from "@sveltejs/kit";
import { EAR_DRILLS } from "@repo/music-core/content/ear";

export function load({ params }) {
  const def = EAR_DRILLS.find((d) => d.slug === params.drill);
  if (!def) error(404, "No such ear drill");
  return { title: def.title };
}
