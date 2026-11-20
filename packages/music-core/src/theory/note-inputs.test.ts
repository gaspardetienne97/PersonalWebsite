import { afterEach, describe, expect, it } from "vite-plus/test";
import { m } from "@repo/i18n/messages.js";
import { noteInputs, noteOfInput, showNoteList } from "./note-inputs";
import { setNamingKey, setNoteNaming } from "./note-names";
import { keyNameLabel } from "./spelling";
import { AEROPHONE_READING_KEYS } from "./transposition";

afterEach(() => {
  setNoteNaming("letters");
  setNamingKey(undefined);
});

describe("note placeholders", () => {
  it("reads the note a placeholder is named after", () => {
    expect(noteOfInput("F_sharp")).toEqual({ text: "F#", key: false });
    expect(noteOfInput("E_over_G_sharp")).toEqual({ text: "E/G#", key: false });
    expect(noteOfInput("key_Bb")).toEqual({ text: "Bb", key: true });
    expect(noteOfInput("count")).toBeUndefined();
  });

  it("gives letters back with letters, so English reads as before", () => {
    expect(m.music_content_jazz_lick_21_tip(noteInputs())).toBe(
      "Half-step-below approaches: C# to D and F# to G.",
    );
    expect(m.music_content_technique_song_tears_note(noteInputs())).toMatch(
      /^Slash bass notes \(E\/G#, A\/E, D\/F#\) and E7sus4 are dropped\./,
    );
  });

  it("names notes, chords and keys in fixed do", () => {
    setNoteNaming("fixed");
    expect(m.music_content_jazz_lick_21_tip(noteInputs())).toBe(
      "Half-step-below approaches: Do# to Re and Fa# to Sol.",
    );
    expect(m.music_content_jazz_chord_scale_m7b5_locrian_hint(noteInputs())).toBe(
      "Think of the major scale a half step above: Reb major over Dom7b5.",
    );
    expect(m.music_content_tunes_rhythm_changes_name(noteInputs())).toBe("Rhythm changes in Sib");
  });

  it("counts notes from the key in movable do, but names keys absolutely", () => {
    setNoteNaming("movable");
    setNamingKey({ tonic: "G" });
    expect(m.music_rep_score_improv_game_three_notes_about(noteInputs())).toMatch(
      /^Only the key's 1, b3 and 5 \(Sib, Reb, Fa in Fa\)/,
    );
    const inputs = noteInputs();
    expect(inputs.F_sharp).toBe("Si");
    expect(inputs.key_F).toBe("Fa");
    expect(noteInputs({}, { tonic: "D" }).F_sharp).toBe("Mi");
  });

  it("keeps given inputs, respells notes, and is not wrapped twice", () => {
    setNoteNaming("fixed");
    const up = noteInputs({ n: 3 }, undefined, (letters) => (letters === "C" ? "D" : letters));
    expect(up.n).toBe(3);
    expect(up.C).toBe("Re");
    expect(noteInputs(up)).toBe(up);
  });

  it("names a list of notes or chords", () => {
    expect(showNoteList("E A D G B E")).toBe("E A D G B E");
    setNoteNaming("fixed");
    expect(showNoteList("E A D G B E")).toBe("Mi La Re Sol Si Mi");
    expect(showNoteList("G-D-Em-C")).toBe("Sol-Re-Mim-Do");
    expect(showNoteList("C, Am, F, G")).toBe("Do, Lam, Fa, Sol");
  });
});

describe("key and transposition labels", () => {
  it("name the key's tonic", () => {
    expect(keyNameLabel("Bb major")).toBe("Bb major");
    expect(AEROPHONE_READING_KEYS.map((k) => k.label)).toEqual(["C", "Alto Eb", "Tenor Bb"]);
    setNoteNaming("fixed");
    expect(keyNameLabel("Bb major")).toBe("Sib major");
    expect(keyNameLabel("F# minor")).toBe("Fa# minor");
    expect(AEROPHONE_READING_KEYS.map((k) => k.label)).toEqual(["Do", "Alto Mib", "Tenor Sib"]);
  });
});
