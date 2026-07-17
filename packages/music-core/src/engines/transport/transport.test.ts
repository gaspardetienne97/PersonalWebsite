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
    const clicks: TransportEvent[] = [];
    const events: TransportEvent[] = [];
    const transport = new TransportEngine(mock.clock, {
      bpm: 120,
      quantizationGrid: "8n",
      onMetronomeClick: (event) => clicks.push(event),
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
    expect(events.map((event) => event.absoluteBeat)).toEqual([0, 0, 1, 1, 2]);
    expect(clicks.map(({ atSeconds, accented }) => ({ atSeconds, accented }))).toEqual([
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

  test.each([
    { meter: "4/4", numerator: 4, denominator: 4, interval: "4n", toneBpm: 120 },
    { meter: "3/4", numerator: 3, denominator: 4, interval: "4n", toneBpm: 120 },
    { meter: "2/2", numerator: 2, denominator: 2, interval: "2n", toneBpm: 240 },
    { meter: "6/8", numerator: 6, denominator: 8, interval: "8n", toneBpm: 60 },
  ] as const)("uses literal denominator-note pulses in $meter", (meter) => {
    const mock = createClockMock();
    const events: TransportEvent[] = [];
    const clicks: TransportEvent[] = [];
    const transport = new TransportEngine(mock.clock, {
      bpm: 120,
      numerator: meter.numerator,
      denominator: meter.denominator,
      countInBars: 1,
      quantizationGrid: meter.interval,
      onMetronomeClick: (event) => clicks.push(event),
    });
    transport.subscribe((event) => events.push(event));

    transport.start();
    for (let pulse = 0; pulse <= meter.numerator; pulse += 1) mock.tick(pulse * 0.5);

    expect(mock.clock.bpm.value).toBe(meter.toneBpm);
    expect(mock.clock.scheduleRepeat).toHaveBeenCalledWith(expect.any(Function), meter.interval, 0);
    expect(events.map(({ beat }) => beat)).toEqual([
      ...Array.from({ length: meter.numerator }, (_, beat) => beat),
      0,
    ]);
    expect(events.map(({ countingIn }) => countingIn)).toEqual([
      ...Array.from({ length: meter.numerator }, () => true),
      false,
    ]);
    expect(clicks).toEqual(events);
  });

  test("ignores callbacks that arrive after stop", () => {
    const mock = createClockMock();
    const events: TransportEvent[] = [];
    const transport = new TransportEngine(mock.clock);
    transport.subscribe((event) => events.push(event));

    transport.start();
    mock.tick(0);
    transport.stop();
    mock.tick(0.5);

    expect(events).toHaveLength(1);
  });
});
