#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

const execFileAsync = promisify(execFile);

const APP_PATH = process.env.CAPTURE_ONE_APP ?? "/Applications/Capture One.app";
const PROCESS_NAME = process.env.CAPTURE_ONE_PROCESS ?? "Capture One";
const ALLOW_WRITE = process.env.CAPTURE_ONE_MCP_ALLOW_WRITE === "1";
const DEFAULT_TIMEOUT_MS = Number(process.env.CAPTURE_ONE_MCP_TIMEOUT_MS ?? 15_000);

type JsonObject = Record<string, unknown>;

const ADJUSTMENT_FIELDS = [
  { name: "orientation", type: "integer" },
  { name: "rotation", type: "real" },
  { name: "flip", type: "flip type" },
  { name: "keystone amount", type: "integer" },
  { name: "keystone vertical", type: "real" },
  { name: "keystone horizontal", type: "real" },
  { name: "keystone skew", type: "real" },
  { name: "keystone aspect", type: "real" },
  { name: "color profile", type: "text" },
  { name: "film curve", type: "text" },
  { name: "white balance preset", type: "text" },
  { name: "temperature", type: "real" },
  { name: "tint", type: "real" },
  { name: "exposure", type: "real" },
  { name: "brightness", type: "real" },
  { name: "contrast", type: "real" },
  { name: "saturation", type: "real" },
  { name: "color balance master hue", type: "real" },
  { name: "color balance master saturation", type: "real" },
  { name: "color balance shadow hue", type: "real" },
  { name: "color balance shadow saturation", type: "real" },
  { name: "color balance shadow lightness", type: "real" },
  { name: "color balance midtone hue", type: "real" },
  { name: "color balance midtone saturation", type: "real" },
  { name: "color balance midtone lightness", type: "real" },
  { name: "color balance highlight hue", type: "real" },
  { name: "color balance highlight saturation", type: "real" },
  { name: "color balance highlight lightness", type: "real" },
  { name: "black and white", type: "boolean" },
  { name: "black and white red sensitivity", type: "integer" },
  { name: "black and white yellow sensitivity", type: "integer" },
  { name: "black and white green sensitivity", type: "integer" },
  { name: "black and white cyan sensitivity", type: "integer" },
  { name: "black and white blue sensitivity", type: "integer" },
  { name: "black and white magenta sensitivity", type: "integer" },
  { name: "black and white split highlight hue", type: "integer" },
  { name: "black and white split highlight saturation", type: "integer" },
  { name: "black and white split shadow hue", type: "integer" },
  { name: "black and white split shadow saturation", type: "integer" },
  { name: "level highlight rgb", type: "real" },
  { name: "level shadow rgb", type: "real" },
  { name: "level highlight red", type: "real" },
  { name: "level shadow red", type: "real" },
  { name: "level highlight green", type: "real" },
  { name: "level shadow green", type: "real" },
  { name: "level highlight blue", type: "real" },
  { name: "level shadow blue", type: "real" },
  { name: "level target highlight rgb", type: "real" },
  { name: "level target shadow rgb", type: "real" },
  { name: "level target highlight red", type: "real" },
  { name: "level target shadow red", type: "real" },
  { name: "level target highlight green", type: "real" },
  { name: "level target shadow green", type: "real" },
  { name: "level target highlight blue", type: "real" },
  { name: "level target shadow blue", type: "real" },
  { name: "level midtone rgb", type: "real" },
  { name: "level midtone red", type: "real" },
  { name: "level midtone green", type: "real" },
  { name: "level midtone blue", type: "real" },
  { name: "highlight recovery", type: "real" },
  { name: "highlight adjustment", type: "real" },
  { name: "shadow recovery", type: "real" },
  { name: "white recovery", type: "real" },
  { name: "black recovery", type: "real" },
  { name: "clarity method", type: "clarity method" },
  { name: "clarity amount", type: "real" },
  { name: "clarity structure", type: "real" },
  { name: "dehaze amount", type: "real" },
  { name: "vignetting amount", type: "real" },
  { name: "vignetting method", type: "vignette method" },
  { name: "sharpening amount", type: "real" },
  { name: "sharpening radius", type: "real" },
  { name: "sharpening threshold", type: "real" },
  { name: "sharpening halo suppression", type: "real" },
  { name: "noise reduction luminance", type: "real" },
  { name: "noise reduction details", type: "integer" },
  { name: "noise reduction color", type: "real" },
  { name: "noise reduction single pixel", type: "real" },
  { name: "film grain type", type: "grain type" },
  { name: "film grain impact", type: "real" },
  { name: "film grain granularity", type: "real" },
  { name: "moire amount", type: "real" },
  { name: "moire pattern", type: "integer" },
] as const;

const DEFAULT_STYLE_FIELDS = [
  "color profile",
  "film curve",
  "white balance preset",
  "temperature",
  "tint",
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "highlight recovery",
  "shadow recovery",
  "white recovery",
  "black recovery",
  "clarity amount",
  "clarity structure",
  "dehaze amount",
  "vignetting amount",
  "film grain impact",
  "film grain granularity",
];

