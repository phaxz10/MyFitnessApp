# ADR-0008 — Local zip backup replaces Google Drive

- **Status**: Accepted
- **Date**: 2026-10-21
- **Supersedes**: ADR-0004 (Google Drive backup replaces GitHub Gist)

## Context

ADR-0004 moved auto-backup to the user's Google Drive. In practice it carried a lot of weight for a single-user, offline-first PWA: a Google Cloud project and OAuth client ID for every deployment (`VITE_GOOGLE_CLIENT_ID`), consent-screen scopes, one-hour implicit-flow tokens with silent re-auth and a "Reconnect" state, restore-on-load with last-backup-wins semantics, lazy photo downloads with nullable `photo_data`, and a sign-in branch in onboarding. All of that is code that talks to a third party about the user's health data, for a backup that only ran while the app was open anyway.

The manual JSON export that ADR-0004 kept as an escape hatch had its own problem: progress photos were inlined as base64 data URLs, so the file was large, opaque, and the photos were not usable outside the app.

## Decision

**Backup is a file the user downloads. There is no cloud integration.**

1. **Format: one `.zip`** named `mypersonalfitness-backup-YYYY-MM-DD.zip` (built with `fflate`, images stored uncompressed since they already are):
   - `backup.json` — the existing `BackupData` shape at version `2.0`. Each `progress_photos` row drops `photo_data` and gains `photo_file: "photos/<id>.<ext>"` (extension from the data URL's MIME type; `null` when the row has no image).
   - `photos/<id>.<ext>` — the decoded image bytes, openable by any image viewer.
2. **Export keeps the category picker** (`ExportOptions`) and **always strips API keys**. The Drive-only options (sync metadata, device id, the keep-secrets path, the dual call signature) are gone.
3. **Date and time columns are exported as Postgres text**, not JS `Date`s. PGlite parses `TIMESTAMP` (no time zone) as local time; serialising that as UTC ISO and inserting it back shifted every `created_at` / `updated_at` by the device's UTC offset on each restore.
4. **Import accepts the new `.zip` and legacy `.json`** (version `0`, photos inline), detected by the zip magic bytes, so every backup a user already has still restores. `photo_file` is mapped back to a data URL. Anything else is rejected with a clear error. The restore keeps the existing single-transaction replace-and-reset-sequences logic.
5. **Onboarding offers "Restore from a backup file"** using the same import; if the backup carries a profile, onboarding is skipped.
6. **Removed**: `googleAuth.ts`, `googleDrive.ts`, `autoBackup.ts`, the Drive panel in Settings, the Google sign-in in onboarding, the Google icon, the GIS type declarations, and the `VITE_GOOGLE_CLIENT_ID` variable.

## Considered options

- **Keep Drive, fix the rough edges**: still needs an OAuth client per deployment and leaves health data flowing to a third party by default. Rejected.
- **JSON only, photos inline**: simplest, but large, and photos are not recoverable without the app. Rejected.
- **PGlite `dumpDataDir()`**: opaque and tied to PGlite internals, as noted in ADR-0004. Rejected.

## Consequences

- **Positive**: No accounts, no OAuth setup, no network dependency; the app can be cloned and run with no `.env`. Backups are inspectable, and photos are plain image files.
- **Positive**: Strictly less code that handles health data outside the device.
- **Negative**: No automatic backup. Users must export periodically and keep the file somewhere safe. Accepted: the app says so next to the export button.
- **Negative**: Data that only existed on Google Drive is no longer reachable from the app. Users should download it from their Drive folder; the Drive `backup.json` can be re-imported as a legacy `.json`, but its photos (stored separately on Drive) will be missing.
- **Neutral**: `progress_photos.photo_data` stays nullable (migration v2). The Write Bus (`onDbWrite`) no longer has a built-in subscriber.
