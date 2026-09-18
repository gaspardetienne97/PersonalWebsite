import { unixMs } from "@repo/music-core/domain";
import type {
  AudioTakeRecorderState,
  AudioTakeRecording,
} from "@repo/music-core/engines/audio-recording";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import type { AudioTakeRow } from "@repo/music-core/engines/store";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import AudioTakePanel from "./AudioTakePanel.svelte";

const take: AudioTakeRow = {
  id: "take-1",
  name: "Morning take.webm",
  mimeType: "audio/webm",
  size: 12_000,
  durationMs: 45_000,
  createdAt: unixMs(2_000),
  instrument: "piano",
  backingKind: "generated",
  backingOffsetMs: 0,
  generatedBacking: {
    progressionId: "ii-v-i",
    bpm: 112,
    loop: true,
  },
};

const recorderState: AudioTakeRecorderState = {
  status: "ready",
  deviceId: "mic-1",
  mimeType: "audio/webm",
  elapsedMs: 0,
};

const usage: MediaUsage = {
  backingBytes: 4_096,
  takeBytes: 12_000,
  totalBytes: 16_096,
  effectiveBudgetBytes: 200_000,
  remainingBytes: 183_904,
};

const devices = [
  {
    deviceId: "mic-1",
    groupId: "group-1",
    kind: "audioinput",
    label: "Studio mic",
    toJSON: () => ({}),
  } as MediaDeviceInfo,
];

const unsavedTake: AudioTakeRecording = {
  id: "take-unsaved",
  blob: new Blob(["audio"], { type: "audio/webm" }),
  mimeType: "audio/webm",
  size: 5,
  durationMs: 2_500,
};

describe("AudioTakePanel", () => {
  test("renders required accessible controls for a saved take", () => {
    render(AudioTakePanel, {
      recorderState,
      devices,
      armed: false,
      takes: [take],
      selectedTake: take,
      usage,
      performanceVolume: 0.85,
      backingVolume: 0.65,
    });

    for (const label of [
      "Arm microphone",
      "Audio input",
      "Play synchronized take",
      "Performance volume",
      "Backing volume",
      "Download take",
      "Delete take",
    ]) {
      expect(document.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(document.querySelector('[aria-label="Retry save"]')).toBeNull();
  });

  test("shows retry only for an unsaved in-memory take", () => {
    render(AudioTakePanel, {
      recorderState,
      devices,
      armed: true,
      takes: [take],
      selectedTake: take,
      unsavedTake,
      usage,
      performanceVolume: 0.85,
      backingVolume: 0.65,
    });

    expect(document.querySelector('[aria-label="Retry save"]')).not.toBeNull();
  });

  test("meters the armed input with a plain sentence", () => {
    render(AudioTakePanel, {
      recorderState: { ...recorderState, levelDb: -14, peakDb: -9 },
      devices,
      armed: true,
      takes: [take],
      selectedTake: take,
    });

    const meter = document.querySelector('[role="meter"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("-14"); // the bar shows the live level
    expect(meter?.getAttribute("aria-valuetext")).toBe("peak −9 dB, good level");
    expect(document.body.textContent).toContain("peak −9 dB, good level");
  });

  test("draws the recorder error without claiming a live region", () => {
    render(AudioTakePanel, {
      recorderState: { ...recorderState, status: "error", message: "Microphone is busy." },
      devices,
      armed: false,
      takes: [],
    });

    expect(document.body.textContent).toContain("Microphone is busy.");
    // The route owns announcements and renders this same message in the one
    // live region it owns; a second one here would announce it twice.
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  test("draws the take envelope, its gained peak, and a clipping warning", async () => {
    const loud = { ...take, gainDb: 12 };
    render(AudioTakePanel, {
      recorderState,
      devices,
      takes: [loud],
      selectedTake: loud,
      loadTakePeaks: async () => ({ peaks: [0.1, 0.5, 0.25, 0.4], peakDb: -6 }),
    });

    await vi.waitFor(() => {
      expect(document.querySelector("[data-take-envelope]")).not.toBeNull();
    });
    const gain = document.querySelector<HTMLInputElement>('[aria-label="Take gain"]');
    expect(gain?.value).toBe("12");
    expect(document.body.textContent).toContain("peak +6 dB"); // −6 dB plus 12 dB of gain
    expect(document.body.textContent).toMatch(/clipping/i);
    expect(
      document.querySelectorAll("[data-take-envelope] .fill-destructive").length,
    ).toBeGreaterThan(0);
  });

  test("emits rename, note, and gain callbacks for a take", () => {
    const onRenameTake = vi.fn();
    const onNoteTake = vi.fn();
    const onGainTake = vi.fn();
    render(AudioTakePanel, {
      recorderState,
      devices,
      takes: [take],
      selectedTake: take,
      onRenameTake,
      onNoteTake,
      onGainTake,
    });

    const name = document.querySelector<HTMLInputElement>(
      '[aria-label="Take name for Morning take.webm"]',
    );
    const note = document.querySelector<HTMLInputElement>(
      '[aria-label="Note for Morning take.webm"]',
    );
    const gain = document.querySelector<HTMLInputElement>('[aria-label="Take gain"]');
    name!.value = "Morning warmup";
    name!.dispatchEvent(new Event("change", { bubbles: true }));
    note!.value = "too much pedal";
    note!.dispatchEvent(new Event("change", { bubbles: true }));
    gain!.value = "-6";
    gain!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onGainTake).not.toHaveBeenCalled(); // dragging only previews
    gain!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onRenameTake).toHaveBeenCalledWith(take, "Morning warmup");
    expect(onNoteTake).toHaveBeenCalledWith(take, "too much pedal");
    expect(onGainTake).toHaveBeenCalledOnce();
    expect(onGainTake).toHaveBeenCalledWith(take, -6);
  });

  test("emits recorder, playback, volume, download, and retry callbacks", () => {
    let armDevice: string | undefined;
    let playId = "";
    let performanceLevel = 0;
    let backingLevel = 0;
    let downloadId = "";
    let retryId = "";

    render(AudioTakePanel, {
      recorderState,
      devices,
      armed: false,
      takes: [take],
      selectedTake: take,
      unsavedTake,
      usage,
      performanceVolume: 0.85,
      backingVolume: 0.65,
      onArm: (deviceId) => {
        armDevice = deviceId;
      },
      onPlayTake: (row) => {
        playId = row.id;
      },
      onPerformanceVolume: (volume) => {
        performanceLevel = volume;
      },
      onBackingVolume: (volume) => {
        backingLevel = volume;
      },
      onDownloadTake: (row) => {
        downloadId = row.id;
      },
      onRetrySave: (recording) => {
        retryId = recording.id;
      },
    });

    document.querySelector<HTMLButtonElement>('[aria-label="Arm microphone"]')?.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Play synchronized take"]')?.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Download take"]')?.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Retry save"]')?.click();

    const performance = document.querySelector<HTMLInputElement>(
      '[aria-label="Performance volume"]',
    );
    const backing = document.querySelector<HTMLInputElement>('[aria-label="Backing volume"]');
    expect(performance).not.toBeNull();
    expect(backing).not.toBeNull();
    performance!.value = "0.4";
    backing!.value = "0.2";
    performance?.dispatchEvent(new Event("input", { bubbles: true }));
    backing?.dispatchEvent(new Event("input", { bubbles: true }));

    expect(armDevice).toBe("mic-1");
    expect(playId).toBe("take-1");
    expect(downloadId).toBe("take-1");
    expect(retryId).toBe("take-unsaved");
    expect(performanceLevel).toBe(0.4);
    expect(backingLevel).toBe(0.2);
  });
});
