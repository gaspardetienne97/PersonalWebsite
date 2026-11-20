import { error } from "@sveltejs/kit";
import { readScore } from "#lib/server/scores.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const score = await readScore(params.path, params.song);
  if (!score) error(404, "No downloaded score for that song");
  return new Response(new Uint8Array(score.bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${score.file}"`,
      "cache-control": "private, no-store",
    },
  });
};