const ADJUSTMENT_FIELD_BY_NAME: Map<string, { name: string; type: string }> = new Map(ADJUSTMENT_FIELDS.map((field) => [field.name, field]));

// Tone curves: sdef `curve` class holds `curve point` elements (brightness = x 0-100,
// amount = y 0-100). Five curve properties live on `adjustment settings`.
const CURVE_PROPERTY_BY_NAME: Record<string, string> = {
  rgb: "rgb curve",
  luma: "luma curve",
  red: "red curve",
  green: "green curve",
  blue: "blue curve",
};

// Layer mask commands (sdef): all take a `layer` direct-parameter; feather/refine take amount.
const LAYER_MASK_COMMANDS: Record<string, { command: string; takesAmount: boolean; min: number; max: number }> = {
  clear: { command: "clear mask", takesAmount: false, min: 0, max: 0 },
  invert: { command: "invert mask", takesAmount: false, min: 0, max: 0 },
  fill: { command: "fill mask", takesAmount: false, min: 0, max: 0 },
  rasterize: { command: "rasterize mask", takesAmount: false, min: 0, max: 0 },
  feather: { command: "feather mask", takesAmount: true, min: 0, max: 100 },
  refine: { command: "refine mask", takesAmount: true, min: 0, max: 300 },
};

// `luma range settings` fields (the layer mask's luma-range) and their AppleScript types.
const LUMA_RANGE_FIELD_TYPES: Record<string, "real" | "boolean"> = {
  "range low": "real",
  "range high": "real",
  "falloff low": "real",
  "falloff high": "real",
  "invert": "boolean",
  "radius": "real",
  "sensitivity": "real",
};


