import { redirect } from "@sveltejs/kit";

// The journal is a view of Progress now; old links land on it.
export function load({ url }) {
  const q = new URLSearchParams(url.search);
  q.set("view", "journal");
  redirect(308, `/music/progress?${q}`);
}
