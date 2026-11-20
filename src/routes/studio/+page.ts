import { isStudioKind, type StudioKind } from "$lib/content/studio";
import type { PageLoad } from "./$types";

// ?type=drawings filters the wall; ?view=kinds shows one card per kind instead.
export const load: PageLoad = ({ url }) => {
  const type = url.searchParams.get("type");
  return {
    type: (isStudioKind(type) ? type : "all") as StudioKind | "all",
    view: url.searchParams.get("view") === "kinds" ? ("kinds" as const) : ("wall" as const),
  };
};
