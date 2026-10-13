// A fixed colour per drum, the way play-along apps colour their lanes: the
// low drums warm, the cymbals cool, so a lane is known before it is read.
// Always drawn with the drum's name (colour is never the only cue).
const HUE: Record<string, number> = {
  kick: 22,
  "808": 5,
  snare: 70,
  rim: 50,
  perc: 345,
  hats: 135,
  pedalhat: 155,
  openhat: 185,
  "tom-high": 225,
  "tom-mid": 245,
  "tom-low": 265,
  ride: 290,
  crash: 315,
  cowbell: 95,
  // Rudiments: the two hands, and both fingers on one pad.
  left: 250,
  right: 40,
  both: 160,
};

export const laneColor = (id: string) => `oklch(0.74 0.17 ${HUE[id] ?? 200})`;

export type Judgement = "perfect" | "early" | "late" | "miss";
export const JUDGEMENT_TEXT: Record<Judgement, string> = {
  perfect: "Perfect",
  early: "Early",
  late: "Late",
  miss: "Miss",
};

/** One to three stars: some of it, most of it, passed (the level's timing). */
export const starsFor = (score: number, passed: boolean) =>
  passed ? 3 : score >= 0.8 ? 2 : score >= 0.6 ? 1 : 0;
