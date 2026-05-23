# Google Drive backup replaces GitHub Gist

The auto-backup system moves from GitHub secret gists to the user's own Google Drive, authenticated via Google Identity Services (client-side implicit flow). The GitHub PAT + gist approach stored sensitive health data (body metrics, diet, progress photos) in unencrypted, URL-accessible gists — security through obscurity at best. Google Drive gives us encrypted-at-rest storage in the user's own account, OAuth scoped to `drive.file` (app-created files only), and no PAT friction.

## Considered options

- **Custom backend (Supabase/Firebase)**: makes us a data custodian, adds infrastructure to operate. Rejected — unnecessary for a single-user PWA.
- **Encrypted blob + GitHub Gist**: fixes security but not the size problem (full JSON snapshots of base64 photos) or the PAT UX friction.
- **PGlite binary dump to Drive**: `dumpDataDir()` is simpler but opaque, ties backup format to PGlite internals, and makes photo separation harder.

## Key design decisions

**Split backup model**: structured data (all tables minus `photo_data`) as a single `backup.json` uploaded on every 60-second debounce. Progress photos decoded from base64 data URLs to real JPEGs, uploaded individually to a `photos/` subfolder only when new photos appear.

**Drive folder structure**: `MyFitnessApp/backup.json` + `MyFitnessApp/photos/photo-{id}.jpg`. No manifest file — `files.list` on the photos folder is the source of truth for which photos are already uploaded.

**Auth model**: Google Identity Services implicit flow. Access tokens expire after 1 hour; silent re-auth (`prompt: 'none'`) before each backup attempt. No refresh tokens (requires a backend). Backup only works while the app is open — same as the current debounce model.

**Restore-on-load for multi-device**: on every app load, compare remote `exported_at` against local `last-restored-at`. If remote is newer, full restore. No conflict detection, no sync versioning — last backup wins.

**Onboarding**: "Sign in with Google" replaces "Import Backup" on the welcome step. If a backup exists on Drive, auto-restore with spinner (no confirmation). If no backup, silently continue onboarding. Photos lazy-load in the background after structured data restore.

**GitHub removal**: entire GitHub backup system removed (autoBackup.ts, PAT storage, gist CRUD, sync versioning, conflict detection). Manual export/import via backup.ts retained as offline escape hatch.

## Consequences

- Users with existing GitHub backups must manually export (JSON download) and re-import after the migration, or sign in with Google on a device that still has local data.
- No offline backup — requires Google session + network. Acceptable since the current GitHub approach also requires network.
- `appDataFolder` scope was rejected in favor of a visible Drive folder — users can inspect and download their own backups.
- `progress_photos.photo_data` column must tolerate NULL during lazy-load (currently NOT NULL). Requires a schema migration.
