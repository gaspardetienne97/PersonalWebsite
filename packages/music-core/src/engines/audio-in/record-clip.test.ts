import { expect, test, vi } from "vite-plus/test";

import { prepareMicClip } from "./record-clip";

test("prepares the stream without recording and releases it on disposal", async () => {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const prepared = await prepareMicClip({ getStream: vi.fn(async () => stream) });

  expect(stop).not.toHaveBeenCalled();
  prepared.dispose();
  expect(stop).toHaveBeenCalledOnce();
});
