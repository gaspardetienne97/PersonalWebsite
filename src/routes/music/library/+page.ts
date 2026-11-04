import { redirect } from "@sveltejs/kit";

// The chord and scale reference moved to Create; old Library links (?tab=reference) still land on it.
export function load({ url }) {
  if (url.searchParams.get("tab") !== "reference") return;
  const section = url.searchParams.get("section");
  redirect(
    308,
    `/music/create/reference${section ? `?section=${encodeURIComponent(section)}` : ""}`,
  );
}
