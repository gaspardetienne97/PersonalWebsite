import type { SemanticTone } from "@repo/music-core/engines/semantic-color";

/**
 * Presentation mapping from a semantic tone to a Tailwind text-color class.
 * Lives in the route layer (not the framework-agnostic engine) so the engine
 * never references Tailwind class names. `error` reuses the `--destructive`
 * token. Components import this instead of re-declaring the map inline.
 */
export const toneTextClass: Record<SemanticTone, string> = {
  error: "text-destructive",
  warn: "text-warn",
  success: "text-success",
  info: "text-info",
};
