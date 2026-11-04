#!/usr/bin/env node
// UI hill climb judge council. Each panel is one flow: a set of candidates (one app's
// screenshots each), shown unlabelled and shuffled to three judges in fresh contexts.
// Judges see screenshots only. Raw judge JSON and the merged result land in the round dir.
//
//   node scripts/ui-climb/judge.mjs --round 3 panels/*.json [--only opus,astra] [--jobs 6]
//
// Panel file: { "id": "today", "flow": "Today / home screen", "job": "what the screens are for",
//   "candidates": [{ "key": "woodshed", "images": [{ "path": "...png", "caption": "desktop, light" }] }, ...] }

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const WORK = join(ROOT, ".ui-climb");
const PATH_ENV = `/opt/homebrew/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`;

export const JUDGES = {
  astra: { kind: "codex", model: "gpt-6-astra", effort: "high" },
  opus: { kind: "claude", model: "claude-opus-5-5" },
  fable: { kind: "claude", model: "claude-fable-5-1" },
};

const DIMS = [
  "visual",
  "clarity",
  "engagement",
  "teaching",
  "flow",
  "phone",
  "accessibility",
  "consistency",
];

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "scores", "overall", "flaws"],
        properties: {
          label: { type: "string" },
          scores: {
            type: "object",
            additionalProperties: false,
            required: DIMS,
            properties: Object.fromEntries(
              DIMS.map((d) => [
                d,
                d === "phone" ? { type: ["number", "null"] } : { type: "number" },
              ]),
            ),
          },
          overall: { type: "number" },
          flaws: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["screen", "problem", "fix"],
              properties: {
                screen: { type: "string" },
                problem: { type: "string" },
                fix: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

function shuffle(a, seed) {
  // Deterministic per panel and round so reruns reproduce the order.
  let s = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function prepare(panel, round) {
  const dir = join(tmpdir(), `ui-climb-${round}-${panel.id}-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const order = shuffle(panel.candidates, `${round}:${panel.id}`);
  const letters = "ABCDEFGH";
  const cands = order.map((c, i) => {
    const label = letters[i];
    const images = c.images.map((img, k) => {
      const src = resolve(ROOT, img.path);
      const dst = join(dir, `${label}-${k + 1}${extname(src).toLowerCase()}`);
      copyFileSync(src, dst);
      return { path: dst, caption: img.caption ?? "" };
    });
    return { label, key: c.key, images };
  });
  return { dir, cands };
}

function prompt(panel, cands, rubric, forClaude) {
  const lines = [
    rubric,
    "",
    "---",
    "",
    `## This batch`,
    "",
    `Flow: **${panel.flow}**.`,
    panel.job ? `What these screens are for: ${panel.job}` : "",
    "",
    `There are ${cands.length} candidates, each from a different app. Score every candidate.`,
    "",
  ];
  for (const c of cands) {
    lines.push(`### Candidate ${c.label}`);
    c.images.forEach((img, k) => {
      const where = forClaude ? `\`${img.path}\`` : `attached image ${basename(img.path)}`;
      lines.push(`${k + 1}. ${where}${img.caption ? `: ${img.caption}` : ""}`);
    });
    lines.push("");
  }
  if (forClaude)
    lines.push(
      "Read every image listed above with the Read tool before you score. Look at each one carefully.",
    );
  else lines.push("The images are attached; each file name starts with its candidate letter.");
  lines.push(
    "",
    "Return only JSON matching the schema: one entry per candidate, `label` being the candidate letter.",
  );
  return lines.filter((l) => l !== undefined).join("\n");
}

function run(cmd, args, { input, cwd, timeout = 900_000 }) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, PATH: PATH_ENV } });
    let out = "";
    let err = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      clearTimeout(t);
      res({ code, out, err });
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

