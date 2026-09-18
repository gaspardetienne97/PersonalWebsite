import { expect, test, vi } from "vitest";
import { monotonicMs } from "@repo/music-core/domain";
import { createToneTransportEngine } from "./index";
const clock = vi.hoisted(() => ({
  bpm: { value: 120 },
  scheduleRepeat: vi.fn(),
  clear: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("tone", () => ({ getTransport: () => clock, now: () => 10.1, immediate: () => 10 }));
test("factory projects against raw audio time rather than lookahead scheduling time", async () => {
  const transport = await createToneTransportEngine({ monotonicNowMs: () => monotonicMs(5000) });
  const listener = vi.fn();
  transport.subscribe(listener);
  transport.start();
  clock.scheduleRepeat.mock.calls[0][0](10.1);
  expect(listener.mock.calls[0][0].atMonotonicMs).toBeCloseTo(5100);
  transport.stop();
});
