import type { MealDraft } from './types';

/**
 * Wynik analizy AI przekazywany z ekranu analizy do edytora posiłku.
 * Trzymany tylko w pamięci – na dysk trafia dopiero po zatwierdzeniu przez użytkownika.
 */
const pending = new Map<string, MealDraft>();

export const newKey = () => Math.random().toString(36).slice(2, 10);

export function putDraft(d: MealDraft): string {
  const id = newKey();
  pending.set(id, d);
  return id;
}

export const getDraft = (id: string | undefined) => (id ? pending.get(id) ?? null : null);

export function dropDraft(id: string | undefined) {
  if (id) pending.delete(id);
}
