import { DatabaseSync } from "node:sqlite";
import { env } from "~/lib/env.server";
import { runMigrations } from "./migrate.server";

/**
 * Single shared SQLite connection (node:sqlite, synchronous). Cached on globalThis so Vite HMR in
 * dev doesn't open a new handle on every reload. Migrations run once, inline, on first access — so
 * the DB is always up to date before the first query, with no separate migrate step.
 */
const g = globalThis as unknown as { __sfDb?: DatabaseSync };

function init(): DatabaseSync {
  const db = new DatabaseSync(env.DATABASE_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  runMigrations(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!g.__sfDb) g.__sfDb = init();
  return g.__sfDb;
}

/** Run `fn` inside a transaction, rolling back on any throw. node:sqlite has no tx helper. */
export function tx<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Unix epoch seconds — the timestamp unit used throughout the schema. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Opaque text id for every row. */
export function newId(): string {
  return crypto.randomUUID();
}
