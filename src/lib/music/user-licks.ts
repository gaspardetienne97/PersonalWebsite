// Your licks: lines saved from Learn by ear or a transcription, kept in this
// browser and drilled in Phrases in any key.
import { stepsFromNotes, type UserLick } from "@repo/music-core/content/phrases";
import { getSetting, putSetting } from "$lib/music/runtime";

const KEY = "music.user-licks";

export const listUserLicks = () => getSetting<UserLick[]>(KEY, []);

/** Save a line (notes in beats at `bpm`); its first four bars become the lick. Returns its id. */
export async function saveUserLick(opts: {
  title: string;
  from: string;
  bpm: number;
  notes: readonly { midi: number; startBeat: number; durationBeats: number }[];
}): Promise<string | null> {
  const steps = stepsFromNotes(opts.notes);
  if (!steps.some((s) => s[0] !== null)) return null;
  const id = `user.${Date.now().toString(36)}`;
  const all = await listUserLicks();
  await putSetting(KEY, [
    ...all,
    { id, title: opts.title, from: opts.from, bpm: Math.round(opts.bpm), steps } satisfies UserLick,
  ]);
  return id;
}

export async function removeUserLick(id: string) {
  await putSetting(
    KEY,
    (await listUserLicks()).filter((l) => l.id !== id),
  );
}

/** Notes heard at times in seconds, as beats at `bpm` from the first. */
export const secondsToBeats = (notes: readonly { midi: number; at: number }[], bpm: number) =>
  notes.map((n, i) => ({
    midi: n.midi,
    startBeat: ((n.at - notes[0].at) * bpm) / 60,
    durationBeats: notes[i + 1] ? ((notes[i + 1].at - n.at) * bpm) / 60 : 1,
  }));