async function callJudge(name, panel, prep, rubric) {
  const j = JUDGES[name];
  const text = prompt(panel, prep.cands, rubric, j.kind === "claude");
  if (j.kind === "claude") {
    const r = await run(
      "claude",
      [
        "-p",
        "--model",
        j.model,
        "--setting-sources",
        "project",
        "--strict-mcp-config",
        "--tools",
        "Read",
        "--allowedTools",
        "Read",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--add-dir",
        prep.dir,
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(SCHEMA),
      ],
      { input: text, cwd: prep.dir },
    );
    const d = JSON.parse(r.out || "{}");
    if (!d.structured_output) throw new Error(`${name}: ${r.err.slice(-500)} ${r.out.slice(-500)}`);
    return { result: d.structured_output, cost: d.total_cost_usd ?? null };
  }
  const schemaPath = join(prep.dir, "schema.json");
  const outPath = join(prep.dir, `out-${name}.json`);
  writeFileSync(schemaPath, JSON.stringify(SCHEMA));
  const imgs = prep.cands.flatMap((c) => c.images.flatMap((i) => ["-i", i.path]));
  const r = await run(
    "codex",
    [
      "exec",
      "-m",
      j.model,
      "-c",
      `model_reasoning_effort="${j.effort}"`,
      "-s",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "-C",
      prep.dir,
      "--output-schema",
      schemaPath,
      "-o",
      outPath,
      ...imgs,
      "-",
    ],
    { input: text, cwd: prep.dir },
  );
  if (!existsSync(outPath)) throw new Error(`${name}: ${r.err.slice(-800)}`);
  return { result: JSON.parse(readFileSync(outPath, "utf8")), cost: null };
}

export async function judgePanel(panel, round, judges, rubric) {
  const outDir = join(WORK, "rounds", String(round), panel.id);
  mkdirSync(outDir, { recursive: true });
  const prep = prepare(panel, round);
  const merged = { id: panel.id, flow: panel.flow, round, judges: {}, candidates: {} };
  for (const c of prep.cands)
    merged.candidates[c.key] = { label: c.label, images: c.images.length };
  await Promise.all(
    judges.map(async (name) => {
      const file = join(outDir, `${name}.json`);
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { result, cost } = await callJudge(name, panel, prep, rubric);
          const byKey = {};
          for (const c of prep.cands) {
            const hit = result.candidates.find((x) => x.label.trim().toUpperCase() === c.label);
            if (hit) byKey[c.key] = hit;
          }
          if (Object.keys(byKey).length !== prep.cands.length)
            throw new Error(
              `${name}: missing candidates in ${JSON.stringify(result).slice(0, 300)}`,
            );
          writeFileSync(file, JSON.stringify({ judge: name, cost, raw: result, byKey }, null, 2));
          merged.judges[name] = byKey;
          return;
        } catch (e) {
          console.error(
            `[${panel.id}] ${name} attempt ${attempt} failed: ${String(e).slice(0, 400)}`,
          );
          await new Promise((r) => setTimeout(r, 5000 + Math.random() * 15000 * attempt));
        }
      }
    }),
  );
  // Keep verdicts from judges not run this time (a rerun of one judge must not drop the others).
  for (const j of Object.keys(JUDGES)) {
    const f = join(outDir, `${j}.json`);
    if (!merged.judges[j] && existsSync(f))
      merged.judges[j] = JSON.parse(readFileSync(f, "utf8")).byKey;
  }
  writeFileSync(join(outDir, "merged.json"), JSON.stringify(merged, null, 2));
  return merged;
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k, d) => {
    const i = args.indexOf(`--${k}`);
    if (i < 0) return d;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const round = opt("round", "0");
  const only = opt("only", Object.keys(JUDGES).join(","));
  const jobs = Number(opt("jobs", "4"));
  const skipDone = args.includes("--skip-done");
  const files = args.filter((a) => !a.startsWith("--"));
  const rubric = readFileSync(join(WORK, "rubric.md"), "utf8");
  const judges = only.split(",");
  const panels = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
  await pool(panels, jobs, async (p) => {
    const merged = join(WORK, "rounds", round, p.id, "merged.json");
    if (skipDone && existsSync(merged)) {
      const m = JSON.parse(readFileSync(merged, "utf8"));
      if (judges.every((j) => m.judges[j])) return;
    }
    const t = Date.now();
    const m = await judgePanel(p, round, judges, rubric);
    const line = Object.entries(m.judges)
      .map(
        ([j, by]) =>
          `${j}: ${Object.entries(by)
            .map(([k, v]) => `${k}=${v.overall}`)
            .join(" ")}`,
      )
      .join(" | ");
    console.log(`[${p.id}] ${((Date.now() - t) / 1000).toFixed(0)}s ${line}`);
  });
}
