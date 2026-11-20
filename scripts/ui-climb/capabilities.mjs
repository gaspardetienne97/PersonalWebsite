#!/usr/bin/env node
// Capability snapshot for the next pass: every catalog entry and mode, every DrillSetup id and
// key, and every Setup control (Choice, Picker) in the music routes and drills. Phases may move
// and merge drills, never lose one of these quietly.
//
//   node scripts/ui-climb/capabilities.mjs          write .ui-climb/capabilities.json
//   node scripts/ui-climb/capabilities.mjs --diff   compare with it; exit 1 when anything disappeared
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { tsImport } from "tsx/esm/api";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, ".ui-climb/capabilities.json");
const DIRS = ["src/routes/music", "src/lib/music"];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
const files = DIRS.flatMap((d) => walk(join(ROOT, d))).filter(
  (f) => /\.(svelte|ts)$/.test(f) && !f.endsWith(".test.ts"),
);

/** The script blocks of a .svelte file (markup dropped), or the whole .ts file. */
const scriptOf = (f, src) =>
  f.endsWith(".svelte")
    ? [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n")
    : src;

const sources = files.map((f) => {
  const src = readFileSync(f, "utf8");
  return {
    file: relative(ROOT, f),
    src,
    ast: ts.createSourceFile(f, scriptOf(f, src), ts.ScriptTarget.Latest, true),
  };
});

/** Object-literal consts by name, so a setup spread (`...READING_SETUP`) lists its keys. */
const consts = new Map();
for (const { ast } of sources)
  ast.forEachChild(function visit(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      let init = n.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      if (ts.isObjectLiteralExpression(init)) consts.set(n.name.text, init);
    }
    n.forEachChild(visit);
  });

const keysOf = (obj) =>
  obj.properties.flatMap((p) => {
    if (ts.isSpreadAssignment(p)) {
      const ref = consts.get(p.expression.getText());
      return ref ? keysOf(ref) : [`...${p.expression.getText()}`];
    }
    return p.name ? [p.name.getText().replace(/^["']|["']$/g, "")] : [];
  });

const setups = [];
for (const { file, ast } of sources)
  ast.forEachChild(function visit(n) {
    if (ts.isNewExpression(n) && n.expression.getText() === "DrillSetup" && n.arguments?.length) {
      const [idArg, obj] = n.arguments;
      const id = ts.isStringLiteral(idArg) ? idArg.text : idArg.getText();
      setups.push({ file, id, keys: obj && ts.isObjectLiteralExpression(obj) ? keysOf(obj) : [] });
    }
    n.forEachChild(visit);
  });

/** Setup controls: each <Choice>/<Picker> tag's label and setupKey (the tag read to its own `>`). */
const controls = [];
const TAG = /<(Choice|Picker|KeyPicker|CatalogPicker)\b/g;
for (const { file, src } of sources) {
  if (!file.endsWith(".svelte") || file.includes("/settings/")) continue;
  for (const m of src.matchAll(TAG)) {
    let depth = 0;
    let end = m.index + m[0].length;
    for (; end < src.length; end++) {
      const c = src[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    // Attributes at brace depth 0 only, so an option's label inside {...} is not taken for the control's.
    let flat = "";
    depth = 0;
    for (const c of src.slice(m.index, end)) {
      if (c === "{") depth++;
      if (depth === 0) flat += c;
      if (c === "}") depth--;
    }
    const tag = src.slice(m.index, end);
    const label =
      flat.match(/\slabel="([^"]*)"/)?.[1] ?? tag.match(/\slabel=\{([^}]*)\}/)?.[1] ?? "";
    const setupKey = flat.match(/\ssetupKey="([^"]*)"/)?.[1];
    controls.push({ file, component: m[1], label, ...(setupKey ? { setupKey } : {}) });
  }
}

const { CATALOG } = await tsImport(
  join(ROOT, "packages/music-core/src/content/catalog.ts"),
  import.meta.url,
);
const catalog = CATALOG.map((e) => ({
  id: e.id,
  route: e.route,
  title: e.title,
  exerciseId: e.exerciseId,
  instruments: e.instruments,
  capability: e.capability,
  modes: e.modes.map((m) => ({ id: m.id, label: m.label, exerciseId: m.exerciseId })),
}));

/** One line per capability: what --diff compares (a multiset, so a duplicate lost counts). */
const facts = [
  ...catalog.flatMap((e) => [
    `catalog ${e.id} ${e.route} ${e.exerciseId}`,
    ...e.instruments.map((i) => `instrument ${e.id} ${i}`),
    ...e.modes.map((m) => `mode ${e.id}/${m.id} ${m.exerciseId}`),
  ]),
  ...setups.flatMap((s) => [`setup ${s.id}`, ...s.keys.map((k) => `setup-key ${s.id}.${k}`)]),
  ...controls.map((c) => `control ${c.label}${c.setupKey ? ` [${c.setupKey}]` : ""}`),
].sort();

const snapshot = { catalog, setups, controls, facts };

if (process.argv.includes("--diff")) {
  if (!existsSync(OUT)) {
    console.error(`No baseline at ${relative(ROOT, OUT)}; run without --diff first.`);
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(OUT, "utf8")).facts;
  const left = new Map();
  for (const f of facts) left.set(f, (left.get(f) ?? 0) + 1);
  const gone = [];
  for (const f of base) {
    if (left.get(f)) left.set(f, left.get(f) - 1);
    else gone.push(f);
  }
  const added = [...left].flatMap(([f, n]) => Array(n).fill(f));
  console.log(
    `${facts.length} capabilities now, ${base.length} in the baseline: ${gone.length} gone, ${added.length} new.`,
  );
  if (gone.length) console.log(`\nDisappeared:\n${gone.map((f) => `  - ${f}`).join("\n")}`);
  if (added.length) console.log(`\nNew:\n${added.map((f) => `  + ${f}`).join("\n")}`);
  process.exit(gone.length ? 1 : 0);
}

writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `${catalog.length} catalog entries, ${catalog.reduce((n, e) => n + e.modes.length, 0)} modes, ${setups.length} setups, ${setups.reduce((n, s) => n + s.keys.length, 0)} setup keys, ${controls.length} controls -> ${relative(ROOT, OUT)}`,
);
