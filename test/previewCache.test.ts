// Catalog previews live under Cache/Previews/<YYYY/MM/DD/HH>/<raw basename>.cop and
// are looked up by basename only. Two raws with the same name (camera counters wrap,
// two bodies share a prefix) used to resolve to whichever file the walk hit first —
// the preview of a DIFFERENT photo, reported as a normal result and fed to vision.
// Run: node --import tsx --test test/previewCache.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function probe(docPath: string, variantFile: string): Record<string, any> {
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "src", "index.ts"), "--probe-cache", docPath, variantFile],
    { cwd: ROOT, encoding: "utf8", timeout: 30_000 },
  );
  return JSON.parse(out);
}

function catalog(files: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "c1mcp-"));
  const cat = path.join(dir, "My.cocatalog");
  for (const rel of files) {
    const full = path.join(cat, "Cache", "Previews", rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, rel);
  }
  return cat;
}

test("same raw basename twice in a catalog: no preview is guessed, both candidates are reported", () => {
  const cat = catalog(["2026/01/02/10/DSC00001.ARW.cop", "2026/03/05/14/DSC00001.ARW.cop"]);
  const info = probe(cat, path.join(path.dirname(cat), "cardB", "DSC00001.ARW"));
  assert.equal(info.proxy, null);
  assert.equal(info.ambiguous?.proxy?.length, 2);
});

test("a unique basename in a catalog still resolves", () => {
  const cat = catalog(["2026/01/02/10/DSC00001.ARW.cop", "2026/01/02/10/DSC00002.ARW.cop"]);
  const info = probe(cat, path.join(path.dirname(cat), "cardA", "DSC00002.ARW"));
  assert.match(info.proxy?.path ?? "", /DSC00002\.ARW\.cop$/);
  assert.equal(info.ambiguous, undefined);
});
