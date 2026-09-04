import { describe, expect, test } from "vite-plus/test";

const routeSources = import.meta.glob("./**/*.svelte", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const mandatoryDrills = [
  { name: "scales", sources: ["./play/scales/+page.svelte"] },
  { name: "spider", sources: ["./play/spider/+page.svelte"] },
  { name: "two-hand", sources: ["./play/two-hand/+page.svelte"] },
  { name: "MPC rudiments", sources: ["./play/mpc/+page.svelte"] },
  { name: "voicings", sources: ["./play/voicings/+page.svelte"] },
  { name: "chord-perfect", sources: ["./play/chord-perfect/+page.svelte"] },
  { name: "chord progression", sources: ["./play/chord-progression/+page.svelte"] },
  { name: "chord scales", sources: ["./play/chord-scales/+page.svelte"] },
  { name: "licks", sources: ["./play/licks/+page.svelte"] },
  { name: "aerophone articulation", sources: ["./learn/aerophone/+page.svelte"] },
  { name: "ear training", sources: ["./learn/ear/+page.svelte"] },
  { name: "rhythm", sources: ["./learn/rhythm/+page.svelte"] },
  // Reading's session components render inside the route's shell stage; they
  // no longer mount a nested shell of their own.
  { name: "reading", sources: ["./learn/reading/+page.svelte"] },
] as const;

const singleStatusLiveOwnerRoutes = [
  "./learn/rhythm/+page.svelte",
  "./play/chord-scales/+page.svelte",
  "./play/mpc/+page.svelte",
  "./play/spider/+page.svelte",
] as const;

// Intentionally excluded: Jam (/music/jam) and Practice Lab (/music/play) are freeform surfaces.
describe("mandatory drill shell convergence", () => {
  test.each(mandatoryDrills)("$name mounts the phase shell and summary frame", ({ sources }) => {
    const drillSources = sources.map((path) => {
      const source = routeSources[path];
      expect(source, `${path} must remain in the mandatory drill list`).toBeTypeOf("string");
      expect(source, `${path} must mount PracticeDrillShell with phase`).toMatch(
        /<PracticeDrillShell\b[^>]*(?:\bphase\s*=|\{phase\})[^>]*>/s,
      );
      return source;
    });

    expect(
      drillSources.some((source) => /<DrillSummaryCard\b/.test(source)),
      `${sources[0]} must mount DrillSummaryCard`,
    ).toBe(true);
  });

  test("keeps each route status owned by its persistent phase announcer", () => {
    for (const path of singleStatusLiveOwnerRoutes) {
      const source = routeSources[path];
      expect(source, `${path} must keep its persistent phase announcer`).toMatch(
        /<p\b[^>]*aria-live="polite"[^>]*>[^<]*\{liveAnnouncement\}[^<]*<\/p>/s,
      );
      expect(source, `${path} must not expose route status through another live node`).not.toMatch(
        /<p\b[^>]*aria-live="polite"[^>]*>[^<]*\bstatus\b[^<]*<\/p>/s,
      );
    }
  });
});
