#!/usr/bin/env node
// Contact sheets of a round's captured screens, one PNG per flow, for a quick look over
// everything that was shot (and for writing the round's bugs list).
//   node scripts/ui-climb/sheet.mjs --project site --round 0 [flow ...]
// Writes <work>/shots/<round>/_sheets/<flow>-<n>.png, twelve screens per sheet, each labelled
// with its file name. Whole-page shots are left out unless --full is given.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { flowsOf, projectFrom } from "./projects.mjs";

const args = process.argv.slice(2);
const project = projectFrom(args);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const round = opt("round", "0");
const full = args.includes("--full");
const only = args.filter((a) => !a.startsWith("--"));
const dirs = [...new Set((await flowsOf(project)).flatMap((f) => f.shots))].filter(
  (d) => !only.length || only.includes(d),
);
const shots = join(project.dir, "shots", round);
const out = join(shots, "_sheets");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
for (const dir of dirs) {
  let files;
  try {
    files = readdirSync(join(shots, dir)).filter(
      (f) => f.endsWith(".png") && f.includes("-full.png") === full,
    );
  } catch {
    continue;
  }
  // Desktop first, then phone, so each sheet holds one shape of image.
  files.sort((a, b) => a.includes("--phone") - b.includes("--phone") || a.localeCompare(b));
  for (let n = 0; n * 12 < files.length; n++) {
    const part = files.slice(n * 12, n * 12 + 12);
    const html = `<body style="margin:0;background:#888;font:12px system-ui;display:grid;grid-template-columns:repeat(${part[0].includes("--phone") ? 6 : 4},1fr);gap:8px;padding:8px">${part
      .map(
        (f) =>
          `<figure style="margin:0;background:#fff;padding:4px"><img src="${pathToFileURL(join(shots, dir, f))}" style="width:100%;display:block"><figcaption>${f.replace(".png", "")}</figcaption></figure>`,
      )
      .join("")}</body>`;
    const file = join(out, `${dir}-${n + 1}.html`);
    writeFileSync(file, html);
    await page.goto(pathToFileURL(file).href);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: join(out, `${dir}${full ? "-full" : ""}-${n + 1}.png`),
      fullPage: true,
    });
  }
}
await browser.close();
console.log(`sheets in ${out}`);
