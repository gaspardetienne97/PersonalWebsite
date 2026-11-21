// Helpers for the Narrator (/pdf) captures.
//
// Speech: the system engine uses the Web Speech API. Headless Chromium on macOS exposes the
// machine's real voices and would speak out loud, so every capture replaces
// `speechSynthesis` with a silent stand-in: a fixed voice list, and `speak` that fires the
// start, word-boundary and end events at the pace of the app's own timeline (165 words per
// minute, see packages/pdf-core/src/domain/model.ts). The player, the word marking and the
// time shown are the app's own; only the sound is missing. Captions of playing states say so.
//
// Selectors are structural (classes and roles, not labels) so the same steps run in French.
import { expect, type Page } from "@playwright/test";
import { prepare, settle, snap, type Locale, type Theme, type Width } from "../capture-common.ts";
import { ensureFixtures, FILES } from "../fixtures.mjs";

export { FILES };
export type FakeVoice = { name: string; lang: string; localService: boolean; default: boolean };

/** What a Mac with Chrome typically lists, cut down: device voices in a few languages and two network voices. */
export const VOICES: FakeVoice[] = [
  { name: "Samantha", lang: "en-US", localService: true, default: true },
  { name: "Alex", lang: "en-US", localService: true, default: false },
  { name: "Ava (Premium)", lang: "en-US", localService: true, default: false },
  { name: "Daniel", lang: "en-GB", localService: true, default: false },
  { name: "Karen", lang: "en-AU", localService: true, default: false },
  { name: "Moira", lang: "en-IE", localService: true, default: false },
  { name: "Amélie", lang: "fr-CA", localService: true, default: false },
  { name: "Thomas", lang: "fr-FR", localService: true, default: false },
  { name: "Mónica", lang: "es-ES", localService: true, default: false },
  { name: "Paulina", lang: "es-MX", localService: true, default: false },
  { name: "Google US English", lang: "en-US", localService: false, default: false },
  { name: "Google UK English Female", lang: "en-GB", localService: false, default: false },
  { name: "Google français", lang: "fr-FR", localService: false, default: false },
];

export const SPEECH_NOTE =
  "speech is silent in the capture, the marking and times are the app's own";

/** Replace speechSynthesis with the silent stand-in. `voices: []` is a device with no voices. */
export async function fakeSpeech(page: Page, voices: FakeVoice[] = VOICES) {
  await page.addInitScript((voices) => {
    const MS_PER_WORD = 60_000 / 165;
    const SENTENCE_PAUSE = 380;
    const list = voices.map((v) => ({ ...v, voiceURI: v.name }));
    let timers: ReturnType<typeof setTimeout>[] = [];
    const fake = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      getVoices: () => list,
      speak(u: SpeechSynthesisUtterance) {
        fake.cancel();
        fake.speaking = true;
        const rate = u.rate || 1;
        let at = 30;
        let char = 0;
        timers.push(setTimeout(() => u.onstart?.(new Event("start") as SpeechSynthesisEvent), 15));
        for (const word of u.text.split(/\s+/).filter(Boolean)) {
          const charIndex = char;
          timers.push(
            setTimeout(
              () =>
                u.onboundary?.({
                  name: "word",
                  charIndex,
                  charLength: word.length,
                } as unknown as SpeechSynthesisEvent),
              at,
            ),
          );
          const letters = word.replace(/[^A-Za-z0-9]/g, "").length;
          at += (MS_PER_WORD * Math.min(1.9, Math.max(0.7, letters / 5))) / rate;
          char += word.length + 1;
        }
        timers.push(
          setTimeout(
            () => {
              fake.speaking = false;
              u.onend?.(new Event("end") as SpeechSynthesisEvent);
            },
            at + SENTENCE_PAUSE / rate,
          ),
        );
      },
      cancel() {
        timers.forEach(clearTimeout);
        timers = [];
        fake.speaking = false;
      },
      pause() {},
      resume() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => fake });
    // The stand-in voices are plain objects, which the real `voice` setter refuses.
    const held = new WeakMap<object, unknown>();
    Object.defineProperty(SpeechSynthesisUtterance.prototype, "voice", {
      configurable: true,
      get() {
        return held.get(this) ?? null;
      },
      set(v) {
        held.set(this, v);
      },
    });
  }, voices);
}

/** A fresh Narrator page at a width, with silent speech. */
export async function narrator(
  page: Page,
  width: Width,
  opts: { theme?: Theme; locale?: Locale; voices?: FakeVoice[] } = {},
) {
  await ensureFixtures();
  await prepare(page, width, opts);
  await fakeSpeech(page, opts.voices);
}

export async function openLibrary(page: Page) {
  await page.goto("/pdf");
  await expect(page.locator(".narrator header.bar")).toBeVisible({ timeout: 60_000 });
  await settle(page, 500);
}

