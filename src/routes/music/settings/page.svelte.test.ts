import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { monotonicMs } from "@repo/music-core/domain";
import { AudioPitchSource } from "@repo/music-core/engines/audio-in";
import { PracticeDatabase } from "@repo/music-core/engines/store";

import Page from "./+page.svelte";
import { MUSIC_RUNTIME, MusicRuntime } from "../_runtime.svelte";

const backupMocks = vi.hoisted(() => {
  const emptyTables = {
    sessions: [],
    scoringEvents: [],
    skillMastery: [],
    skills: [],
    skillRelationships: [],
    chordLibrary: [],
    songs: [],
    settings: [],
    backingTracks: [],
    audioTakes: [],
  };
  const backup = {
    format: "practice-os-data-backup" as const,
    version: 1 as const,
    exportedAt: "2026-09-13T12:00:00.000Z",
    tables: emptyTables,
    media: { included: false as const, backingTrackFiles: 0, audioTakeFiles: 0, sampleFiles: 0 },
  };
  return {
    backup,
    prepare: vi.fn(async () => ({
      backup,
      json: JSON.stringify(backup),
      byteSize: 128,
      counts: Object.fromEntries(Object.keys(emptyTables).map((key) => [key, 0])),
    })),
    parse: vi.fn(() => structuredClone(backup)),
    restore: vi.fn(async (_store: unknown, _backup: unknown) => {}),
  };
});

vi.mock("@repo/music-core/engines/store/data-backup", () => ({
  MUSIC_DATA_BACKUP_MAX_BYTES: 50 * 1024 * 1024,
  parseMusicDataBackup: backupMocks.parse,
  prepareMusicDataBackup: backupMocks.prepare,
  restoreMusicDataBackup: backupMocks.restore,
  tableCounts: (tables: Record<string, unknown[]>) =>
    Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length])),
}));

const fullMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  parse: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@repo/music-core/engines/store/full-backup", () => ({
  MUSIC_FULL_BACKUP_MAX_BYTES: 250 * 1024 * 1024,
  prepareMusicFullBackup: fullMocks.prepare,
  parseMusicFullBackup: fullMocks.parse,
  restoreMusicFullBackup: fullMocks.restore,
}));

