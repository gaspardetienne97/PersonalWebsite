import { unixMs } from "@repo/music-core/domain";
import type {
  AudioTakeRecorderState,
  AudioTakeRecording,
} from "@repo/music-core/engines/audio-recording";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import type { AudioTakeRow } from "@repo/music-core/engines/store";
import { describe, expect, test } from "vite-plus/test";
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
