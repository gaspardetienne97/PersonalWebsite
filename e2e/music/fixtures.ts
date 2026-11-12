// Shared end-to-end fixtures for the music app: a fake Web MIDI device driven
// through the real app (the technique that caught the real MIDI bugs before),
// and a synthetic microphone fed through the real getUserMedia path.
import { expect, type Page, type Locator } from "@playwright/test";

export interface FakePort {
  id: string;
  name: string;
  manufacturer: string;
}

export const PORTS = {
  keys: { id: "in-keys", name: "Digital Piano", manufacturer: "Roland" },
  mpcPublic: { id: "in-mpc-public", name: "MPC One+ Public", manufacturer: "Akai" },
  mpcPrivate: { id: "in-mpc-private", name: "MPC One+ Private", manufacturer: "Akai" },
  aerophone: { id: "in-ae", name: "Aerophone AE-10", manufacturer: "Roland" },
} satisfies Record<string, FakePort>;

/** Install before the app loads. `window.__midi.send(portId, bytes, at?)` fires a message; sent frames land in `window.__midi.sent`. */
export async function installFakeMidi(
  page: Page,
  inputs: FakePort[] = Object.values(PORTS),
  opts: { sysex?: boolean } = {},
) {
  await page.addInitScript(
    ({ inputs, sysex }) => {
      const mk = (p: { id: string; name: string; manufacturer: string }, type: string) => ({
        ...p,
        type,
        state: "connected",
        connection: "open",
        onmidimessage: null as null | ((e: { data: Uint8Array; timeStamp: number }) => void),
        open: async () => {},
        close: async () => {},
        send(bytes: number[]) {
          (window as any).__midi.sent.push({ port: p.id, bytes: Array.from(bytes) });
        },
        addEventListener() {},
        removeEventListener() {},
      });
      const ins = new Map(inputs.map((p) => [p.id, mk(p, "input")]));
      const outs = new Map([
        [
          "out-mpc-private",
          mk({ id: "out-mpc-private", name: "MPC One+ Private", manufacturer: "Akai" }, "output"),
        ],
      ]);
      (window as any).__midi = {
        sent: [] as { port: string; bytes: number[] }[],
        /** `at`: the message's timestamp (performance.now() when left out), so a test can stamp a stroke exactly. */
        send(id: string, bytes: number[], at?: number) {
          ins
            .get(id)
            ?.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: at ?? performance.now() });
        },
      };
      Object.defineProperty(navigator, "requestMIDIAccess", {
        configurable: true,
        value: async (o: { sysex?: boolean } = {}) => {
          if (o.sysex && sysex === false) throw new DOMException("SysEx denied", "NotAllowedError");
          return {
            inputs: ins,
            outputs: outs,
            sysexEnabled: !!o.sysex,
            onstatechange: null,
            addEventListener() {},
            removeEventListener() {},
          };
        },
      });
    },
    { inputs, sysex: opts.sysex ?? true },
  );
}

export async function midiNote(
  page: Page,
  portId: string,
  midi: number,
  velocity = 100,
  channel = 1,
  holdMs = 90,
) {
  await page.evaluate(
    ({ portId, midi, velocity, channel }) =>
      (window as any).__midi.send(portId, [0x90 | (channel - 1), midi, velocity]),
    { portId, midi, velocity, channel },
  );
  await page.waitForTimeout(holdMs);
  await page.evaluate(
    ({ portId, midi, channel }) =>
      (window as any).__midi.send(portId, [0x80 | (channel - 1), midi, 0]),
    { portId, midi, channel },
  );
}

/**
 * Replace getUserMedia with an oscillator stream so the real mic path runs.
 * `window.__mic.set(hz, gain)` changes the tone; hz 0 is silence.
 */
export async function installSyntheticMic(page: Page, hz = 110) {
  await page.addInitScript((hz) => {
    let osc: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    (window as any).__mic = {
      set(f: number, g = 0.4) {
        if (!osc || !gain) return;
        osc.frequency.value = f || 1;
        gain.gain.value = f ? g : 0;
      },
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = hz;
      gain.gain.value = 0.4;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      return dest.stream;
    };
  }, hz);
}

/** Press an on-screen key/pad/fret by its data-midi (or any selector) for `holdMs`. */
export async function tap(page: Page, selector: string, holdMs = 90) {
  const el = page.locator(selector).first();
  await el.dispatchEvent("pointerdown", { pointerId: 9, button: 0, bubbles: true });
  await page.waitForTimeout(holdMs);
  await el.dispatchEvent("pointerup", { pointerId: 9, button: 0, bubbles: true });
}

/** The page never scrolls sideways (the most repeated layout defect). */
export async function expectNoHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw, "horizontal page overflow").toBeLessThanOrEqual(iw);
}

/** The ready screen's setup sentence ("C major, 80 BPM, Practice"): the one way into Setup. */
export const setupLine = (page: Page) => page.getByTestId("setup-line");

/** Open the Setup panel from the setup sentence (or close it with `open` false); nothing when it already is. */
export async function openSetup(page: Page, open = true) {
  const line = setupLine(page);
  await expect(async () => {
    if ((await line.getAttribute("aria-expanded")) !== String(open)) await line.click();
    await expect(line).toHaveAttribute("aria-expanded", String(open), { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** The Practice or Check button: Setup's "Mode" group (open Setup first to see it). */
export const modeButton = (page: Page, mode: "Practice" | "Check") =>
  page.locator('[data-setup="run-mode"]').getByRole("button", { name: mode, exact: true });

/** Pick Practice or Check in Setup, then leave Setup as it was (closed, unless the test had it open). */
export async function pickMode(page: Page, mode: "Practice" | "Check") {
  const line = setupLine(page);
  const wasOpen = (await line.getAttribute("aria-expanded")) === "true";
  await openSetup(page);
  await modeButton(page, mode).click();
  await expect(line.or(page.getByTestId("lesson")).first()).toBeVisible();
  // Check can open a lesson (a concept card), which takes the screen: then there is no Setup to close.
  if (!wasOpen && (await line.isVisible())) await openSetup(page, false);
}

/** Start a drill and wait for the count-in to finish. */
export async function startDrill(page: Page, mode: "Practice" | "Check" = "Practice") {
  await pickMode(page, mode);
  await page.getByRole("button", { name: /^(Start|Again)$/ }).click();
  await expect(page.getByRole("status")).toContainText(/Go\.|Listen|Play|Question/, {
    timeout: 10_000,
  });
}

/** On a shared dev server, keep other edits' HMR reloads from interrupting a run. */
export async function muteHmr(page: Page) {
  await page.routeWebSocket(
    () => true,
    () => {},
  );
}

/**
 * Pick an option in one of the app's dropdowns (Picker: a button that opens a
 * listbox drawn at the app's root, so it is found on the page, not in the
 * trigger's container).
 */
export async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: option, exact: typeof option === "string" })
    .click();
  // The list fades out; wait until it has gone so the next click lands on the page.
  await expect(page.getByRole("listbox")).toHaveCount(0);
}