const tools: Tool[] = [
  {
    name: "capture_one_status",
    description: "Return Capture One install/running status, app version, current document, and selected variant count. Does not launch Capture One when it is closed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_selected_variants",
    description: "Return selected Capture One variants as TSV: id, name, rating, color tag, and file path. Requires Capture One to be running.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_list_recipes",
    description: "Return process recipes for the current Capture One document as TSV. Requires Capture One to be running.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_adjustment_fields",
    description: "Return the Capture One adjustment fields this MCP can read/write, based on the installed scripting dictionary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_get_selected_adjustments",
    description: "Read adjustment values from selected variants. Defaults to tone/color style fields; pass fields for a wider or narrower read.",
    inputSchema: {
      type: "object",
      properties: {
        fields: { type: "array", items: { type: "string" }, description: "Adjustment field names to read. Omit for common tone/color fields." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_find_selected_preview_cache",
    description: "Find Capture One internal preview/thumbnail cache files for selected variants. This does not export from Capture One.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_convert_selected_preview_cache",
    description: "Convert selected variants' internal Capture One preview cache (.cop/.cot/.cof) to temporary JPEG files for vision analysis. This uses macOS image decoding, not Capture One export.",
    inputSchema: {
      type: "object",
      properties: {
        prefer: { type: "string", enum: ["proxy", "thumbnail", "focus"], description: "Cache type to prefer. proxy=.cop full preview, thumbnail=.cot, focus=.cof." },
        outputDir: { type: "string", description: "Optional temp/output directory for converted JPEGs." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_set_selected_adjustments",
    description: "Set adjustment values on all selected variants. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1. Values may be numbers, booleans, or strings for enum/text fields.",
    inputSchema: {
      type: "object",
      properties: {
        settings: {
          type: "object",
          description: "Map of Capture One adjustment field name to value, for example {\"exposure\": 0.2, \"temperature\": 5400}.",
          additionalProperties: { anyOf: [{ type: "number" }, { type: "boolean" }, { type: "string" }] },
        },
      },
      required: ["settings"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_set_selected_rating",
    description: "Set the rating of all selected variants. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: {
      type: "object",
      properties: {
        rating: { type: "integer", minimum: 0, maximum: 5, description: "Star rating from 0 to 5." },
      },
      required: ["rating"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_process_selected",
    description: "Process/export selected variants using the current recipe or a named recipe. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: {
      type: "object",
      properties: {
        recipe: { type: "string", description: "Optional Capture One process recipe name." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_capture",
    description: "Trigger tethered capture with the currently selected camera into the foreground document. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_get_selected_curves",
    description: "Read tone-curve points (rgb, luma, red, green, blue) of selected variants' base adjustments as TSV. Each point has brightness (x, 0-100) and amount (y, 0-100). Requires Capture One running.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_set_selected_curve",
    description: "Replace the points of one tone curve on all selected variants' base adjustments. Points replace ALL existing points, so include endpoints. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: {
      type: "object",
      properties: {
        curve: { type: "string", enum: ["rgb", "luma", "red", "green", "blue"], description: "Which curve to set." },
        points: {
          type: "array",
          description: "Ordered curve points; each { brightness: 0-100 (x, shadow→highlight), amount: 0-100 (y) }.",
          items: {
            type: "object",
            properties: { brightness: { type: "number" }, amount: { type: "number" } },
            required: ["brightness", "amount"],
            additionalProperties: false,
          },
        },
      },
      required: ["curve", "points"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_get_selected_layers",
    description: "List adjustment layers of selected variants as TSV: variant id, 1-based layer index, name, kind (background/adjustment/clone/heal), enabled, opacity, and luma-range low/high. Requires Capture One running.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "capture_one_set_selected_layer",
    description: "Set properties of one layer (by 1-based index) on all selected variants: name, enabled, opacity, and/or luma-range mask settings. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: {
      type: "object",
      properties: {
        layerIndex: { type: "integer", minimum: 1, description: "1-based layer index (see capture_one_get_selected_layers)." },
        name: { type: "string" },
        enabled: { type: "boolean" },
        opacity: { type: "integer", minimum: 1, maximum: 100 },
        lumaRange: {
          type: "object",
          description: "Luma-range mask settings; subset of 'range low'/'range high'/'falloff low'/'falloff high'/'radius'/'sensitivity' (reals) and 'invert' (boolean).",
          additionalProperties: { anyOf: [{ type: "number" }, { type: "boolean" }] },
        },
      },
      required: ["layerIndex"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_set_selected_layer_adjustments",
    description: "Set adjustment fields (same names as capture_one_adjustment_fields) on one layer (by 1-based index) of all selected variants — local adjustments. Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: {
      type: "object",
      properties: {
        layerIndex: { type: "integer", minimum: 1 },
        settings: {
          type: "object",
          description: "Map of Capture One adjustment field name to value, e.g. {\"exposure\": 0.2}.",
          additionalProperties: { anyOf: [{ type: "number" }, { type: "boolean" }, { type: "string" }] },
        },
      },
      required: ["layerIndex", "settings"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_one_layer_mask",
    description: "Run a mask command on one layer (by 1-based index) of all selected variants: clear, invert, fill, rasterize, feather (amount 0-100), or refine (amount 0-300). Mutating; requires CAPTURE_ONE_MCP_ALLOW_WRITE=1.",
    inputSchema: {
      type: "object",
      properties: {
        layerIndex: { type: "integer", minimum: 1 },
        command: { type: "string", enum: ["clear", "invert", "fill", "rasterize", "feather", "refine"] },
        amount: { type: "number", description: "Required for feather (0-100) and refine (0-300); ignored otherwise." },
      },
      required: ["layerIndex", "command"],
      additionalProperties: false,
    },
  },
];

function jsonText(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function appleString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function normalizeAdjustmentFields(value: unknown): string[] {
  const fields = Array.isArray(value) && value.length > 0 ? value : DEFAULT_STYLE_FIELDS;
  return fields.map((field) => {
    if (typeof field !== "string" || !ADJUSTMENT_FIELD_BY_NAME.has(field)) {
      throw new Error(`Unsupported Capture One adjustment field: ${String(field)}`);
    }
    return field;
  });
}

function appleLiteral(value: unknown, fieldType: string): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Adjustment value must be finite.");
    if (fieldType === "integer" && !Number.isInteger(value)) throw new Error("Integer adjustment field received a non-integer value.");
    return String(value);
  }
  if (typeof value === "string") return appleString(value);
  throw new Error("Adjustment values must be numbers, booleans, or strings.");
}

function buildAdjustmentReadLines(fields: string[]): string {
  return fields.map((field) => `
        set fieldValue to ""
        try
          set fieldValue to ${field} of adjustments of v as text
        end try
        set end of rows to variantId & tab & variantName & tab & ${appleString(field)} & tab & fieldValue`).join("\n");
}

function safeStat(filePath: string): { exists: boolean; size?: number; mtimeMs?: number } {
  try {
    const stat = statSync(filePath);
    return { exists: stat.isFile(), size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { exists: false };
  }
}

function findFirstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (safeStat(candidate).exists) return candidate;
  }
  return null;
}

function listThumbnailCandidates(cacheRoot: string, imageBaseName: string): string[] {
  const thumbDir = path.join(cacheRoot, "Thumbnails");
  try {
    return readdirSync(thumbDir)
      .filter((name) => name.startsWith(`${imageBaseName}.`) && name.endsWith(".cot"))
      .map((name) => path.join(thumbDir, name));
  } catch {
    return [];
  }
}

// Catalog (.cocatalog) caches store proxy/focus previews under
// Cache/Previews/<YYYY/MM/DD/HH>/<raw filename>.cop|.cof — date-nested, not the
// flat session-style Cache/Proxies/. Walk the Previews tree (depth-capped) for
// <imageBaseName>.<ext>. Catalog thumbnails are named by numeric catalog id, not
// the raw basename, so catalog thumbnail lookup still needs the catalog DB and is
// intentionally left to the session-style Thumbnails path above.
// Collects EVERY match: the name is only the raw basename, so two raws called
// DSC00001.ARW (camera counter wrap, two bodies) share it. Returning the first hit
// handed back another photo's preview as if it were this one's.
function walkForFiles(dir: string, targetName: string, maxDepth: number, found: string[]): string[] {
  if (maxDepth < 0) return found;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name === targetName) found.push(path.join(dir, entry.name));
  }
  for (const entry of entries) {
    if (entry.isDirectory()) walkForFiles(path.join(dir, entry.name), targetName, maxDepth - 1, found);
  }
  return found;
}

function findCatalogPreviewFiles(cacheRoot: string, imageBaseName: string, ext: string): string[] {
  // Previews date tree is Previews/YYYY/MM/DD/HH → 4 levels; cap at 6 for headroom.
  return walkForFiles(path.join(cacheRoot, "Previews"), `${imageBaseName}.${ext}`, 6, []);
}

// Exactly one catalog match → use it. Several → refuse to guess (null) and report
// the candidates, so a caller never analyses the wrong photo believing it is this one.
function uniqueCatalogPreview(roots: string[], imageBaseName: string, ext: string): { path: string | null; candidates: string[] } {
  const candidates = uniqueStrings(roots.flatMap((root) => findCatalogPreviewFiles(root, imageBaseName, ext)));
  return { path: candidates.length === 1 ? candidates[0] : null, candidates };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

type SelectedVariantDiskInfo = {
  id: string;
  name: string;
  file: string;
};

type CacheLookupContext = {
  documentKind: string;
  documentPath: string;
  documentFolder: string;
  variants: SelectedVariantDiskInfo[];
};

async function selectedVariantDiskInfo(): Promise<CacheLookupContext> {
  const raw = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set docKind to ""
      set docPath to ""
      set docFolder to ""
      try
        set docKind to kind of current document as text
      end try
      try
        set docPath to POSIX path of (path of current document)
      end try
      try
        set docFolder to POSIX path of (folder of current document)
      end try
      set rows to {"DOC" & tab & docKind & tab & docPath & tab & docFolder}
      tell current document to set selectedList to every variant whose selected is true
      repeat with v in selectedList
        set variantId to ""
        set variantName to ""
        set variantFile to ""
        try
          set variantId to id of v as text
        end try
        try
          set variantName to name of v as text
        end try
        try
          set variantFile to path of parent image of v as text
        end try
        set end of rows to "VAR" & tab & variantId & tab & variantName & tab & variantFile
      end repeat
      set AppleScript's text item delimiters to linefeed
      return rows as text
    end tell
  `);

  const context: CacheLookupContext = { documentKind: "", documentPath: "", documentFolder: "", variants: [] };
  for (const line of raw.split(/\r?\n/)) {
    const cols = line.split("\t");
    if (cols[0] === "DOC") {
      context.documentKind = cols[1] ?? "";
      context.documentPath = cols[2] ?? "";
      context.documentFolder = cols[3] ?? "";
    } else if (cols[0] === "VAR") {
      context.variants.push({ id: cols[1] ?? "", name: cols[2] ?? "", file: cols[3] ?? "" });
    }
  }
  return context;
}

function cacheRootsForVariant(context: CacheLookupContext, filePath: string): string[] {
  const imageDir = path.dirname(filePath);
  const docPath = context.documentPath;
  const docFolder = context.documentFolder;
  return uniqueStrings([
    path.join(imageDir, "CaptureOne", "Cache"),
    path.join(imageDir, "..", "CaptureOne", "Cache"),
    docPath ? path.join(docPath, "Cache") : null,
    docPath ? path.join(docPath, "CaptureOne", "Cache") : null,
    docFolder ? path.join(docFolder, "CaptureOne", "Cache") : null,
    docFolder ? path.join(docFolder, "Cache") : null,
  ]).map((candidate) => path.resolve(candidate));
}

function findCacheForVariant(context: CacheLookupContext, variant: SelectedVariantDiskInfo): JsonObject {
  const imageBaseName = path.basename(variant.file);
  const roots = cacheRootsForVariant(context, variant.file);
  const proxyCandidates = roots.map((root) => path.join(root, "Proxies", `${imageBaseName}.cop`));
  const focusCandidates = roots.map((root) => path.join(root, "Proxies", `${imageBaseName}.cof`));
  const thumbnails = roots.flatMap((root) => listThumbnailCandidates(root, imageBaseName));
  const ambiguous: Record<string, string[]> = {};
  const fromCatalog = (ext: string, kind: string): string | null => {
    const hit = uniqueCatalogPreview(roots, imageBaseName, ext);
    if (hit.candidates.length > 1) ambiguous[kind] = hit.candidates;
    return hit.path;
  };
  const proxy = findFirstExisting(proxyCandidates) ?? fromCatalog("cop", "proxy");
  const focus = findFirstExisting(focusCandidates) ?? fromCatalog("cof", "focus");
  const thumbnail = findFirstExisting(thumbnails);
  return {
    id: variant.id,
    name: variant.name,
    file: variant.file,
    imageBaseName,
    cacheRootsTried: roots,
    ...(Object.keys(ambiguous).length
      ? { ambiguous, ambiguousNote: "Several catalog previews share this raw filename; none was picked. Export the variant instead." }
      : {}),
    proxy: proxy ? { path: proxy, ...safeStat(proxy), kind: "proxy", format: "JPEG XL container (.cop)" } : null,
    focus: focus ? { path: focus, ...safeStat(focus), kind: "focus", format: "JPEG grayscale (.cof)" } : null,
    thumbnail: thumbnail ? { path: thumbnail, ...safeStat(thumbnail), kind: "thumbnail", format: "JPEG (.cot)" } : null,
  };
}

async function runAppleScript(script: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`osascript timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
    });
  });
}

async function appBundleVersion(): Promise<string | null> {
  if (!existsSync(APP_PATH)) return null;
  try {
    const { stdout } = await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", `${APP_PATH}/Contents/Info.plist`], { timeout: 5_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function isRunning(): Promise<boolean> {
  try {
    await execFileAsync("pgrep", ["-x", PROCESS_NAME], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function assertWriteAllowed(): void {
  if (!ALLOW_WRITE) {
    throw new Error("This tool mutates Capture One state. Restart the MCP server with CAPTURE_ONE_MCP_ALLOW_WRITE=1 to enable it.");
  }
}

async function status(): Promise<CallToolResult> {
  const installed = existsSync(APP_PATH);
  const bundleVersion = await appBundleVersion();
  const running = await isRunning();
  const result: JsonObject = { installed, appPath: APP_PATH, bundleVersion, running };

  if (!installed || !running) return jsonText(result);

  const raw = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set docName to ""
      set selectedCount to 0
      try
        set docName to name of current document as text
      end try
      try
        tell current document to set selectedCount to count of (every variant whose selected is true)
      end try
      return "appVersion=" & (app version as text) & linefeed & "currentDocument=" & docName & linefeed & "selectedVariants=" & (selectedCount as text)
    end tell
  `);

  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > -1) result[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return jsonText(result);
}

async function selectedVariants(): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");

  const tsv = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set rows to {"id" & tab & "name" & tab & "rating" & tab & "color_tag" & tab & "file"}
      tell current document to set selectedList to every variant whose selected is true
      repeat with v in selectedList
        set variantId to ""
        set variantName to ""
        set variantRating to ""
        set variantColorTag to ""
        set variantFile to ""
        try
          set variantId to id of v as text
        end try
        try
          set variantName to name of v as text
        end try
        try
          set variantRating to rating of v as text
        end try
        try
          set variantColorTag to color tag of v as text
        end try
        try
          set variantFile to path of parent image of v as text
        end try
        set end of rows to variantId & tab & variantName & tab & variantRating & tab & variantColorTag & tab & variantFile
      end repeat
      set AppleScript's text item delimiters to linefeed
      return rows as text
    end tell
  `);
  return textResult(tsv);
}

async function listRecipes(): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");

  const tsv = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set rows to {"name" & tab & "enabled" & tab & "output_format"}
      tell current document
        repeat with r in recipes
          set recipeName to ""
          set recipeEnabled to ""
          set recipeFormat to ""
          try
            set recipeName to name of r as text
          end try
          try
            set recipeEnabled to enabled of r as text
          end try
          try
            set recipeFormat to output format of r as text
          end try
          set end of rows to recipeName & tab & recipeEnabled & tab & recipeFormat
        end repeat
      end tell
      set AppleScript's text item delimiters to linefeed
      return rows as text
    end tell
  `);
  return textResult(tsv);
}

async function adjustmentFields(): Promise<CallToolResult> {
  return jsonText({
    count: ADJUSTMENT_FIELDS.length,
    fields: ADJUSTMENT_FIELDS,
    defaultStyleFields: DEFAULT_STYLE_FIELDS,
    nestedObjectTools: [
      "curves: use capture_one_get_selected_curves / capture_one_set_selected_curve (rgb/luma/red/green/blue)",
      "layers/masks/local adjustments: use capture_one_get_selected_layers / capture_one_set_selected_layer / capture_one_set_selected_layer_adjustments / capture_one_layer_mask",
    ],
    notScriptable: [
      "color editor settings: the sdef `color editor options` class exposes no properties/elements, so the Color Editor is not addressable via AppleScript in this version",
      "dehaze color / RGB color object fields require RGB coercion not yet implemented",
    ],
  });
}

async function getSelectedAdjustments(args: JsonObject): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");
  const fields = normalizeAdjustmentFields(args.fields);
  const readLines = buildAdjustmentReadLines(fields);

  const tsv = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set rows to {"variant_id" & tab & "variant_name" & tab & "field" & tab & "value"}
      tell current document to set selectedList to every variant whose selected is true
      repeat with v in selectedList
        set variantId to ""
        set variantName to ""
        try
          set variantId to id of v as text
        end try
        try
          set variantName to name of v as text
        end try
${readLines}
      end repeat
      set AppleScript's text item delimiters to linefeed
      return rows as text
    end tell
  `);
  return textResult(tsv);
}

async function findSelectedPreviewCache(): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");
  const context = await selectedVariantDiskInfo();
  return jsonText({
    document: {
      kind: context.documentKind,
      path: context.documentPath,
      folder: context.documentFolder,
    },
    variants: context.variants.map((variant) => findCacheForVariant(context, variant)),
  });
}

async function convertSelectedPreviewCache(args: JsonObject): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");
  const prefer = typeof args.prefer === "string" ? args.prefer : "proxy";
  if (!["proxy", "thumbnail", "focus"].includes(prefer)) return errorResult("prefer must be proxy, thumbnail, or focus.");
  const outputDir = typeof args.outputDir === "string" && args.outputDir.trim()
    ? args.outputDir.trim()
    : path.join("/tmp", "capture-one-mcp-previews");
  mkdirSync(outputDir, { recursive: true });

  const context = await selectedVariantDiskInfo();
  const converted: JsonObject[] = [];
  for (const variant of context.variants) {
    const cache = findCacheForVariant(context, variant) as Record<string, unknown>;
    const orderedKinds = prefer === "proxy" ? ["proxy", "thumbnail", "focus"]
      : prefer === "thumbnail" ? ["thumbnail", "proxy", "focus"]
        : ["focus", "proxy", "thumbnail"];
    const chosenKind = orderedKinds.find((kind) => cache[kind]);
    if (!chosenKind) {
      const ambiguous = cache.ambiguous as Record<string, string[]> | undefined;
      converted.push({
        id: variant.id,
        name: variant.name,
        file: variant.file,
        error: ambiguous
          ? "Ambiguous: several catalog previews share this raw filename, refusing to guess which photo it is."
          : "No Capture One cache preview found.",
        ...(ambiguous ? { ambiguous } : {}),
      });
      continue;
    }
    const chosen = cache[chosenKind] as { path: string };
    const digest = createHash("sha1").update(chosen.path).digest("hex").slice(0, 12);
    const outputPath = path.join(outputDir, `${path.basename(variant.file)}.${chosenKind}.${digest}.jpg`);
    try {
      await execFileAsync("sips", ["-s", "format", "jpeg", chosen.path, "--out", outputPath], { timeout: 30_000 });
      converted.push({
        id: variant.id,
        name: variant.name,
        file: variant.file,
        sourceKind: chosenKind,
        sourcePath: chosen.path,
        outputPath,
        ...safeStat(outputPath),
      });
    } catch (error) {
      converted.push({
        id: variant.id,
        name: variant.name,
        file: variant.file,
        sourceKind: chosenKind,
        sourcePath: chosen.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return jsonText({ outputDir, converted });
}

async function setSelectedAdjustments(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const settings = args.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return errorResult("settings must be an object.");
  const entries = Object.entries(settings as JsonObject);
  if (entries.length === 0) return errorResult("settings must include at least one adjustment field.");

  const setLines = entries.map(([field, value]) => {
    const spec = ADJUSTMENT_FIELD_BY_NAME.get(field);
    if (!spec) throw new Error(`Unsupported Capture One adjustment field: ${field}`);
    return `        set ${field} of adjustments of v to ${appleLiteral(value, spec.type)}`;
  }).join("\n");

  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      tell current document to set selectedList to every variant whose selected is true
      if (count of selectedList) is 0 then error "No selected variants."
      set updatedCount to 0
      repeat with v in selectedList
${setLines}
        set updatedCount to updatedCount + 1
      end repeat
      return "updated " & (updatedCount as text) & " selected variant(s); fields: ${entries.map(([field]) => field).join(", ")}"
    end tell
  `);
  return textResult(output);
}

async function setSelectedRating(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const rating = Number(args.rating);
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) return errorResult("rating must be an integer from 0 to 5.");

  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set updatedCount to 0
      tell current document to set selectedList to every variant whose selected is true
      repeat with v in selectedList
        set rating of v to ${rating}
        set updatedCount to updatedCount + 1
      end repeat
      return "updated " & (updatedCount as text) & " selected variant(s) to rating ${rating}"
    end tell
  `);
  return textResult(output);
}

async function processSelected(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const recipe = typeof args.recipe === "string" ? args.recipe.trim() : "";
  const processLine = recipe.length > 0
    ? `set jobId to process selected variants recipe ${appleString(recipe)}`
    : "set jobId to process selected variants";

  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      tell current document to set selectedList to every variant whose selected is true
      if (count of selectedList) is 0 then error "No selected variants."
      ${processLine}
      return jobId as text
    end tell
  `, 60_000);
  return textResult(output);
}

async function capture(): Promise<CallToolResult> {
  assertWriteAllowed();
  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      capture
      return "capture triggered"
    end tell
  `, 60_000);
  return textResult(output);
}

// Debug/verification entry point: resolve (and optionally sips-convert) a
// preview cache file for a given document + raw file path, without an MCP client
// or a running Capture One. Validates catalog/session cache lookup directly.
//   node dist/index.js --probe-cache "<docPath>" "<variantFile>" [--convert]
if (process.argv.includes("--probe-cache")) {
  const idx = process.argv.indexOf("--probe-cache");
  const docPath = process.argv[idx + 1] ?? "";
  const variantFile = process.argv[idx + 2] ?? "";
  if (!docPath || !variantFile || variantFile.startsWith("--")) {
    console.error('Usage: node dist/index.js --probe-cache "<docPath>" "<variantFile>" [--convert]');
    process.exit(2);
  }
  const probeContext: CacheLookupContext = {
    documentKind: "probe",
    documentPath: docPath,
    documentFolder: path.dirname(docPath),
    variants: [{ id: "probe", name: path.basename(variantFile), file: variantFile }],
  };
  const info = findCacheForVariant(probeContext, probeContext.variants[0]) as Record<string, unknown>;
  if (process.argv.includes("--convert")) {
    const kind = (["proxy", "thumbnail", "focus"] as const).find((k) => info[k]);
    if (kind) {
      const chosen = info[kind] as { path: string };
      const outputPath = path.join("/tmp", "capture-one-mcp-probe", `${path.basename(variantFile)}.${kind}.jpg`);
      mkdirSync(path.dirname(outputPath), { recursive: true });
      try {
        await execFileAsync("sips", ["-s", "format", "jpeg", chosen.path, "--out", outputPath], { timeout: 30_000 });
        info.converted = { kind, outputPath, ...safeStat(outputPath) };
      } catch (error) {
        info.converted = { kind, error: error instanceof Error ? error.message : String(error) };
      }
    } else {
      info.converted = { error: "No cache preview found to convert." };
    }
  }
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
}

async function getSelectedCurves(): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");
  const curveReads = Object.entries(CURVE_PROPERTY_BY_NAME).map(([key, prop]) => `
        repeat with cp in (every curve point of ${prop} of adjustments of v)
          set end of rows to variantId & tab & ${appleString(key)} & tab & (brightness of cp as text) & tab & (amount of cp as text)
        end repeat`).join("\n");
  const tsv = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set rows to {"variant_id" & tab & "curve" & tab & "brightness" & tab & "amount"}
      tell current document to set selectedList to every variant whose selected is true
      repeat with v in selectedList
        set variantId to ""
        try
          set variantId to id of v as text
        end try
${curveReads}
      end repeat
      set AppleScript's text item delimiters to linefeed
      return rows as text
    end tell
  `);
  return textResult(tsv);
}

async function setSelectedCurve(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const curveKey = typeof args.curve === "string" ? args.curve : "";
  const prop = CURVE_PROPERTY_BY_NAME[curveKey];
  if (!prop) return errorResult("curve must be one of rgb, luma, red, green, blue.");
  const points = Array.isArray(args.points) ? args.points : null;
  if (!points || points.length === 0) return errorResult("points must be a non-empty array of { brightness, amount }.");
  const makeLines = points.map((p) => {
    const pt = p as JsonObject;
    const b = Number(pt.brightness);
    const a = Number(pt.amount);
    if (!Number.isFinite(b) || !Number.isFinite(a)) throw new Error("Each point needs finite brightness and amount.");
    return `        make new curve point at end of theCurve with properties {brightness:${b}, amount:${a}}`;
  }).join("\n");
  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      tell current document to set selectedList to every variant whose selected is true
      if (count of selectedList) is 0 then error "No selected variants."
      set updatedCount to 0
      repeat with v in selectedList
        set theCurve to ${prop} of adjustments of v
        delete every curve point of theCurve
${makeLines}
        set updatedCount to updatedCount + 1
      end repeat
      return "set ${curveKey} curve (${points.length} point(s)) on " & (updatedCount as text) & " variant(s)"
    end tell
  `);
  return textResult(output);
}

async function getSelectedLayers(): Promise<CallToolResult> {
  const running = await isRunning();
  if (!running) return errorResult("Capture One is not running. Open it before calling this tool.");
  const tsv = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      set rows to {"variant_id" & tab & "layer_index" & tab & "name" & tab & "kind" & tab & "enabled" & tab & "opacity" & tab & "luma_range_low" & tab & "luma_range_high"}
      tell current document to set selectedList to every variant whose selected is true
      repeat with v in selectedList
        set variantId to ""
        try
          set variantId to id of v as text
        end try
        set layerIndex to 0
        repeat with lyr in (every layer of v)
          set layerIndex to layerIndex + 1
          set lName to ""
          set lKind to ""
          set lEnabled to ""
          set lOpacity to ""
          set lLow to ""
          set lHigh to ""
          try
            set lName to name of lyr as text
          end try
          try
            set lKind to kind of lyr as text
          end try
          try
            set lEnabled to enabled of lyr as text
          end try
          try
            set lOpacity to opacity of lyr as text
          end try
          try
            set lLow to range low of luma range of lyr as text
          end try
          try
            set lHigh to range high of luma range of lyr as text
          end try
          set end of rows to variantId & tab & (layerIndex as text) & tab & lName & tab & lKind & tab & lEnabled & tab & lOpacity & tab & lLow & tab & lHigh
        end repeat
      end repeat
      set AppleScript's text item delimiters to linefeed
      return rows as text
    end tell
  `);
  return textResult(tsv);
}

async function setSelectedLayer(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const layerIndex = Number(args.layerIndex);
  if (!Number.isInteger(layerIndex) || layerIndex < 1) return errorResult("layerIndex must be a positive integer (1-based).");
  const setLines: string[] = [];
  if (typeof args.name === "string") setLines.push(`        set name of lyr to ${appleString(args.name)}`);
  if (typeof args.enabled === "boolean") setLines.push(`        set enabled of lyr to ${args.enabled ? "true" : "false"}`);
  if (args.opacity !== undefined) {
    const op = Number(args.opacity);
    if (!Number.isInteger(op) || op < 1 || op > 100) return errorResult("opacity must be an integer 1-100.");
    setLines.push(`        set opacity of lyr to ${op}`);
  }
  if (args.lumaRange && typeof args.lumaRange === "object" && !Array.isArray(args.lumaRange)) {
    for (const [field, value] of Object.entries(args.lumaRange as JsonObject)) {
      const fieldType = LUMA_RANGE_FIELD_TYPES[field];
      if (!fieldType) return errorResult(`Unsupported luma range field: ${field}`);
      setLines.push(`        set ${field} of luma range of lyr to ${appleLiteral(value, fieldType)}`);
    }
  }
  if (setLines.length === 0) return errorResult("Provide at least one of name, enabled, opacity, lumaRange.");
  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      tell current document to set selectedList to every variant whose selected is true
      if (count of selectedList) is 0 then error "No selected variants."
      set updatedCount to 0
      repeat with v in selectedList
        if (count of layers of v) < ${layerIndex} then error "Layer index ${layerIndex} out of range for a selected variant."
        set lyr to layer ${layerIndex} of v
${setLines.join("\n")}
        set updatedCount to updatedCount + 1
      end repeat
      return "updated layer ${layerIndex} on " & (updatedCount as text) & " variant(s)"
    end tell
  `);
  return textResult(output);
}

async function setSelectedLayerAdjustments(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const layerIndex = Number(args.layerIndex);
  if (!Number.isInteger(layerIndex) || layerIndex < 1) return errorResult("layerIndex must be a positive integer (1-based).");
  const settings = args.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return errorResult("settings must be an object.");
  const entries = Object.entries(settings as JsonObject);
  if (entries.length === 0) return errorResult("settings must include at least one adjustment field.");
  const setLines = entries.map(([field, value]) => {
    const spec = ADJUSTMENT_FIELD_BY_NAME.get(field);
    if (!spec) throw new Error(`Unsupported Capture One adjustment field: ${field}`);
    return `        set ${field} of adjustments of lyr to ${appleLiteral(value, spec.type)}`;
  }).join("\n");
  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      tell current document to set selectedList to every variant whose selected is true
      if (count of selectedList) is 0 then error "No selected variants."
      set updatedCount to 0
      repeat with v in selectedList
        if (count of layers of v) < ${layerIndex} then error "Layer index ${layerIndex} out of range for a selected variant."
        set lyr to layer ${layerIndex} of v
${setLines}
        set updatedCount to updatedCount + 1
      end repeat
      return "updated layer ${layerIndex} adjustments (${entries.map(([field]) => field).join(", ")}) on " & (updatedCount as text) & " variant(s)"
    end tell
  `);
  return textResult(output);
}

async function layerMask(args: JsonObject): Promise<CallToolResult> {
  assertWriteAllowed();
  const layerIndex = Number(args.layerIndex);
  if (!Number.isInteger(layerIndex) || layerIndex < 1) return errorResult("layerIndex must be a positive integer (1-based).");
  const cmdKey = typeof args.command === "string" ? args.command : "";
  const spec = LAYER_MASK_COMMANDS[cmdKey];
  if (!spec) return errorResult("command must be one of clear, invert, fill, rasterize, feather, refine.");
  let cmdLine = `${spec.command} (layer ${layerIndex} of v)`;
  if (spec.takesAmount) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < spec.min || amount > spec.max) {
      return errorResult(`${cmdKey} requires amount between ${spec.min} and ${spec.max}.`);
    }
    cmdLine = `${spec.command} (layer ${layerIndex} of v) amount ${amount}`;
  }
  const output = await runAppleScript(`
    tell application ${appleString(PROCESS_NAME)}
      tell current document to set selectedList to every variant whose selected is true
      if (count of selectedList) is 0 then error "No selected variants."
      set updatedCount to 0
      repeat with v in selectedList
        if (count of layers of v) < ${layerIndex} then error "Layer index ${layerIndex} out of range for a selected variant."
        ${cmdLine}
        set updatedCount to updatedCount + 1
      end repeat
      return "${spec.command} on layer ${layerIndex} of " & (updatedCount as text) & " variant(s)"
    end tell
  `);
  return textResult(output);
}

const server = new Server(
  { name: "capture-one-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as JsonObject;
  try {
    switch (request.params.name) {
      case "capture_one_status": return await status();
      case "capture_one_selected_variants": return await selectedVariants();
      case "capture_one_list_recipes": return await listRecipes();
      case "capture_one_adjustment_fields": return await adjustmentFields();
      case "capture_one_get_selected_adjustments": return await getSelectedAdjustments(args);
      case "capture_one_find_selected_preview_cache": return await findSelectedPreviewCache();
      case "capture_one_convert_selected_preview_cache": return await convertSelectedPreviewCache(args);
      case "capture_one_set_selected_adjustments": return await setSelectedAdjustments(args);
      case "capture_one_set_selected_rating": return await setSelectedRating(args);
      case "capture_one_process_selected": return await processSelected(args);
      case "capture_one_capture": return await capture();
      case "capture_one_get_selected_curves": return await getSelectedCurves();
      case "capture_one_set_selected_curve": return await setSelectedCurve(args);
      case "capture_one_get_selected_layers": return await getSelectedLayers();
      case "capture_one_set_selected_layer": return await setSelectedLayer(args);
      case "capture_one_set_selected_layer_adjustments": return await setSelectedLayerAdjustments(args);
      case "capture_one_layer_mask": return await layerMask(args);
      default: return errorResult(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
