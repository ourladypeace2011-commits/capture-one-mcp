// Structural tests: enumerate EVERY tool / lookup, not one function.
//
// The two bugs fixed on 2026-10-09 were instances of classes:
//   #1  a multi-variant write that failed mid-way reported only "error" (the caller
//       believed nothing changed) — class: write tools must account per variant;
//   #2  a catalog preview looked up by raw basename returned ANOTHER photo's preview
//       — class: a filename is not an identity; a lookup by name must never pick
//       silently among candidates.
// These tests scan src/index.ts so the next write tool or the next name-keyed
// lookup that skips the safe path fails `npm test`. See docs/known-bug-classes.md.
// Run: node --import tsx --test test/structure.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = readFileSync(path.join(ROOT, "src", "index.ts"), "utf8");

/** name -> body of every top-level `function` / `async function` in index.ts. */
function functionBodies(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^(?:async )?function (\w+)\(/gm;
  const starts: Array<[string, number]> = [];
  for (let m; (m = re.exec(src)); ) starts.push([m[1], m.index]);
  for (let i = 0; i < starts.length; i++) {
    const [name, at] = starts[i];
    const end = src.indexOf("\n}\n", at);
    out.set(name, src.slice(at, end < 0 ? undefined : end + 2));
  }
  return out;
}

/** tool name -> handler function, from the CallTool dispatcher. */
function dispatch(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/case "(capture_one_\w+)": return await (\w+)\(/g)) out.set(m[1], m[2]);
  return out;
}

const BODIES = functionBodies(SRC);
const TOOLS = dispatch(SRC);
const declaredTools = [...SRC.matchAll(/^\s+name: "(capture_one_\w+)",/gm)].map((m) => m[1]);

// Single AppleScript command on the whole selection, not a per-variant loop: there is
// no "some variants updated" state to report. Adding a tool here needs that argument.
const SINGLE_SHOT_WRITES = new Set(["processSelected", "capture"]);

test("enumeration sanity: every declared tool is dispatched (guards the guard)", () => {
  assert.ok(TOOLS.size >= 17, `only ${TOOLS.size} dispatched tools found — regex broke?`);
  assert.deepEqual([...TOOLS.keys()].sort(), [...declaredTools].sort());
  for (const fn of TOOLS.values()) assert.ok(BODIES.has(fn), `handler ${fn} not found`);
});

const isWrite = (fn: string) => /\bassertWriteAllowed\(\)/.test(BODIES.get(fn) ?? "");

