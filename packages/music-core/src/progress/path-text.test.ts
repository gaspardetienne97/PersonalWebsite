import { afterEach, describe, expect, it } from "vite-plus/test";
import { LEARNING_PATHS } from "./paths";
import { loadPathText, pathString } from "./path-text";

describe("path text", () => {
  afterEach(() => loadPathText("en"));

  it("is English until a language is loaded", () => {
    expect(pathString("Scales at Grade 3 speed")).toBe("Scales at Grade 3 speed");
  });

  it("reads each language's dictionary, and keeps English for text it lacks", async () => {
    await loadPathText("es");
    expect(pathString("Scales at Grade 3 speed")).toBe("Escalas a velocidad de Grado 3");
    expect(pathString("A line nobody translated")).toBe("A line nobody translated");
    await loadPathText("ht");
    expect(pathString("Scales at Grade 3 speed")).toBe("Gam nan vitès Nivo 3");
  });

  it("changes the paths' steps and levels once loaded, but not song titles", async () => {
    const path = LEARNING_PATHS.guitar;
    const level = path.levels![0];
    const english = { level: level.title, step: path.steps[0].title, song: level.shelf[0]?.title };
    await loadPathText("fr");
    expect(level.title).not.toBe(english.level);
    expect(path.steps[0].title).not.toBe(english.step);
    expect(level.shelf[0]?.title).toBe(english.song);
  });
});
