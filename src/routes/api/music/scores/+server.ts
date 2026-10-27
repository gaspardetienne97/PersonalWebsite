import { json } from "@sveltejs/kit";
import { listScores } from "$lib/server/scores";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => json(await listScores());
