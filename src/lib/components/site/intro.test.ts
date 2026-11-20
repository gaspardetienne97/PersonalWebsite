import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

const { shortcutListener } = await import("./intro.svelte");

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
