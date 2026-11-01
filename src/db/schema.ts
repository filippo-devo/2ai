import type { Db } from './repo';

const DATABASE_VERSION = 1;

/**
 * Tworzy/aktualizuje schemat bazy. Wersja schematu trzymana jest w PRAGMA user_version,
 * dzięki czemu przyszłe zmiany schematu można dodawać jako kolejne migracje bez utraty danych.
 */
export async function migrateDbIfNeeded(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meals (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        day           TEXT NOT NULL,
        meal_type     TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
        name          TEXT NOT NULL,
        photo_file    TEXT,
        source        TEXT NOT NULL CHECK (source IN ('ai','manual')),
        ai_confidence TEXT,
        ai_notes      TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meals_day ON meals(day);

      CREATE TABLE IF NOT EXISTS meal_items (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id       INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
        position      INTEGER NOT NULL,
        name          TEXT NOT NULL,
        grams         REAL NOT NULL,
        kcal_100      REAL NOT NULL,
        protein_100   REAL NOT NULL,
        carbs_100     REAL NOT NULL,
        fat_100       REAL NOT NULL,
        ai_estimated  INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_items_meal ON meal_items(meal_id);
    `);
    version = 1;
  }

  // Przyszłe migracje: if (version === 1) { ...; version = 2; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
