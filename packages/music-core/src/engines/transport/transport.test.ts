import { describe, expect, test, vi } from "vitest";

import { monotonicMs } from "@repo/music-core/domain";

import {
  scheduleMetronomeTicks,
  TransportEngine,
  type ToneTransportClock,
  type TransportEvent,
} from "./index";

function createClockMock() {
  let callback: ((atSeconds: number) => void) | undefined;
  const clock: ToneTransportClock = {
    bpm: { value: 120 },
    timeSignature: [4, 4],
    loop: false,
    loopStart: 0,
    loopEnd: "1m",
    scheduleRepeat: vi.fn((scheduled, _interval) => {
      callback = scheduled;
      return 7;
    }),
    clear: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  return {
    clock,
    tick(atSeconds: number) {
      callback?.(atSeconds);
    },
  };
}

describe("music-core/transport", () => {
  test.each([
    [60, 1_000],
    [120, 500],
    [180, 1_000 / 3],
  ])("calculates exact tick spacing at %i BPM", (bpm, spacingMs) => {
    const ticks = scheduleMetronomeTicks({ bpm, numerator: 4 }, 2_000, 3);
    expect(ticks[1]!.atMs - ticks[0]!.atMs).toBeCloseTo(spacingMs, 10);
    expect(ticks[2]!.atMs - ticks[1]!.atMs).toBeCloseTo(spacingMs, 10);
  });

  test("emits sample-accurate beat and subdivision events from the audio clock", () => {
    const mock = createClockMock();
    const clicks: Array<{ atSeconds: number; accented: boolean }> = [];
    const events: TransportEvent[] = [];
    const transport = new TransportEngine(mock.clock, {
      bpm: 120,
      quantizationGrid: "8n",
      onMetronomeClick: (atSeconds, accented) => clicks.push({ atSeconds, accented }),
    });
    transport.subscribe((event) => events.push(event));

    transport.start();
    [10, 10.25, 10.5, 10.75, 11].forEach(mock.tick);

    expect(mock.clock.scheduleRepeat).toHaveBeenCalledWith(expect.any(Function), "8n", 0);
    expect(events.map((event) => event.atSeconds)).toEqual([10, 10.25, 10.5, 10.75, 11]);
    expect(events.map((event) => event.kind)).toEqual([
      "beat",
      "subdivision",
      "beat",
      "subdivision",
      "beat",
    ]);
    expect(clicks).toEqual([
      { atSeconds: 10, accented: true },
      { atSeconds: 10.5, accented: false },
      { atSeconds: 11, accented: false },
    ]);
  });

  test("projects scheduled audio time onto the monotonic performance clock", () => {
    const mock = createClockMock();
    const events: TransportEvent[] = [];
    const transport = new TransportEngine(mock.clock, {
      audioNowSeconds: () => 10,
      monotonicNowMs: () => monotonicMs(5_000),
    });
    transport.subscribe((event) => events.push(event));

    transport.start();
    mock.tick(10.25);

    expect(events[0]?.atMonotonicMs).toBe(5_250);
  });

  test("applies tempo, time signature, count-in, loop points, and cleanup", () => {
    const mock = createClockMock();
    const transport = new TransportEngine(mock.clock);

    transport.setBpm(180);
    transport.setTimeSignature(3, 4);
    transport.setCountInBars(1);
    transport.setLoopPoints("1m", "3m");
    transport.setQuantizationGrid("16n");

    expect(mock.clock.bpm.value).toBe(180);
    expect(mock.clock.timeSignature).toEqual([3, 4]);
    expect(mock.clock.loop).toBe(true);
    expect(mock.clock.loopStart).toBe("1m");
    expect(mock.clock.loopEnd).toBe("3m");
    expect(transport.state).toMatchObject({
      bpm: 180,
      numerator: 3,
      denominator: 4,
      countInBars: 1,
      quantizationGrid: "16n",
    });

    transport.start();
    mock.tick(0);
    expect(transport.lastEvent?.countingIn).toBe(true);

    transport.setBpm(120);
    expect(mock.clock.bpm.value).toBe(120);
    expect(mock.clock.scheduleRepeat).toHaveBeenCalledOnce();

    transport.stop();
    expect(mock.clock.clear).toHaveBeenCalledWith(7);
    expect(mock.clock.stop).toHaveBeenCalledOnce();
    expect(transport.state.running).toBe(false);
  });
});
