// MPC pads, Aerophone and Connect, driven through fake Web MIDI ports the way
// the owner's hardware behaves: two MPC ports (Public ignored, Private carrying
// Akai Classic notes on channel 10), the controller link, a full reload, and an
// Aerophone sending breath on CC 2.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, expectNoHorizontalOverflow, installFakeMidi, midiNote, choose } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/pads-winds-connect";
const HEARTBEAT = [0xf0, 0x47, 0x00, 0x56, 0x52, 0x00, 0x04, 0x41, 0x67, 0x16, 0x00, 0xf7];
const IDENTITY = [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7];

type Sent = { port: string; bytes: number[] }[];
const sent = (page: Page) => page.evaluate(() => (window as any).__midi.sent as Sent);
const count = (list: Sent, frame: number[]) =>
  list.filter((f) => f.bytes.join() === frame.join()).length;

async function shoot(page: Page, name: string) {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await expectNoHorizontalOverflow(page);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (d) => document.documentElement.classList.toggle("dark", d),
        theme === "dark",
      );
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1280, height: 900 });
}

/** Schedule hardware notes against the drill's downbeat, inside the page for timing accuracy. */
async function playAt(
  page: Page,
  notes: { port: string; midi: number; atMs: number; channel?: number; velocity?: number }[],
) {
  const stage = page.getByTestId("pads-stage");
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await page.evaluate(
    ({ notes, downbeat }) => {
      for (const n of notes) {
        const st = 0x90 | ((n.channel ?? 10) - 1);
        const wait = downbeat + n.atMs - performance.now();
        setTimeout(
          () => (window as any).__midi.send(n.port, [st, n.midi, n.velocity ?? 100]),
          wait,
        );
        setTimeout(() => (window as any).__midi.send(n.port, [st & 0xef, n.midi, 0]), wait + 60);
      }
    },
    { notes, downbeat },
  );
}

test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
});

