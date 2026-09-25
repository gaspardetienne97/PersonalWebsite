import { describe, expect, it } from "vitest";
import { PAD_PRESETS } from "@repo/music-core/io/devices";
import { explainNote, waitingReason } from "./midi-status";

const pub = { id: "pub", name: "MPC One+ Public", manufacturer: "Akai" };
const priv = { id: "priv", name: "MPC One+ Private", manufacturer: "Akai" };
const ae = { id: "ae", name: "Aerophone AE-10", manufacturer: "Roland" };
const classic = [...PAD_PRESETS["akai-classic"].notes];

describe("explainNote", () => {
  it("names the pad a mapped hardware note became", () => {
    expect(explainNote([0x99, 37, 100], priv, { id: "priv", padNotes: classic })?.text).toBe(
      "Last note 37 from MPC One+ Private, mapped to pad A01.",
    );
    expect(explainNote([0x99, 38, 100], priv, { id: "priv", padNotes: classic })?.text).toContain(
      "pad A06",
    );
  });

  it("says when the port is ignored or the channel is wrong", () => {
    expect(explainNote([0x99, 37, 100], pub, { id: "pub", ignored: true })).toEqual({
      text: "Last note 37 from MPC One+ Public was dropped: that port is ignored in Connect.",
      used: false,
    });
    expect(explainNote([0x90, 37, 100], priv, { id: "priv", channel: 10 })?.used).toBe(false);
  });

  it("flags notes outside bank A and unmapped devices", () => {
    expect(explainNote([0x99, 82, 100], priv)?.text).toContain("outside bank A");
    expect(explainNote([0x99, 38, 100], priv)?.text).toContain("no pad map saved");
  });

  it("ignores note-offs and names wind notes", () => {
    expect(explainNote([0x89, 37, 0], priv)).toBeNull();
    expect(explainNote([0x90, 67, 80], ae)?.text).toBe(
      "Last note 67 from Aerophone AE-10, played as G4.",
    );
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
    expect(waitingReason({ ...base, link: "off" })).toContain("No controller link");
    expect(waitingReason({ ...base, link: "no-sysex" })).toContain("SysEx");
    expect(waitingReason({ ...base, profiles: [{ id: "pub", ignored: true }] })).toBe(
      "Linked and listening on MPC One+ Private. Hit a pad.",
    );
  });
});
