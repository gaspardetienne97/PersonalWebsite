import { json } from "@sveltejs/kit";
import { listScores } from "#lib/server/scores.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => json(await listScores());