test("every tool that mutates is gated by assertWriteAllowed, and only those are", () => {
  const mutating = /\b(make new|delete every|delete \w|process selected|capture\b)|set (rating|\w+) of (v|adjustments of v|layer)/;
  for (const [tool, fn] of TOOLS) {
    const body = BODIES.get(fn)!;
    const writeName = /_(set_|process_|capture$|layer_mask$)/.test(tool) || tool === "capture_one_capture";
    assert.equal(isWrite(fn), writeName, `${tool} -> ${fn}: write gate does not match tool kind`);
    if (!isWrite(fn)) {
      // A read tool's AppleScript must not contain mutating verbs.
      const scripts = [...body.matchAll(/runAppleScript\(`([\s\S]*?)`/g)].map((m) => m[1]).join("\n");
      assert.doesNotMatch(scripts, mutating, `read tool ${tool} contains a mutating AppleScript verb`);
    }
  }
});

test("every per-variant write reports per-variant outcome (goes through runWrite / setCurveTool)", () => {
  const writes = [...TOOLS.values()].filter(isWrite);
  assert.ok(writes.length >= 8, `only ${writes.length} write tools found`);
  for (const fn of writes) {
    if (SINGLE_SHOT_WRITES.has(fn)) continue;
    const body = BODIES.get(fn)!;
    assert.match(body, /\b(runWrite|setCurveTool)\(/, `${fn} writes without per-variant accounting`);
    assert.doesNotMatch(body, /\brunAppleScript\(/, `${fn} runs raw AppleScript instead of perVariantWriteScript`);
  }
});

test("per-variant writes that can be pre-checked do so before the first write", () => {
  // Layer tools address a layer index that some selected variants may not have:
  // the check must run over ALL variants first (layerPrecheck), not inside the write loop.
  for (const fn of ["setSelectedLayer", "setSelectedLayerAdjustments", "layerMask"]) {
    assert.match(BODIES.get(fn) ?? "", /precheck:\s*layerPrecheck\(/, `${fn} lacks an up-front layer precheck`);
  }
});

// --- filename is not an identity -------------------------------------------------

// Ratchet: call sites that pick ONE path from candidates built from the raw basename.
// They are safe only while every candidate root belongs to this raw's own folder;
// the session-style roots include the PARENT folder and the document folder (see the
// todo test below). May only shrink — remove an entry when that site reports
// ambiguity instead of picking.
const FIRST_HIT_BASELINE = 3;

test("name-keyed lookups: no new first-hit picks (ratchet)", () => {
  const body = BODIES.get("findCacheForVariant") ?? "";
  assert.ok(body.includes("path.basename(variant.file)"), "findCacheForVariant moved — update this test");
  const firstHits = [...SRC.matchAll(/findFirstExisting\(/g)].length - 1; // minus the definition
  assert.ok(firstHits <= FIRST_HIT_BASELINE, `new first-hit lookup by name (${firstHits} > ${FIRST_HIT_BASELINE})`);
  assert.equal(firstHits, FIRST_HIT_BASELINE, "a first-hit lookup was removed — lower FIRST_HIT_BASELINE");
  // The catalog path must keep collecting every candidate.
  assert.match(BODIES.get("walkForFiles") ?? "", /found\.push\(/);
  assert.match(BODIES.get("uniqueCatalogPreview") ?? "", /candidates\.length === 1/);
});

function probe(docPath: string, variantFile: string): Record<string, any> {
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "src", "index.ts"), "--probe-cache", docPath, variantFile],
    { cwd: ROOT, encoding: "utf8", timeout: 30_000 },
  );
  return JSON.parse(out);
}

test("catalog: N same-named raws never resolve to one preview, for any N >= 2", () => {
  for (const n of [2, 3, 5]) {
    const dir = mkdtempSync(path.join(os.tmpdir(), "c1mcp-s-"));
    const cat = path.join(dir, "My.cocatalog");
    for (let i = 0; i < n; i++) {
      for (const ext of ["cop", "cof"]) {
        const f = path.join(cat, "Cache", "Previews", "2026", "0" + (i + 1), "01", "10", `IMG_0001.CR3.${ext}`);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, String(i));
      }
    }
    const info = probe(cat, path.join(dir, "card", "IMG_0001.CR3"));
    assert.equal(info.proxy, null, `n=${n}`);
    assert.equal(info.focus, null, `n=${n}`);
    assert.equal(info.ambiguous?.proxy?.length, n);
    assert.equal(info.ambiguous?.focus?.length, n);
  }
});

test("session: a same-named raw in the PARENT folder must not lend its preview",
  { todo: "known gap — cacheRootsForVariant includes <imageDir>/../CaptureOne/Cache; see docs/known-bug-classes.md" },
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "c1mcp-p-"));
    const parentCache = path.join(dir, "Capture", "CaptureOne", "Cache", "Proxies");
    mkdirSync(parentCache, { recursive: true });
    writeFileSync(path.join(parentCache, "DSC00001.ARW.cop"), "parent folder's DSC00001");
    const child = path.join(dir, "Capture", "Day2");
    mkdirSync(child, { recursive: true });
    const info = probe(path.join(dir, "Shoot.cosessiondb"), path.join(child, "DSC00001.ARW"));
    assert.equal(info.proxy, null, `picked ${info.proxy?.path}`);
  });
