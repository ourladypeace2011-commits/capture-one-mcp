// Multi-variant write helpers.
//
// Capture One applies each AppleScript `set` / `make` / `delete` immediately and has no
// scriptable undo/transaction, so a write over N selected variants cannot be made truly
// all-or-nothing. What this module guarantees instead:
//   1. Every check that CAN be done up front (argument ranges, per-variant preconditions such
//      as "has layer N") runs before the first write — a failure there changes nothing.
//   2. If a write still fails mid-way, the result says exactly which variants were already
//      updated, which one failed (and with what error), and which were never attempted.
//   3. Write-specific recovery hooks (e.g. restoring a tone curve that was cleared) run for
//      the variant that failed, and their outcome is reported.
//
// Pure functions only (no osascript, no MCP server) so they can be unit-tested with a mock
// AppleScript runner.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface PerVariantWriteOptions {
  /** `tell application <appName>` wrapper; null = no tell block (tests run plain AppleScript). */
  appName: string | null;
  /** Lines that define `selectedList`. Defaults to Capture One's current selection. */
  selection?: string;
  /** Per-variant checks run over ALL variants before any write; must `error` to abort. `v`, `vid` are bound. */
  precheck?: string;
  /** Per-variant lines run before the guarded body (outside try); `v`, `vid` are bound. */
  setup?: string;
  /** The mutating lines for one variant (`v`, `vid` bound). */
  body: string;
  /** Lines run when `body` fails for a variant; may set `extraInfo`. */
  onFailure?: string;
}

export function appleString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

const CO_SELECTION = `tell current document to set selectedList to every variant whose selected is true`;

function indent(lines: string | undefined, pad: string): string {
  if (!lines) return "";
  return lines
    .split("\n")
    .map((l) => (l.trim().length ? pad + l.trimStart() : l))
    .join("\n");
}

const BIND_VID = (indexVar: string, itemExpr: string, pad: string) => [
  `${pad}set vid to "#" & (${indexVar} as text)`,
  `${pad}try`,
  `${pad}  set vid to id of ${itemExpr} as text`,
  `${pad}end try`,
].join("\n");

/**
 * Build an AppleScript that applies `body` to every selected variant and returns a
 * machine-readable report (see parseWriteReport) instead of aborting on the first error.
 */
export function perVariantWriteScript(o: PerVariantWriteOptions): string {
  const inner = `
${o.selection ?? CO_SELECTION}
if (count of selectedList) is 0 then error "No selected variants."
set vi to 0
repeat with v in selectedList
  set vi to vi + 1
${BIND_VID("vi", "v", "  ")}
${indent(o.precheck, "  ")}
end repeat
set updatedIds to {}
set failedId to ""
set failMsg to ""
set extraInfo to ""
set vi to 0
repeat with v in selectedList
  set vi to vi + 1
${BIND_VID("vi", "v", "  ")}
${indent(o.setup, "  ")}
  try
${indent(o.body, "    ")}
  on error errMsg number errNum
    set failedId to vid
    set failMsg to errMsg & " (" & (errNum as text) & ")"
${indent(o.onFailure, "    ")}
    exit repeat
  end try
  set end of updatedIds to vid
end repeat
set total to count of selectedList
set pendingIds to {}
if failedId is not "" then
  repeat with k from ((count of updatedIds) + 2) to total
${BIND_VID("k", "item k of selectedList", "    ")}
    set end of pendingIds to vid
  end repeat
end if
set AppleScript's text item delimiters to tab
set outText to "TOTAL" & tab & (total as text) & linefeed & "UPDATED" & tab & (updatedIds as text) & linefeed & "PENDING" & tab & (pendingIds as text) & linefeed & "FAILED" & tab & failedId & linefeed & "EXTRA" & tab & extraInfo & linefeed & "MESSAGE" & tab & failMsg
set AppleScript's text item delimiters to ""
return outText`;
  if (o.appName === null) return inner;
  return `tell application ${appleString(o.appName)}\n${indent(inner, "  ")}\nend tell`;
}

export interface WriteReport {
  total: number;
  updated: string[];
  pending: string[];
  failed: string | null;
  extra: string;
  message: string;
}

export function parseWriteReport(raw: string): WriteReport {
  const lines = raw.split(/\r?\n/);
  const get = (key: string): string | null => {
    const l = lines.find((x) => x === key || x.startsWith(key + "\t"));
    return l === undefined ? null : l.slice(key.length + 1);
  };
  const total = Number(get("TOTAL"));
  if (!Number.isInteger(total)) throw new Error(`Unexpected write report from AppleScript: ${raw.slice(0, 200)}`);
  const list = (s: string | null) => (s ? s.split("\t").filter((x) => x.length > 0) : []);
  // MESSAGE is last and may itself contain newlines.
  const mi = raw.search(/(^|\n)MESSAGE\t/);
  const message = mi < 0 ? "" : raw.slice(raw.indexOf("MESSAGE\t", mi) + "MESSAGE\t".length);
  const failed = get("FAILED");
  return {
    total,
    updated: list(get("UPDATED")),
    pending: list(get("PENDING")),
    failed: failed ? failed : null,
    extra: get("EXTRA") ?? "",
    message,
  };
}

const NO_ROLLBACK =
  "Capture One has no scriptable undo: variants listed in `updated` keep their new values. " +
  "The failed variant may be partially modified unless `recovery` says it was restored. " +
  "Variants in `notAttempted` were not touched.";

