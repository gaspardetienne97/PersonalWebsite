import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

const { growSiteBoard, shortcutListener } = await import("./intro.svelte");

const key = (code: string, timeStamp: number, mods = { ctrlKey: true, shiftKey: true }) => ({
  code,
  timeStamp,
  ...mods,
});

describe("shortcutListener", () => {
  it("fires on Ctrl+Shift+G, M, E in order", () => {
    const onMatch = vi.fn();
    const listen = shortcutListener(onMatch);
    expect(listen(key("KeyG", 0))).toBe(true);
    expect(listen(key("KeyM", 100))).toBe(true);
    expect(listen(key("KeyE", 200))).toBe(true);
    expect(onMatch).toHaveBeenCalledOnce();
  });

  it("needs both modifiers held", () => {
    const onMatch = vi.fn();
    const listen = shortcutListener(onMatch);
    listen(key("KeyG", 0));
    listen(key("KeyM", 100, { ctrlKey: true, shiftKey: false }));
    listen(key("KeyE", 200));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("starts over after a wrong key or a long pause", () => {
    const onMatch = vi.fn();
    const listen = shortcutListener(onMatch, 1000);
    listen(key("KeyG", 0));
    expect(listen(key("KeyX", 50))).toBe(false);
    listen(key("KeyE", 100));
    listen(key("KeyG", 200));
    listen(key("KeyM", 2000));
    listen(key("KeyE", 2100));
    expect(onMatch).not.toHaveBeenCalled();
    listen(key("KeyG", 3000));
    listen(key("KeyM", 3100));
    listen(key("KeyE", 3200));
    expect(onMatch).toHaveBeenCalledOnce();
  });
});

describe("growSiteBoard", () => {
  const ring = { cx: 195, cy: 320, r: 78 };
  // A phone screen, with the name's block across almost its whole width under the logo.
  const name = { x: 8, y: 430, w: 374, h: 150 };
  const inside = (p: { x: number; y: number }) =>
    p.x > name.x && p.x < name.x + name.w && p.y > name.y && p.y < name.y + name.h;

  it("keeps every trace out of a clear area, and still fills the screen under it", () => {
    const board = growSiteBoard(390, 844, ring, 7, [name]);
    const points = board.chains.flatMap((chain) => chain.points);
    expect(points.length).toBeGreaterThan(0);
    expect(points.filter(inside)).toEqual([]);
    expect(points.some((p) => p.y > name.y + name.h + 64)).toBe(true);
  });

  it("leaves no hole when nothing is to be kept clear", () => {
    const board = growSiteBoard(390, 844, ring, 7);
    expect(board.chains.flatMap((chain) => chain.points).some(inside)).toBe(true);
  });
});
