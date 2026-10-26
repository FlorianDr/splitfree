import type { DatabaseSync } from "node:sqlite";
import { snapshotDatabase } from "./backup.server";
// SQL is imported as a bundled string (Vite `?raw`) so it ships inside the server build — no
// runtime filesystem read, which keeps the Docker image and dev server identical. Add a new
// migration by creating the .sql file and appending an entry below (keep them ordered).
import init0001 from "./migrations/0001_init.sql?raw";
import audit0002 from "./migrations/0002_audit_log.sql?raw";
import emailSends0003 from "./migrations/0003_email_sends.sql?raw";
import groups0004 from "./migrations/0004_groups.sql?raw";

const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [
  { name: "0001_init", sql: init0001 },
  { name: "0002_audit_log", sql: audit0002 },
  { name: "0003_email_sends", sql: emailSends0003 },
  { name: "0004_groups", sql: groups0004 },
];

/** Idempotently apply any not-yet-applied migrations, each in its own transaction. */
export function runMigrations(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
  );
  const appliedRows = db.prepare("SELECT name FROM _migrations").all() as {
    name: string;
  }[];
  const applied = new Set(appliedRows.map((r) => r.name));
  const pending = MIGRATIONS.filter((m) => !applied.has(m.name));
  if (pending.length === 0) return;

  // Safety net: snapshot an EXISTING database before mutating its schema, so a bad migration can
  // never be the only thing between us and the data. Skipped on a first-ever boot (applied.size === 0
  // — nothing to lose) and when DISABLE_MIGRATION_BACKUP=1. In production a snapshot failure is
  // fatal (fail closed); elsewhere it is a warning so dev/test isn't blocked.
  if (applied.size > 0 && process.env.DISABLE_MIGRATION_BACKUP !== "1") {
    try {
      const snap = snapshotDatabase(db, `pre-migration-${pending[0].name}`);
      console.log(`[migrate] pre-migration snapshot -> ${snap}`);
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          `Refusing to migrate: pre-migration backup failed (${(err as Error).message})`,
        );
      }
      console.warn("[migrate] pre-migration snapshot skipped (non-production):", err);
    }
  }

  const insert = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const migration of pending) {
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      insert.run(migration.name, Math.floor(Date.now() / 1000));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
