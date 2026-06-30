# AGENTS.md

## Testing rules

- Tests must run without Capture One installed.
- Mock `osascript`.
- Mock `sips`.
- Mock filesystem cache paths.
- Mock environment variables.
- Use synthetic images for image analysis tests.
- Do not depend on real Capture One sessions, catalogs, RAW files or macOS permissions.