test("MPC: Akai Classic map, controller link, reload, rudiment and groove", async ({ page }) => {
  test.setTimeout(90_000);
  await installFakeMidi(page, [PORTS.mpcPublic, PORTS.mpcPrivate]);
  await page.goto("/music/connect");
  await expect(page.getByRole("heading", { level: 1, name: "Connect" })).toBeVisible();
  await page.getByRole("button", { name: "Enable MIDI" }).click();

  const priv = page.getByTestId(`device-${PORTS.mpcPrivate.id}`);
  const pub = page.getByTestId(`device-${PORTS.mpcPublic.id}`);
  await choose(page, priv.getByLabel("Pad notes (what your drum program sends)"), /^Akai/);
  await expect(priv.getByLabel("Pad notes (what your drum program sends)")).toHaveAttribute(
    "data-value",
    "akai-classic",
  );
  await pub.getByRole("button", { name: "Hide this device" }).click();
  await expect(pub.getByRole("button", { name: "Show this device" })).toBeVisible();

  // Link: the full handshake now, then a heartbeat every second.
  await page.getByRole("button", { name: "Keep linked (init + heartbeat)" }).click();
  await expect(page.getByTestId("mpc-state")).toContainText("Linked and holding");
  // One heartbeat is in the init; two or more follow on the one-second interval.
  await expect
    .poll(async () => count(await sent(page), HEARTBEAT), { timeout: 6000 })
    .toBeGreaterThanOrEqual(3);
  const frames = await sent(page);
  expect(count(frames, IDENTITY)).toBe(1);
  expect(frames.every((f) => f.port === "out-mpc-private")).toBe(true);
  expect(frames.length).toBeGreaterThanOrEqual(10);

  // The hidden device's bytes still show in Recent input.
  await midiNote(page, PORTS.mpcPublic.id, 40, 100, 10);
  const activity = page.getByTestId("activity");
  await expect(activity).toContainText("99 28 64");
  await expect(activity).toContainText("hidden");
  await midiNote(page, PORTS.mpcPrivate.id, 37, 100, 10);
  await expect(activity).toContainText("99 25 64");
  await shoot(page, "connect");

  // Client-side navigation keeps MIDI and the link: hardware 37 lights pad A01.
  await page.getByRole("link", { name: "Try the pads drill" }).click();
  await expect(page).toHaveURL(/\/music\/pads$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pads" })).toBeVisible();
  await page.evaluate(
    (id) => (window as any).__midi.send(id, [0x99, 37, 100]),
    PORTS.mpcPrivate.id,
  );
  await expect(page.getByRole("button", { name: /^Pad A01/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("midi-status")).toContainText(
    "Hearing MPC One+ Private. Last hit: pad A01.",
  );
  await page.evaluate((id) => (window as any).__midi.send(id, [0x89, 37, 0]), PORTS.mpcPrivate.id);
  await expect(page.getByRole("button", { name: /^Pad A01/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await midiNote(page, PORTS.mpcPublic.id, 37, 100, 10);
  await expect(page.getByTestId("midi-status")).toContainText("dropped: that device is hidden");

  // Full reload on a path-check URL: MIDI must come back on by itself, and the link with it.
  await page.goto(
    "/music/pads?mode=rudiment&pattern=single-strokes&sub=2&hits=8&padL=36&padR=41&bpm=100",
  );
  await expect(page.getByTestId("midi-status")).toContainText(
    "Linked and listening on MPC One+ Private",
    { timeout: 10_000 },
  );
  expect(count(await sent(page), IDENTITY)).toBe(1);
  await expect(page.getByText("Setup:").locator("..")).toContainText(
    "Rudiment: Single strokes, eighths, 8 hits, pads A01 and A06, 100 BPM",
  );
  await shoot(page, "pads-rudiment-ready");

  // Single strokes: hardware 37 / 38 become A01 / A06. The ignored port plays along and must not count.
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: /^Start/ }).click();
  const step = 300; // eighths at 100 BPM
  await playAt(page, [
    ...Array.from({ length: 8 }, (_, i) => ({
      port: PORTS.mpcPrivate.id,
      midi: i % 2 ? 38 : 37,
      atMs: i * step,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      port: PORTS.mpcPublic.id,
      midi: 38,
      atMs: i * step + 150,
    })),
  ]);
  await expect(page.getByRole("status")).toContainText("Clean: every stroke landed", {
    timeout: 15_000,
  });
  const results = page.locator("article").first();
  await expect(results).toContainText("8 of 8");
  await expect(results).toContainText("Velocity evenness"); // MIDI velocity is measured
  await shoot(page, "pads-rudiment-results");

  // Backbeat: kick A01 = hardware 37, snare A03 = hardware 42 in the Akai Classic map.
  await page.goto("/music/pads?mode=groove&groove=backbeat&bpm=90");
  await expect(page.getByTestId("pads-stage")).toContainText("Kick");
  await expect(page.getByTestId("midi-status")).toContainText("Linked and listening", {
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /^Start/ }).click();
  const beat = 60000 / 90;
  await playAt(page, [
    { port: PORTS.mpcPrivate.id, midi: 37, atMs: 0 },
    { port: PORTS.mpcPrivate.id, midi: 42, atMs: beat },
    { port: PORTS.mpcPrivate.id, midi: 37, atMs: 2 * beat },
    { port: PORTS.mpcPrivate.id, midi: 42, atMs: 3 * beat },
    { port: PORTS.mpcPublic.id, midi: 38, atMs: 0.5 * beat },
  ]);
  // Backbeat is a level-1 groove now: the verdict is the level's pass.
  await expect(page.getByRole("status")).toContainText("Passed level 1 at 90 BPM", {
    timeout: 15_000,
  });
  await expect(page.getByRole("table").first()).toContainText("Kick");
  await shoot(page, "pads-groove-results");
});

test("Aerophone: long tone with breath on CC 2", async ({ page }) => {
  test.setTimeout(60_000);
  await installFakeMidi(page, [PORTS.aerophone]);
  await page.goto("/music/connect");
  await page.getByRole("button", { name: "Enable MIDI" }).click();
  await expect(page.getByTestId(`device-${PORTS.aerophone.id}`)).toContainText("Aerophone");

  await page.goto("/music/aerophone?mode=long-tone&target=67&seconds=3");
  await expect(page.getByRole("heading", { level: 1, name: "Aerophone" })).toBeVisible();
  await expect(page.getByTestId("midi-status")).toContainText("Listening on Aerophone AE-10", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("aerophone-stage")).toContainText("Fingering verified");
  await shoot(page, "aerophone-ready");

  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByRole("status")).toContainText("Play and hold G4");
  await page.evaluate((id) => {
    const send = (b: number[]) => (window as any).__midi.send(id, b);
    send([0x90, 67, 90]);
    let i = 0;
    const t = setInterval(() => {
      send([0xb0, 2, 80 + ((i++ % 3) - 1)]);
      if (i > 68) {
        clearInterval(t);
        send([0x80, 67, 0]);
      }
    }, 50);
  }, PORTS.aerophone.id);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/aerophone-running-1280-light.png` });
  await expect(page.getByRole("status")).toContainText("Steady G4 for 3 seconds.", {
    timeout: 10_000,
  });
  const results = page.locator("article").first();
  await expect(results).toContainText("Breath steadiness");
  await expect(results).not.toContainText("Not measured");
  await shoot(page, "aerophone-results");
});

test("Aerophone fingering: Roland's first lesson, a slip named, the octave crescent", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installFakeMidi(page, [PORTS.aerophone]);
  await page.goto("/music/connect");
  await page.getByRole("button", { name: "Enable MIDI" }).click();
  await expect(page.getByTestId(`device-${PORTS.aerophone.id}`)).toContainText("Aerophone");
  await page.goto("/music/aerophone?mode=fingering&lesson=g-a-b");
  await expect(page.getByTestId("midi-status")).toContainText("Listening on Aerophone AE-10", {
    timeout: 10_000,
  });
  // G4 lights keys 1 to 3 and nothing else.
  const lit = () =>
    page
      .locator("[data-testid=aerophone-stage] path[data-on]")
      .evaluateAll((ps) => [...new Set(ps.map((p) => p.getAttribute("data-key")))].sort());
  expect(await lit()).toEqual(["k1", "k2", "k3"]);
  await shoot(page, "aerophone-fingering-ready");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByRole("status")).toContainText("Finger G4");
  const play = (midi: number) =>
    page.evaluate(
      ({ id, midi }) => {
        (window as any).__midi.send(id, [0x90, midi, 90]);
        (window as any).__midi.send(id, [0x80, midi, 0]);
      },
      { id: PORTS.aerophone.id, midi },
    );
  // A slip: G#4 instead of G4, so the G# key went down.
  await play(68);
  await expect(page.getByTestId("fingering-slip")).toContainText("Lift G# (left pinky)");
  await page.screenshot({ path: `${SHOTS}/aerophone-fingering-slip-1280-light.png` });
  for (const n of [67, 69, 71, 69, 67]) {
    await play(n);
    await page.waitForTimeout(80);
  }
  await expect(page.getByRole("status")).toContainText("4 of 5 right on the first try", {
    timeout: 10_000,
  });
  await shoot(page, "aerophone-fingering-results");

  // D5 needs the octave key: the +1 thumb crescent lights.
  await page.goto("/music/aerophone?mode=long-tone&target=74");
  await expect.poll(lit).toContain("oct+1");
});

test("Aerophone and pads with on-screen input only say what they cannot measure", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/music/aerophone?mode=long-tone&target=67&seconds=3");
  await expect(page.getByTestId("midi-status")).toContainText(/MIDI is off|unavailable/);
  await page.getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByRole("status")).toContainText("Play and hold G4");
  const g4 = page.getByRole("button", { name: "Play G4" });
  await g4.dispatchEvent("pointerdown", { pointerId: 7, button: 0, bubbles: true });
  await expect(g4).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(3300);
  // The run ends on its own at 3 s and the results hide the stage (still mounted): the finger lifts there.
  await page
    .getByRole("button", { name: "Play G4", includeHidden: true })
    .dispatchEvent("pointerup", { pointerId: 7, button: 0, bubbles: true });
  await expect(page.getByRole("status")).toContainText("Breath needs the Aerophone", {
    timeout: 10_000,
  });
  await expect(page.locator("article").first()).toContainText("Not measured");

  for (const mode of ["swell", "articulation", "interval-landing"]) {
    await page.goto(`/music/aerophone?mode=${mode}`);
    await expect(page.getByRole("heading", { level: 1, name: "Aerophone" })).toBeVisible();
    await shoot(page, `aerophone-${mode}`);
  }
  await page.goto("/music/pads?mode=groove&groove=turnaround-fill&bpm=80");
  await expect(page.getByTestId("pads-stage")).toContainText("fill");
  await shoot(page, "pads-groove-fill");
});

test("the strip's input pop-up turns MIDI on and chooses its devices", async ({ page }) => {
  await installFakeMidi(page, [PORTS.keys, PORTS.mpcPublic]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/music/scales");
  await page.getByRole("button", { name: /^Sound and input: .*MIDI off, microphone off/ }).click();
  // The pop-up only: the drill's own input notice has a "Turn on" button too.
  const panel = page.getByTestId("input-panel");
  await expect(panel.getByRole("button", { name: "Turn on the microphone" })).toBeVisible();
  await panel.getByRole("button", { name: "Turn on MIDI" }).click();
  const keys = panel.getByRole("button", { name: /Digital Piano/ });
  const mpc = panel.getByRole("button", { name: /MPC One\+ Public/ });
  await expect(keys).toHaveAttribute("aria-pressed", "true");
  // The keyboard can play as another instrument; the MPC is left out.
  await panel
    .getByRole("combobox", { name: /^Plays as/ })
    .first()
    .selectOption("guitar");
  await mpc.click();
  await expect(mpc).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: `${SHOTS}/strip-input-1280.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Sound and input: .*MIDI on,/ })).toBeVisible();
  // The choice is the device's ignored flag, the same one Connect shows.
  await page.goto("/music/connect");
  await expect(page.getByText(/hidden: its notes don't reach drills/)).toBeVisible();
  await expect(page.getByText("Guitar", { exact: true }).first()).toBeVisible();
});