describe("/music/settings/+page.svelte", () => {
  test("offers a media-inclusive full backup separately from the existing data export", async () => {
    render(Page);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Prepare full backup"));
    expect(document.body.textContent).toContain("Prepare data backup");
    expect(document.body.textContent).toContain("250 MiB");
    expect(document.querySelector('[aria-label="Full backup file"]')).not.toBeNull();
  });

  test("renders the settings sections", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Settings");
    // Groups: Audio, Input, Latency, Appearance, Your data, each a SectionHeading.
    await vi.waitFor(() => expect(document.body.textContent).toContain("Latency calibration"));
    const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim());
    expect(headings).toEqual(["Audio", "Input", "Latency calibration", "Appearance", "Your data"]);
    expect(document.querySelectorAll("[data-settings-row]").length).toBeGreaterThanOrEqual(12);
  });

  test("offers export and a confirmed reset of local data", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Your data"));
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent?.trim() === label,
      );
    expect(button("Export journal")).toBeDefined();
    expect(button("Yes, reset")).toBeUndefined();
    button("Reset local data")?.click();
    await vi.waitFor(() => expect(button("Yes, reset")).toBeDefined());
    button("Keep")?.click();
    await vi.waitFor(() => expect(button("Yes, reset")).toBeUndefined());
  });

  test("shows a read-only output-latency line and a Calibrate control per input", async () => {
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {},
    });
    render(Page, { context: new Map([[MUSIC_RUNTIME, runtime]]) });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Output latency (reported by the browser)"),
    );
    // Audio is not enabled in a test run, so the browser reports nothing.
    expect(document.body.textContent).toContain("Not reported");
    expect(document.body.textContent).toContain("never applied to scoring");
    const calibrate = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) => button.textContent?.trim() === "Calibrate",
    );
    // One for the microphone, one for MIDI devices without their own offset.
    expect(calibrate.length).toBe(2);
    expect((document.body.textContent ?? "").replace(/\s+/g, " ")).toContain(
      "a positive offset means your hits arrive late and are pulled earlier",
    );
    runtime.dispose();
  });

  test("the microphone panel is already forwarding onsets on its first run", async () => {
    const onsets = vi.spyOn(AudioPitchSource.prototype, "subscribeOnsets");
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {},
    });
    render(Page, { context: new Map([[MUSIC_RUNTIME, runtime]]) });

    const calibrate = () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
        (button) => button.textContent?.trim() === "Calibrate",
      );
    await vi.waitFor(() => expect(calibrate().length).toBe(2));
    // The microphone panel comes first; its source must exist before it runs.
    calibrate()[0]!.click();
    await vi.waitFor(() => expect(onsets).toHaveBeenCalled());

    const forward = onsets.mock.calls[0]![0];
    forward({
      type: "onset",
      strength: 0.9,
      source: "audio",
      timestamp: monotonicMs(1_234),
      clock: "performance",
    });
    expect(runtime.router.events.at(-1)?.timestamp).toBe(1_234);

    onsets.mockRestore();
    runtime.dispose();
  });

  test("shows a saved offset and resets it", async () => {
    const written: unknown[] = [];
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async (id: string) =>
        id === "music.settings" ? { id, value: { midiOffsetMs: 42 } } : undefined,
      put: async (record: { id: string; value: unknown }) => {
        written.push(record.value);
      },
    });
    render(Page, { context: new Map([[MUSIC_RUNTIME, runtime]]) });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Offset 42 ms"));
    const reset = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) => button.textContent?.trim() === "Reset",
    );
    expect(reset.length).toBe(1);

    reset[0]!.click();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Offset 42 ms"));
    expect(
      [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
        (candidate) => candidate.textContent?.trim() === "Reset",
      ),
    ).toEqual([]);
    runtime.dispose();
  });

  test("shows playback sound selector", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Playback sound"));
    expect(document.body.textContent).toContain("Sampled Piano");
    expect(document.body.textContent).toContain("Warm Synth");
    expect(document.body.textContent).toContain("E-Piano");
  });

  test("shows runtime audio controls and sample attribution", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Enable/Test audio"));
    expect(document.body.textContent).toContain("Playback & drill sounds");
    expect(document.body.textContent).toContain("Metronome");
    expect(document.body.textContent).toContain("Master volume");
    expect(document.body.textContent).toContain("Mute all audio");
    expect(document.body.textContent).toContain("Alexander Holm");
    expect(document.body.textContent).toContain("CC BY 3.0");
  });

  test("shows and clears persistence failures from external runtime setters", async () => {
    let writes = 0;
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {
        writes += 1;
        if (writes === 1) throw new Error("Storage full");
      },
    });
    render(Page, { context: new Map([[MUSIC_RUNTIME, runtime]]) });

    runtime.toggleMute();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Storage full"));

    runtime.toggleMute();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Storage full"));
    runtime.dispose();
  });

  test("prepares and downloads a complete data backup", async () => {
    render(Page);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Prepare data backup"));
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    expect(button("Download data backup")?.disabled).toBe(true);

    button("Prepare data backup")?.click();
    await vi.waitFor(() => expect(button("Download data backup")?.disabled).toBe(false));
    expect(document.body.textContent).toContain("Audio files and sample files are not included.");
    expect(backupMocks.prepare).toHaveBeenCalled();
  });

  test("invalid file selection clears a previous restore review", async () => {
    render(Page);
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('[aria-label="Data backup file"]'),
      ).not.toBeNull(),
    );
    const input = document.querySelector<HTMLInputElement>('[aria-label="Data backup file"]')!;
    const select = (file: File) => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    select(new File(["{}"], "valid.json", { type: "application/json" }));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Data backup review"]')).not.toBeNull(),
    );
    expect(document.body.textContent).toContain("Restore data");

    backupMocks.parse.mockImplementationOnce(() => {
      throw new Error("Unsupported backup version.");
    });
    select(new File(["{}"], "invalid.json", { type: "application/json" }));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Unsupported backup version."),
    );
    expect(document.querySelector('[aria-label="Data backup review"]')).toBeNull();
  });

  test("passes a cloneable backup and freezes selection until restore failure settles", async () => {
    render(Page);
    const input = document.querySelector<HTMLInputElement>('[aria-label="Data backup file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["{}"], "valid.json")],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    await vi.waitFor(() => expect(button("Restore data")).toBeDefined());
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    void pending.catch(() => {});
    backupMocks.restore.mockImplementationOnce(async (_store, backup) => {
      structuredClone(backup);
      await pending;
    });
    button("Restore data")!.click();
    try {
      await vi.waitFor(() => expect(input.disabled).toBe(true));
      expect(button("Restore data")!.disabled).toBe(true);
    } finally {
      reject(new Error("Storage full"));
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("Storage full"));
    expect(input.disabled).toBe(false);
    expect(button("Restore data")!.disabled).toBe(false);
  });
  test("full restore keeps blobs cloneable and blocks both selectors until failure", async () => {
    const parsed = {
      manifest: {
        format: "practice-os-full-backup",
        version: 1,
        data: backupMocks.backup,
        assets: [],
      },
      files: new Map<string, Blob>(),
    };
    fullMocks.parse.mockResolvedValueOnce(parsed);
    render(Page);
    const input = document.querySelector<HTMLInputElement>('[aria-label="Full backup file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["zip"], "full.zip")],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const button = () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent?.trim() === "Restore full backup",
      );
    await vi.waitFor(() => expect(button()).toBeDefined());
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    fullMocks.restore.mockImplementationOnce(async (_store, value) => {
      expect(structuredClone(value).files).toBeInstanceOf(Map);
      await pending;
    });
    button()!.click();
    try {
      await vi.waitFor(() => expect(input.disabled).toBe(true));
      expect(
        document.querySelector<HTMLInputElement>('[aria-label="Data backup file"]')!.disabled,
      ).toBe(true);
      expect(button()!.disabled).toBe(true);
    } finally {
      reject(new Error("File write failed"));
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("File write failed"));
    expect(input.disabled).toBe(false);
    expect(button()!.disabled).toBe(false);
  });

  test("a later data selection supersedes an unfinished full backup parse", async () => {
    let finish!: (value: unknown) => void;
    fullMocks.parse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(Page);
    const select = (label: string) => {
      const input = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["{}"], "backup")],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    select("Full backup file");
    select("Data backup file");
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Data backup review"]')).not.toBeNull(),
    );
    finish({ manifest: { data: backupMocks.backup, assets: [] }, files: new Map() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[aria-label="Full backup review"]')).toBeNull();
    expect(document.querySelector('[aria-label="Data backup review"]')).not.toBeNull();
  });
  test("full backup preparation disables restore controls and recovers from a missing file", async () => {
    let fail!: (error: Error) => void;
    fullMocks.prepare.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(Page);
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      )!;
    expect(button("Download full backup").disabled).toBe(true);
    button("Prepare full backup").click();
    await vi.waitFor(() => expect(button("Prepare full backup").disabled).toBe(true));
    expect(
      document.querySelector<HTMLInputElement>('[aria-label="Full backup file"]')!.disabled,
    ).toBe(true);
    expect(button("Reset local data").disabled).toBe(true);
    fail(new Error("Referenced media file is missing"));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Referenced media file is missing"),
    );
    expect(button("Prepare full backup").disabled).toBe(false);
    expect(button("Download full backup").disabled).toBe(true);
    fullMocks.prepare.mockResolvedValueOnce({
      blob: new Blob(["zip"]),
      byteSize: 3,
      manifest: { data: backupMocks.backup, assets: [] },
    });
    button("Prepare full backup").click();
    await vi.waitFor(() => expect(button("Download full backup").disabled).toBe(false));
    expect(document.body.textContent).not.toContain("Referenced media file is missing");
  });

  test("an unfinished local reset cannot race with backup preparation or restore", async () => {
    let fail!: (error: Error) => void;
    const deletion = vi.spyOn(PracticeDatabase.prototype, "delete").mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }) as never,
    );
    render(Page);
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      )!;
    button("Reset local data").click();
    await vi.waitFor(() => expect(button("Yes, reset")).toBeDefined());
    button("Yes, reset").click();
    try {
      await vi.waitFor(() => expect(button("Prepare full backup").disabled).toBe(true));
      expect(
        document.querySelector<HTMLInputElement>('[aria-label="Full backup file"]')!.disabled,
      ).toBe(true);
    } finally {
      fail(new Error("Reset failed"));
      deletion.mockRestore();
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("Reset failed"));
    expect(button("Prepare full backup").disabled).toBe(false);
  });
});