export async function openSettings(page: Page) {
  await page.goto("/pdf/settings");
  await expect(page.locator(".narrator .wrap h1")).toBeVisible({ timeout: 60_000 });
  await settle(page, 500);
}

const themeCount = new WeakMap<Page, Theme[]>();

/**
 * The themes Narrator really has. It is built dark; the site's theme switch does not reach
 * it. This flips the colour scheme and compares the app's background, so a light theme
 * added in a later round is shot without touching the harness.
 */
async function themesOf(page: Page): Promise<Theme[]> {
  const known = themeCount.get(page);
  if (known) return known;
  const background = () =>
    page.evaluate(() => {
      // The app's own surface only: the site's body behind it does follow the theme, unseen.
      const el = document.querySelector(".narrator") ?? document.body;
      const s = getComputedStyle(el);
      return `${s.backgroundColor}|${s.color}|${s.getPropertyValue("--n-bg-0")}`;
    });
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(150);
  const light = await background();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(150);
  const dark = await background();
  const themes: Theme[] = light === dark ? ["dark"] : ["light", "dark"];
  themeCount.set(page, themes);
  return themes;
}

/** `snap` for Narrator: both themes when the app has two, otherwise its one (dark) theme. */
export async function nsnap(
  page: Page,
  flow: string,
  state: string,
  width: Width,
  caption: string,
  opts: Parameters<typeof snap>[5] = {},
) {
  await snap(page, flow, state, width, caption, { themes: await themesOf(page), ...opts });
}

export type Kind = "pdf" | "epub" | "txt";
// One tab takes every file (the kind is detected), the other takes pasted text.
const TAB = { file: 0, paste: 1 } as const;

/** Open the add modal from the library's app bar. */
export async function openAdd(page: Page) {
  await page.locator("header.bar button").last().click();
  await expect(page.locator(".overlay[role=dialog]")).toBeVisible();
  await settle(page, 250);
}

export async function pickTab(page: Page, tab: keyof typeof TAB) {
  await page.locator(".overlay [role=tab]").nth(TAB[tab]).click();
  await settle(page, 150);
}

/** Upload a file through the add modal (already open on any tab). Does not wait for the result. */
export async function chooseFile(page: Page, file: string) {
  await page.setInputFiles(".overlay input.file-input", file);
}

/** Add a real file from the library and land in its reader. */
export async function addFile(page: Page, kind: Kind) {
  await openAdd(page);
  await chooseFile(page, FILES[kind]);
  await expect(page.locator(".root .top")).toBeVisible({ timeout: 30_000 });
  await settle(page, 400);
}

export const reader = {
  back: (page: Page) => page.locator(".root .top > button.back"),
  flow: (page: Page) => page.locator(".root .seg-btn").nth(0),
  document: (page: Page) => page.locator(".root .seg-btn").nth(1),
  settings: (page: Page) => page.locator(".root .settings-anchor > button"),
  play: (page: Page) => page.locator(".root button.play"),
  speed: (page: Page) => page.locator(".root .extras .chip").nth(0),
  chapters: (page: Page) => page.locator(".root .extras .chip").nth(1),
  voice: (page: Page) => page.locator(".root .voice-chip"),
  track: (page: Page) => page.locator(".root .scrubber .track"),
};

/** Jump the playhead by clicking the scrubber at a fraction of its width. */
export async function seek(page: Page, fraction: number) {
  const box = await reader.track(page).boundingBox();
  if (!box) throw new Error("no scrubber");
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  // A pointer left on the track keeps its time tip up: move away, so the next shot is clean.
  await page.mouse.move(2, 2);
  await settle(page, 200);
}

export async function backToLibrary(page: Page) {
  await reader.back(page).click();
  await expect(page.locator(".narrator header.bar")).toBeVisible();
  await settle(page, 300);
}

/** Open a document from the library by its title. */
export async function openDoc(page: Page, title: string) {
  await page.locator(".card button.title", { hasText: title }).first().click();
  await expect(page.locator(".root .top")).toBeVisible();
  await settle(page, 500);
}

/** Start playback and wait until a word is marked and the playhead has moved for `ms`. */
export async function play(page: Page, ms = 3500) {
  await reader.play(page).click();
  await expect(page.locator(".word.current").first()).toBeVisible();
  await page.waitForTimeout(ms);
}

/**
 * A library a listener has used: the three fixture files uploaded for real (PDF, EPUB, text)
 * beside the four samples, with Walden most of the way through and Alice just begun.
 */
export async function usedLibrary(page: Page) {
  await openLibrary(page);
  await addFile(page, "txt");
  await backToLibrary(page);
  await addFile(page, "epub");
  await seek(page, 0.14);
  await backToLibrary(page);
  await addFile(page, "pdf");
  await seek(page, 0.71);
  await backToLibrary(page);
}

/** Refuse every request for the natural voice's model, as a blocked or offline network would. */
export async function blockModel(page: Page) {
  await page.route(/huggingface\.co|\.hf\.co/, (route) => route.abort("failed"));
}
