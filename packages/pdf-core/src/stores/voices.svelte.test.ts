import { describe, expect, it } from "vite-plus/test";

import { VoiceCatalog } from "./voices.svelte";

const voice = (name: string, isDefault = false) =>
  ({
    name,
    lang: "en-US",
    localService: true,
    default: isDefault,
    voiceURI: name,
  }) as SpeechSynthesisVoice;

describe("VoiceCatalog", () => {
  it("names the device default as the voice in use when nothing was saved", () => {
    const catalog = new VoiceCatalog();
    catalog.voices = [voice("Alex"), voice("Samantha", true)];

    expect(catalog.deviceDefault?.name).toBe("Samantha");
    expect(catalog.inUse("")?.name).toBe("Samantha");
  });

  it("prefers the saved voice, and falls back to the default when it is gone", () => {
    const catalog = new VoiceCatalog();
    catalog.voices = [voice("Alex"), voice("Samantha", true)];

    expect(catalog.inUse("Alex")?.name).toBe("Alex");
    expect(catalog.inUse("Removed voice")?.name).toBe("Samantha");
  });

  it("takes the first voice when the device marks no default, and none when it has no voices", () => {
    const catalog = new VoiceCatalog();
    catalog.voices = [voice("Alex"), voice("Daniel")];
    expect(catalog.deviceDefault?.name).toBe("Alex");

    catalog.voices = [];
    expect(catalog.inUse("")).toBeUndefined();
  });
});
