// Tests for multi-variant write accounting. Capture One itself is NOT needed:
//  - "mock AppleScript layer" tests run the generated script skeleton through the real
//    `osascript`, with the selection replaced by plain AppleScript records (no `tell application`).
//  - Tool-level tests inject a mock runner in place of osascript.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  perVariantWriteScript, parseWriteReport, layerPrecheck, validateCurvePoints,
  setCurveTool, runWrite, writeResult, curveWriteParts,
} from "../src/writeOps.ts";

const exec = promisify(execFile);
const onMac = process.platform === "darwin";
const osa = async (script: string) => (await exec("osascript", ["-e", script])).stdout.trim();

// a: 3 layers, b: 1 layer, c: 2 layers
const RECORDS = 'set selectedList to {{id:"a", layers:{1,2,3}}, {id:"b", layers:{1}}, {id:"c", layers:{1,2}}}';

test("osascript: mid-loop failure reports updated / failed / not-attempted", { skip: !onMac }, async () => {
  const script = perVariantWriteScript({
    appName: null,
    selection: RECORDS,
    body: 'if (count of layers of v) < 2 then error "simulated Capture One error on " & vid',
  });
  const r = parseWriteReport(await osa(script));
  assert.equal(r.total, 3);
  assert.deepEqual(r.updated, ["a"]);
  assert.equal(r.failed, "b");
  assert.deepEqual(r.pending, ["c"]);
  assert.match(r.message, /simulated Capture One error on b/);
  const res = writeResult("update layer 2", r);
  assert.equal(res.isError, true);
  const body = JSON.parse((res.content[0] as { text: string }).text);
  assert.deepEqual(body.updated, ["a"]);
  assert.equal(body.failedVariant, "b");
  assert.deepEqual(body.notAttempted, ["c"]);
  assert.match(body.rollback, /no scriptable undo/);
});

test("osascript: layer precheck aborts BEFORE any write (nothing changed)", { skip: !onMac }, async () => {
  const script = perVariantWriteScript({
    appName: null,
    selection: RECORDS,
    precheck: layerPrecheck(2),
    body: 'error "BODY RAN — a write happened"',
  });
  await assert.rejects(osa(script), (e: Error & { stderr?: string }) => {
    const stderr = String(e.stderr ?? "");  // e.message also echoes the script text, so check stderr only
    assert.match(stderr, /Layer index 2 out of range for selected variant b \(it has 1 layer\(s\)\)\. Nothing was changed\./);
    assert.doesNotMatch(stderr, /BODY RAN/);
    return true;
  });
});

test("osascript: all variants succeed", { skip: !onMac }, async () => {
  const script = perVariantWriteScript({ appName: null, selection: RECORDS, precheck: layerPrecheck(1), body: "set x to 1" });
  const r = parseWriteReport(await osa(script));
  assert.deepEqual(r.updated, ["a", "b", "c"]);
  assert.equal(r.failed, null);
  assert.deepEqual(r.pending, []);
  const res = writeResult("set rating 3", r);
  assert.equal(res.isError, undefined);
  assert.match((res.content[0] as { text: string }).text, /updated 3 of 3 selected variant\(s\) \[a, b, c\]/);
});

test("osascript: failure on the last variant has no pending; first variant failure has all pending", { skip: !onMac }, async () => {
  const last = parseWriteReport(await osa(perVariantWriteScript({
    appName: null, selection: RECORDS, body: 'if (id of v) is "c" then error "x"',
  })));
  assert.deepEqual([last.updated, last.failed, last.pending], [["a", "b"], "c", []]);
  const first = parseWriteReport(await osa(perVariantWriteScript({
    appName: null, selection: RECORDS, body: 'error "x"',
  })));
  assert.deepEqual([first.updated, first.failed, first.pending], [[], "a", ["b", "c"]]);
});

test("validateCurvePoints rejects out-of-range and unordered points", () => {
  assert.equal(validateCurvePoints([{ brightness: 0, amount: 0 }, { brightness: 100, amount: 100 }]).ok, true);
  const r255 = validateCurvePoints([{ brightness: 0, amount: 0 }, { brightness: 255, amount: 128 }]);
  assert.equal(r255.ok, false);
  assert.match((r255 as { error: string }).error, /0-100/);
  assert.equal(validateCurvePoints([{ brightness: -1, amount: 0 }]).ok, false);
  assert.equal(validateCurvePoints([{ brightness: 10, amount: 101 }]).ok, false);
  assert.equal(validateCurvePoints([{ brightness: 50, amount: 0 }, { brightness: 50, amount: 10 }]).ok, false);
  assert.equal(validateCurvePoints([{ brightness: 60, amount: 0 }, { brightness: 40, amount: 10 }]).ok, false);
  assert.equal(validateCurvePoints([{ brightness: "x", amount: 0 }]).ok, false);
  assert.equal(validateCurvePoints([]).ok, false);
});

test("set_selected_curve: invalid point => Capture One is never touched", async () => {
  let calls = 0;
  const run = async () => { calls++; return ""; };
  const res = await setCurveTool(
    { curve: "rgb", points: [{ brightness: 0, amount: 0 }, { brightness: 128, amount: 255 }] }, "rgb curve", "Capture One", run);
  assert.equal(res.isError, true);
  assert.equal(calls, 0);
  assert.match((res.content[0] as { text: string }).text, /out of range/);
});

test("set_selected_curve: reads old points before deleting, restores on failure, reports partial", async () => {
  let seen = "";
  const run = async (script: string) => {
    seen = script;
    return [
      "TOTAL\t2", "UPDATED\tv1", "PENDING\t", "FAILED\tv2",
      "EXTRA\tfailed variant's previous curve was restored: (0,0) (100,100) ",
      "MESSAGE\tCapture One got an error (-10000)",
    ].join("\n");
  };
  const res = await setCurveTool(
    { curve: "luma", points: [{ brightness: 0, amount: 0 }, { brightness: 50, amount: 60 }, { brightness: 100, amount: 100 }] },
    "luma curve", "Capture One", run);
  const readAt = seen.indexOf("set end of oldPts to {brightness of cp, amount of cp}");
  const deleteAt = seen.indexOf("delete every curve point of theCurve");
  assert.ok(readAt > 0 && deleteAt > readAt, "old points must be captured before the curve is cleared");
  assert.match(seen, /if curveCleared then/);
  assert.equal(res.isError, true);
  const body = JSON.parse((res.content[0] as { text: string }).text);
  assert.deepEqual(body.updated, ["v1"]);
  assert.equal(body.failedVariant, "v2");
  assert.match(body.recovery, /restored/);
});

test("runWrite: osascript timeout says variants may already be modified", async () => {
  const res = await runWrite("set adjustments (exposure)", "x", async () => { throw new Error("osascript timed out after 15000ms"); });
  assert.equal(res.isError, true);
  assert.match((res.content[0] as { text: string }).text, /SOME selected variants may already be modified/);
});

test("curveWriteParts emits only validated numeric literals", () => {
  const parts = curveWriteParts("rgb curve", [{ brightness: 0, amount: 0 }, { brightness: 100, amount: 100 }]);
  assert.match(parts.body, /\{brightness:0, amount:0\}/);
  assert.match(parts.body, /\{brightness:100, amount:100\}/);
});
