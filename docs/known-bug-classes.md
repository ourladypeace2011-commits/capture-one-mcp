# Known bug classes

Grouped by the mistake, not the function. Each class has a test in
`test/structure.test.ts` that scans **every** tool / lookup in `src/index.ts`,
so the next tool that repeats the mistake fails `npm test`. (No CI in this repo
— run `npm test` before merging.)

| Class | First instance (fixed in) | Single-case regression | Class-level test (`test/structure.test.ts`) |
|---|---|---|---|
| A multi-variant write fails mid-way and reports only "error" — caller believes nothing changed, but earlier variants were modified (C1 has no scriptable undo) | layer index out of range on variant 3 of 5; `set_selected_curve` cleared the curve then failed (#1) | `test/writeOps.test.ts` | "every per-variant write reports per-variant outcome", "per-variant writes that can be pre-checked do so before the first write" |
| A tool mutates without the write gate, or a read tool's AppleScript mutates | — (guard) | — | "every tool that mutates is gated by assertWriteAllowed, and only those are" |
| A filename is treated as an identity — lookup by raw basename silently picks one of several same-named files (another photo's preview fed to vision) | catalog `DSC00001.ARW` from two cards (#2) | `test/previewCache.test.ts` | "catalog: N same-named raws never resolve to one preview", "name-keyed lookups: no new first-hit picks (ratchet)" |

Rules of thumb:

- New per-variant write → build it with `perVariantWriteScript` and return
  `runWrite(...)`; put every check that can run up front in `precheck`.
- A lookup by name returns **all** candidates; more than one → report
  ambiguity, never pick the first.

## Known gap (ratchet + todo test)

`findCacheForVariant` still picks the first existing file for session-style
caches (`FIRST_HIT_BASELINE = 3`: proxy, focus, thumbnail). Its candidate
roots include `<imageDir>/../CaptureOne/Cache` and the document folder's
cache, which hold previews of *other* folders' raws: a same-named raw in the
parent folder lends its preview when this raw has none yet. Pinned by the
`todo` test "session: a same-named raw in the PARENT folder must not lend its
preview" (it currently fails, reported as TODO). Fixing it: lower the
baseline and drop the `todo` flag.
