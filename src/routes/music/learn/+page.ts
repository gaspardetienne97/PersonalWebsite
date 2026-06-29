import { redirect } from "@sveltejs/kit";

// The "Learn" hub is replaced by Practice ▸ Drills + Paths. Its sub-routes
// (ear, reading, rhythm, theory, jazz, path, aerophone) still resolve directly.
export const load = () => {
  redirect(307, "/music");
};
