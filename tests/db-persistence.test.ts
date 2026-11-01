/**
 * Test trwałości danych: uruchamia TEN SAM kod warstwy danych co aplikacja (src/db/*)
 * na prawdziwym pliku SQLite, zamyka bazę i otwiera ją ponownie – tak jak przy restarcie aplikacji.
 * expo-sqlite działa tylko na telefonie, więc tutaj używamy wbudowanego w Node modułu node:sqlite
 * z cienką nakładką o takim samym API (runAsync/getAllAsync/getFirstAsync/execAsync/withTransactionAsync).
 *
 * Uruchomienie: npm run test:db
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { deleteMeal, getBackendUrl, getGoals, getMeal, listDays, listMealsForDay, saveBackendUrl, saveGoals, saveMeal, type Db } from '../src/db/repo';
import { migrateDbIfNeeded } from '../src/db/schema';
import { normalizeBackendUrl } from '../src/lib/api';
import { itemTotals, mealTotals, per100FromPortion } from '../src/lib/nutrition';
import type { MealDraft } from '../src/lib/types';

function openDb(file: string): Db & { close(): void } {
  const d = new DatabaseSync(file);
  const norm = (p: unknown[]) => (p.length === 1 && Array.isArray(p[0]) ? p[0] : p) as SQLInputValue[];
  const db = {
    async execAsync(sql: string) {
      d.exec(sql);
    },
    async runAsync(sql: string, ...p: unknown[]) {
      const r = d.prepare(sql).run(...norm(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync(sql: string, ...p: unknown[]) {
      return d.prepare(sql).get(...norm(p)) ?? null;
    },
    async getAllAsync(sql: string, ...p: unknown[]) {
      return d.prepare(sql).all(...norm(p));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      d.exec('BEGIN');
      try {
        await task();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => d.close(),
  };
  return db as unknown as Db & { close(): void };
}

async function launchApp(file: string) {
  const db = openDb(file);
  await migrateDbIfNeeded(db); // dokładnie to, co robi SQLiteProvider.onInit przy starcie aplikacji
  return db;
}

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} != ${b}`);

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calai-test-'));
  const file = path.join(dir, 'calai.db');
  const DAY = '2026-11-01';

  // --- Uruchomienie 1: świeża instalacja, zapis danych ---
  let db = await launchApp(file);
  assert.deepEqual(await getGoals(db), { kcal: 2000, protein: 120, carbs: 220, fat: 65 }, 'domyślne cele');
  await saveGoals(db, { kcal: 2300, protein: 150, carbs: 0, fat: 70 });
  await saveBackendUrl(db, normalizeBackendUrl('192.168.1.20'));

  const manual: MealDraft = {
    day: DAY,
    mealType: 'breakfast',
    name: 'Owsianka',
    photoFile: null,
    source: 'manual',
    aiConfidence: null,
    aiNotes: null,
    items: [
      { key: 'a', name: 'płatki owsiane', grams: 60, per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, aiEstimated: false },
      { key: 'b', name: 'mleko 2%', grams: 200, per100: { kcal: 50, protein: 3.4, carbs: 4.8, fat: 2 }, aiEstimated: false },
    ],
  };
  const ai: MealDraft = {
    day: DAY,
    mealType: 'lunch',
    name: 'Kurczak z ryżem',
    photoFile: 'meal-123-abc.jpg',
    source: 'ai',
    aiConfidence: 'medium',
    aiNotes: 'Założono ryż biały gotowany.',
    items: [
      { key: 'c', name: 'pierś z kurczaka grillowana', grams: 150, per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, aiEstimated: true },
      { key: 'd', name: 'ryż biały gotowany', grams: 200, per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, aiEstimated: true },
    ],
  };
  const manualId = await saveMeal(db, manual);
  const aiId = await saveMeal(db, ai);
  await saveMeal(db, { ...manual, day: '2026-10-31', name: 'Wczorajsza przekąska', mealType: 'snack' });
  db.close();

  // --- Uruchomienie 2: restart aplikacji – wszystko musi być odczytane z pliku ---
  db = await launchApp(file);
  assert.deepEqual(await getGoals(db), { kcal: 2300, protein: 150, carbs: 0, fat: 70 }, 'cele po restarcie (także 0 g)');
  assert.equal(await getBackendUrl(db), 'http://192.168.1.20:3001', 'adres backendu po restarcie');

  const meals = await listMealsForDay(db, DAY);
  assert.equal(meals.length, 2);
  assert.deepEqual(meals.map((m) => m.mealType), ['breakfast', 'lunch'], 'kolejność wg rodzaju posiłku');
  near(meals[0].totals.kcal, 60 * 3.7 + 200 * 0.5, 'kcal owsianki');
  near(meals[1].totals.protein, 1.5 * 31 + 2 * 2.7, 'białko kurczaka z ryżem');
  assert.equal(meals[1].photoFile, 'meal-123-abc.jpg', 'nazwa pliku zdjęcia');

  const loadedAi = await getMeal(db, aiId);
  assert.ok(loadedAi);
  assert.equal(loadedAi.source, 'ai');
  assert.equal(loadedAi.aiNotes, 'Założono ryż biały gotowany.');
  assert.deepEqual(loadedAi.items.map((i) => [i.name, i.grams, i.per100.kcal, i.aiEstimated]), [
    ['pierś z kurczaka grillowana', 150, 165, true],
    ['ryż biały gotowany', 200, 130, true],
  ]);

  const days = await listDays(db);
  assert.deepEqual(days.map((d) => [d.day, d.mealCount]), [[DAY, 2], ['2026-10-31', 1]], 'historia dni');
  near(days[0].totals.kcal, meals[0].totals.kcal + meals[1].totals.kcal, 'suma dnia');

  // Edycja: zmiana gramatury ryżu 200 -> 100 g, zmiana typu, usunięcie kurczaka i dodanie nowego składnika
  const edited: MealDraft = {
    ...loadedAi,
    mealType: 'dinner',
    items: [
      { ...loadedAi.items[1], grams: 100 },
      { key: 'e', name: 'sos', grams: 50, per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, aiEstimated: false },
    ],
  };
  // użytkownik wpisał 60 kcal dla 50 g sosu -> 120 kcal / 100 g
  edited.items[1].per100.kcal = per100FromPortion(60, 50)!;
  await saveMeal(db, edited);
  db.close();

  // --- Uruchomienie 3: edycja przetrwała restart ---
  db = await launchApp(file);
  const afterEdit = await getMeal(db, aiId);
  assert.ok(afterEdit);
  assert.equal(afterEdit.mealType, 'dinner');
  assert.equal(afterEdit.items.length, 2);
  near(mealTotals(afterEdit.items).kcal, 130 + 60, 'kcal po edycji');
  near(itemTotals({ grams: 25, per100: afterEdit.items[1].per100 }).kcal, 30, 'przeliczanie po zmianie gramatury');

  // Usunięcie posiłku (składniki usuwane kaskadowo)
  const photo = await deleteMeal(db, aiId);
  assert.equal(photo, 'meal-123-abc.jpg', 'deleteMeal zwraca plik zdjęcia do usunięcia');
  db.close();

  // --- Uruchomienie 4: usunięcie przetrwało restart, brak osieroconych składników ---
  db = await launchApp(file);
  assert.equal(await getMeal(db, aiId), null);
  assert.equal((await listMealsForDay(db, DAY)).length, 1);
  const orphans = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM meal_items WHERE meal_id = ?', aiId);
  assert.equal(orphans?.n, 0, 'składniki usuniętego posiłku');
  assert.ok(await getMeal(db, manualId));
  const ver = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(ver?.user_version, 1, 'wersja schematu');
  db.close();

  // Pomocnicze
  assert.equal(normalizeBackendUrl('http://10.0.0.5:4000/'), 'http://10.0.0.5:4000');
  assert.equal(normalizeBackendUrl(' 192.168.0.7 '), 'http://192.168.0.7:3001');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('OK – dane (cele, adres backendu, posiłki, składniki, edycje, usunięcia) przetrwały 4 kolejne „uruchomienia” bazy.');
}

main().catch((e) => {
  console.error('TEST NIEUDANY:', e);
  process.exit(1);
});
