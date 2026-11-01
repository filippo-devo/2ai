import type { SQLiteDatabase } from 'expo-sqlite';
import type { DaySummary, Goals, ItemDraft, MealDraft, MealSummary, MealType } from '../lib/types';

/** Podzbiór API expo-sqlite, którego używamy (ułatwia testy poza telefonem). */
export type Db = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync' | 'withTransactionAsync'>;

export const DEFAULT_GOALS: Goals = { kcal: 2000, protein: 120, carbs: 220, fat: 65 };

// ---------- ustawienia ----------

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getGoals(db: Db): Promise<Goals> {
  const raw = await getSetting(db, 'goals');
  if (!raw) return { ...DEFAULT_GOALS };
  try {
    const g = JSON.parse(raw) as Partial<Goals>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
    return {
      kcal: num(g.kcal, DEFAULT_GOALS.kcal),
      protein: num(g.protein, DEFAULT_GOALS.protein),
      carbs: num(g.carbs, DEFAULT_GOALS.carbs),
      fat: num(g.fat, DEFAULT_GOALS.fat),
    };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

export const saveGoals = (db: Db, goals: Goals) => setSetting(db, 'goals', JSON.stringify(goals));

export const getBackendUrl = (db: Db) => getSetting(db, 'backend_url');
export const saveBackendUrl = (db: Db, url: string) => setSetting(db, 'backend_url', url);

// ---------- posiłki ----------

const TOTALS_SQL = `
  COALESCE(SUM(i.grams * i.kcal_100    / 100.0), 0) AS kcal,
  COALESCE(SUM(i.grams * i.protein_100 / 100.0), 0) AS protein,
  COALESCE(SUM(i.grams * i.carbs_100   / 100.0), 0) AS carbs,
  COALESCE(SUM(i.grams * i.fat_100     / 100.0), 0) AS fat`;

interface MealSummaryRow {
  id: number;
  day: string;
  meal_type: MealType;
  name: string;
  photo_file: string | null;
  source: 'ai' | 'manual';
  item_count: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function listMealsForDay(db: Db, day: string): Promise<MealSummary[]> {
  const rows = await db.getAllAsync<MealSummaryRow>(
    `SELECT m.id, m.day, m.meal_type, m.name, m.photo_file, m.source,
            COUNT(i.id) AS item_count, ${TOTALS_SQL}
       FROM meals m LEFT JOIN meal_items i ON i.meal_id = m.id
      WHERE m.day = ?
      GROUP BY m.id
      ORDER BY CASE m.meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END, m.created_at`,
    day,
  );
  return rows.map((r) => ({
    id: r.id,
    day: r.day,
    mealType: r.meal_type,
    name: r.name,
    photoFile: r.photo_file,
    source: r.source,
    itemCount: r.item_count,
    totals: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat },
  }));
}

export async function listDays(db: Db): Promise<DaySummary[]> {
  const rows = await db.getAllAsync<{ day: string; meal_count: number; kcal: number; protein: number; carbs: number; fat: number }>(
    `SELECT m.day, COUNT(DISTINCT m.id) AS meal_count, ${TOTALS_SQL}
       FROM meals m LEFT JOIN meal_items i ON i.meal_id = m.id
      GROUP BY m.day
      ORDER BY m.day DESC`,
  );
  return rows.map((r) => ({
    day: r.day,
    mealCount: r.meal_count,
    totals: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat },
  }));
}

export async function getMeal(db: Db, id: number): Promise<MealDraft | null> {
  const m = await db.getFirstAsync<{
    id: number;
    day: string;
    meal_type: MealType;
    name: string;
    photo_file: string | null;
    source: 'ai' | 'manual';
    ai_confidence: string | null;
    ai_notes: string | null;
  }>('SELECT id, day, meal_type, name, photo_file, source, ai_confidence, ai_notes FROM meals WHERE id = ?', id);
  if (!m) return null;
  const items = await db.getAllAsync<{
    id: number;
    name: string;
    grams: number;
    kcal_100: number;
    protein_100: number;
    carbs_100: number;
    fat_100: number;
    ai_estimated: number;
  }>('SELECT * FROM meal_items WHERE meal_id = ? ORDER BY position', id);
  return {
    id: m.id,
    day: m.day,
    mealType: m.meal_type,
    name: m.name,
    photoFile: m.photo_file,
    source: m.source,
    aiConfidence: m.ai_confidence,
    aiNotes: m.ai_notes,
    items: items.map<ItemDraft>((i) => ({
      key: `db-${i.id}`,
      name: i.name,
      grams: i.grams,
      per100: { kcal: i.kcal_100, protein: i.protein_100, carbs: i.carbs_100, fat: i.fat_100 },
      aiEstimated: i.ai_estimated === 1,
    })),
  };
}

/** Zapisuje nowy posiłek albo aktualizuje istniejący (razem ze składnikami, w jednej transakcji). Zwraca id. */
export async function saveMeal(db: Db, meal: MealDraft): Promise<number> {
  const now = new Date().toISOString();
  let mealId = meal.id ?? 0;
  await db.withTransactionAsync(async () => {
    if (meal.id) {
      await db.runAsync(
        `UPDATE meals SET day = ?, meal_type = ?, name = ?, photo_file = ?, source = ?, ai_confidence = ?, ai_notes = ?, updated_at = ?
          WHERE id = ?`,
        meal.day, meal.mealType, meal.name, meal.photoFile, meal.source, meal.aiConfidence, meal.aiNotes, now, meal.id,
      );
      await db.runAsync('DELETE FROM meal_items WHERE meal_id = ?', meal.id);
    } else {
      const res = await db.runAsync(
        `INSERT INTO meals (day, meal_type, name, photo_file, source, ai_confidence, ai_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        meal.day, meal.mealType, meal.name, meal.photoFile, meal.source, meal.aiConfidence, meal.aiNotes, now, now,
      );
      mealId = res.lastInsertRowId;
    }
    let position = 0;
    for (const it of meal.items) {
      await db.runAsync(
        `INSERT INTO meal_items (meal_id, position, name, grams, kcal_100, protein_100, carbs_100, fat_100, ai_estimated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        mealId, position++, it.name, it.grams, it.per100.kcal, it.per100.protein, it.per100.carbs, it.per100.fat, it.aiEstimated ? 1 : 0,
      );
    }
  });
  return mealId;
}

/** Usuwa posiłek (składniki usuwa ON DELETE CASCADE). Zwraca nazwę pliku zdjęcia do usunięcia. */
export async function deleteMeal(db: Db, id: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ photo_file: string | null }>('SELECT photo_file FROM meals WHERE id = ?', id);
  await db.runAsync('DELETE FROM meals WHERE id = ?', id);
  return row?.photo_file ?? null;
}
