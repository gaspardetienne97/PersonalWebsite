import { redirect } from "@sveltejs/kit";

// Library is the Studio hub now. Old links keep their query (?tab=import&shelf=...); the chord and
// scale reference (?tab=reference) lives on its own page.
export function load({ url }) {
  if (url.searchParams.get("tab") === "reference") {
    const section = url.searchParams.get("section");
    redirect(
      308,
      `/music/create/reference${section ? `?section=${encodeURIComponent(section)}` : ""}`,
    );
  }
  redirect(308, `/music/studio${url.search}`);
}
