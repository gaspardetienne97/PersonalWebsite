import type { LayoutServerLoad } from "./$types";

// Who is signed in, for the header's sign-in button. Only what it shows leaves the server.
export const load: LayoutServerLoad = ({ locals }) => ({
  user: locals.user ? { name: locals.user.name, image: locals.user.image ?? null } : null,
});
