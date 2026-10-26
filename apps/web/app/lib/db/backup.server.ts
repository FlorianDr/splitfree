import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { env } from "~/lib/env.server";

/**
 * Where pre-migration snapshots live — alongside the DB file on the same (bind-mounted) volume,
 * unless BACKUP_DIR overrides it. Continuous off-site backups are Litestream's job.
 */
export function backupDir(): string {
  return process.env.BACKUP_DIR ?? join(dirname(env.DATABASE_PATH), "backups");
}

/**
 * Take a consistent `VACUUM INTO` snapshot of an already-open DB handle. Because it reuses the live
 * connection it captures committed WAL content too, and because VACUUM INTO writes a brand-new file
 * it is a true point-in-time copy — never a torn `cp`. Returns the snapshot path; throws if it
 * cannot be written (callers decide whether that is fatal).
 */
export function snapshotDatabase(db: DatabaseSync, label: string): string {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "") || "snapshot";
  const path = join(dir, `${safeLabel}-${stamp}.db`);
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
  return path;
}
