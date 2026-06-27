import { json } from "@sveltejs/kit";

import modelDefinition from "@spotify/basic-pitch/model/model.json";

import { withPatchedWeightManifestPaths } from "../basic-pitch-extractor";

export function GET({ url }) {
  const weightPath = url.searchParams.get("weightPath");
  if (!weightPath) {
    return json({ error: "Missing Basic Pitch weight path." }, { status: 400 });
  }

  return json(withPatchedWeightManifestPaths(modelDefinition, weightPath));
}
