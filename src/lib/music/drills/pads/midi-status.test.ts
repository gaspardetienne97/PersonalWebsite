import { describe, expect, it } from "vite-plus/test";
import { setNoteNaming } from "@repo/music-core";
import { PAD_PRESETS } from "@repo/music-core/io/devices";
import { explainNote, waitingReason } from "./midi-status";

const pub = { id: "pub", name: "MPC One+ Public", manufacturer: "Akai" };
const priv = { id: "priv", name: "MPC One+ Private", manufacturer: "Akai" };
const ae = { id: "ae", name: "Aerophone AE-10", manufacturer: "Roland" };
const classic = [...PAD_PRESETS["akai-classic"].notes];

describe("explainNote", () => {
  it("names the pad a mapped hardware note became", () => {
    expect(explainNote([0x99, 37, 100], priv, { id: "priv", padNotes: classic })?.text).toBe(
      "Hearing MPC One+ Private. Last hit: pad A01.",
    );
    expect(explainNote([0x99, 38, 100], priv, { id: "priv", padNotes: classic })?.text).toContain(
      "pad A06",
    );
  });

  it("says when the port is ignored or the channel is wrong", () => {
    expect(explainNote([0x99, 37, 100], pub, { id: "pub", ignored: true })).toEqual({
      text: "A note from MPC One+ Public was dropped: that device is hidden in Connect.",
      used: false,
      midi: 37,
    });
    expect(explainNote([0x90, 37, 100], priv, { id: "priv", channel: 10 })?.used).toBe(false);
  });

  it("flags notes outside bank A and unmapped devices", () => {
    expect(explainNote([0x99, 82, 100], priv)?.text).toContain("outside bank A");
    expect(explainNote([0x99, 38, 100], priv)?.text).toContain("using the default pad order");
  });

  it("ignores note-offs and names wind notes", () => {
    expect(explainNote([0x89, 37, 0], priv)).toBeNull();
    expect(explainNote([0x90, 67, 80], ae)?.text).toBe("Hearing Aerophone AE-10. Last note: G4.");
  });

  it("names the wind note as the user reads note names", () => {
    setNoteNaming("fixed");
    try {
      expect(explainNote([0x90, 67, 80], ae)?.text).toBe(
        "Hearing Aerophone AE-10. Last note: Sol4.",
      );
    } finally {
      setNoteNaming("letters");
    }
  });
});

describe("waitingReason", () => {
  const base = {
    supported: true,
    enabled: true,
    instrument: "mpc" as const,
    inputs: [pub, priv],
    profiles: [],
    link: "linked" as const,
  };
  it("walks the blockers in order", () => {
    expect(waitingReason({ ...base, enabled: false })).toContain("MIDI is off");
    expect(waitingReason({ ...base, inputs: [] })).toContain("No MPC port");
    expect(
      waitingReason({
        ...base,
        profiles: [
          { id: "pub", ignored: true },
          { id: "priv", ignored: true },
        ],
      }),
    ).toContain("ignored");
    // Not linked: the port is connected (as the top bar says), so the line never claims hits are not heard.
    expect(waitingReason({ ...base, link: "off" })).toBe(
      "MPC One+ Public and MPC One+ Private are connected, but no pad hit has arrived yet. If the pads stay silent here, link it in Connect.",
    );
    expect(waitingReason({ ...base, link: "no-output" })).toContain("check the cable");
    expect(waitingReason({ ...base, link: "no-sysex" })).toContain("SysEx");
    expect(waitingReason({ ...base, profiles: [{ id: "pub", ignored: true }] })).toBe(
      "Linked and listening on MPC One+ Private. Hit a pad.",
    );
  });
});