/** Turn a write report into the MCP tool result. Partial failure => isError with full accounting. */
export function writeResult(action: string, report: WriteReport): CallToolResult {
  if (report.failed === null) {
    const text = `${action}: updated ${report.updated.length} of ${report.total} selected variant(s)` +
      (report.updated.length ? ` [${report.updated.join(", ")}]` : "");
    return { content: [{ type: "text", text }] };
  }
  const body = {
    error: `${action} failed on variant ${report.failed} after ${report.updated.length} of ${report.total} selected variant(s) had already been updated.`,
    cause: report.message,
    updated: report.updated,
    failedVariant: report.failed,
    notAttempted: report.pending,
    ...(report.extra ? { recovery: report.extra } : {}),
    rollback: NO_ROLLBACK,
  };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

/** osascript timeouts kill the process after Apple Events may already have been applied. */
export function explainWriteError(action: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(msg)) {
    return `${action}: ${msg}. The script was killed mid-run, so SOME selected variants may already be modified ` +
      `(Capture One has no undo via AppleScript). Re-read the current state (get_selected_* tools) before retrying, ` +
      `or select fewer variants / raise CAPTURE_ONE_MCP_TIMEOUT_MS.`;
  }
  return `${action}: ${msg}`;
}

export interface CurvePoint { brightness: number; amount: number; }

/** Validate ALL curve points before anything touches Capture One. */
export function validateCurvePoints(points: unknown): { ok: true; points: CurvePoint[] } | { ok: false; error: string } {
  if (!Array.isArray(points) || points.length === 0) {
    return { ok: false, error: "points must be a non-empty array of { brightness, amount }." };
  }
  const out: CurvePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, error: `points[${i}] must be an object { brightness, amount }.` };
    const b = Number((p as Record<string, unknown>).brightness);
    const a = Number((p as Record<string, unknown>).amount);
    if (!Number.isFinite(b) || !Number.isFinite(a)) return { ok: false, error: `points[${i}] needs finite brightness and amount.` };
    if (b < 0 || b > 100 || a < 0 || a > 100) {
      return { ok: false, error: `points[${i}] = (${b}, ${a}) is out of range: brightness and amount must both be within 0-100 (not 0-255). Nothing was changed.` };
    }
    if (out.length && b <= out[out.length - 1].brightness) {
      return { ok: false, error: `points must be ordered by strictly increasing brightness (points[${i}].brightness=${b} after ${out[out.length - 1].brightness}). Nothing was changed.` };
    }
    out.push({ brightness: b, amount: a });
  }
  return { ok: true, points: out };
}

/** AppleScript pieces for replacing one tone curve with restore-on-failure. */
export function curveWriteParts(curveProp: string, points: CurvePoint[]): Pick<PerVariantWriteOptions, "setup" | "body" | "onFailure"> {
  const make = points
    .map((p) => `make new curve point at end of theCurve with properties {brightness:${p.brightness}, amount:${p.amount}}`)
    .join("\n");
  return {
    setup: [`set curveCleared to false`, `set oldPts to {}`].join("\n"),
    body: [
      `set theCurve to ${curveProp} of adjustments of v`,
      `repeat with cp in (every curve point of theCurve)`,
      `  set end of oldPts to {brightness of cp, amount of cp}`,
      `end repeat`,
      `delete every curve point of theCurve`,
      `set curveCleared to true`,
      make,
    ].join("\n"),
    onFailure: [
      `if curveCleared then`,
      `  set oldTxt to ""`,
      `  repeat with op in oldPts`,
      `    set oldTxt to oldTxt & "(" & ((item 1 of op) as text) & "," & ((item 2 of op) as text) & ") "`,
      `  end repeat`,
      `  try`,
      `    delete every curve point of theCurve`,
      `    repeat with op in oldPts`,
      `      make new curve point at end of theCurve with properties {brightness:(item 1 of op), amount:(item 2 of op)}`,
      `    end repeat`,
      `    set extraInfo to "failed variant's previous curve was restored: " & oldTxt`,
      `  on error restoreErr`,
      `    set extraInfo to "RESTORE FAILED (" & restoreErr & "); failed variant's previous curve points were: " & oldTxt`,
      `  end try`,
      `end if`,
    ].join("\n"),
  };
}

/** Precheck that every selected variant has at least `layerIndex` layers (nothing changes otherwise). */
export function layerPrecheck(layerIndex: number): string {
  return `if (count of layers of v) < ${layerIndex} then error "Layer index ${layerIndex} out of range for selected variant " & vid & " (it has " & ((count of layers of v) as text) & " layer(s)). Nothing was changed."`;
}

export type ScriptRunner = (script: string) => Promise<string>;

/** Run a perVariantWriteScript and convert its report (or failure) into the MCP result. */
export async function runWrite(action: string, script: string, run: ScriptRunner): Promise<CallToolResult> {
  let raw: string;
  try {
    raw = await run(script);
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: explainWriteError(action, err) }] };
  }
  return writeResult(action, parseWriteReport(raw));
}

/** set_selected_curve: validate every point first; only then build/run the script. */
export async function setCurveTool(
  args: Record<string, unknown>,
  curveProp: string | undefined,
  appName: string,
  run: ScriptRunner,
): Promise<CallToolResult> {
  const err = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });
  if (!curveProp) return err("curve must be one of rgb, luma, red, green, blue.");
  const v = validateCurvePoints(args.points);
  if (!v.ok) return err(v.error);
  const action = `set ${String(args.curve)} curve (${v.points.length} point(s))`;
  return runWrite(action, perVariantWriteScript({ appName, ...curveWriteParts(curveProp, v.points) }), run);
}
