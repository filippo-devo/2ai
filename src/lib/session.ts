import { useSyncExternalStore } from 'react';
import type { AnalysisResult } from './api';
import { newKey } from './draft';
import { mealTotals } from './nutrition';
import type { ItemDraft, Macros } from './types';

/**
 * Wyniki bieżącej sesji – WYŁĄCZNIE w pamięci RAM.
 * Nic nie trafia do bazy ani na dysk; wszystko znika po zamknięciu aplikacji.
 */
export interface QuickEntry {
  id: string;
  at: number;
  source: 'photo' | 'label' | 'barcode' | 'text' | 'manual';
  /** Zdjęcie jako data URI (tylko w pamięci) albo null. */
  image: string | null;
  /** Opis wpisany lub podyktowany przez użytkownika. */
  text?: string;
  /** Kod kreskowy produktu. */
  code?: string;
  /** Uwagi użytkownika z „Popraw wynik” (wysyłane razem ze zdjęciem przy ponownej analizie). */
  corrections?: string[];
  /** Skrót poprzedniego wyniku – kontekst dla poprawki. */
  previous?: string;
  status: 'analyzing' | 'done' | 'error';
  name: string;
  items: ItemDraft[];
  /** Liczba porcji – mnoży sumę wszystkich składników. */
  servings: number;
  /** Dla produktów: porcja i opakowanie w gramach (jeśli znane). */
  portions?: { serving: number | null; package: number | null };
  error?: { code: string; message: string };
}

interface SessionState {
  entries: QuickEntry[];
}

let state: SessionState = { entries: [] };
const listeners = new Set<() => void>();

function set(next: Partial<SessionState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const session = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  find: (id: string) => state.entries.find((e) => e.id === id),
  add: (e: QuickEntry) => set({ entries: [e, ...state.entries] }),
  patch: (id: string, patch: Partial<QuickEntry>) =>
    set({ entries: state.entries.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
  remove: (id: string) => set({ entries: state.entries.filter((x) => x.id !== id) }),
  clear: () => set({ entries: [] }),
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}

export function useEntry(id: string | undefined): QuickEntry | undefined {
  const { entries } = useSession();
  return entries.find((e) => e.id === id);
}

/** Suma wpisu z uwzględnieniem liczby porcji. */
export function entryTotals(e: QuickEntry): Macros {
  const t = mealTotals(e.items);
  const k = e.servings > 0 ? e.servings : 1;
  return { kcal: t.kcal * k, protein: t.protein * k, carbs: t.carbs * k, fat: t.fat * k };
}

export function entryName(e: QuickEntry): string {
  return e.name || e.items[0]?.name || 'Posiłek';
}

/** Wynik z serwera → edytowalne składniki (wartości na 100 g, więc zmiana gramatury przelicza resztę). */
export function itemsFromResult(r: AnalysisResult): ItemDraft[] {
  return r.items.map((it) => ({ key: newKey(), name: it.name, grams: it.grams, per100: { ...it.per100g }, aiEstimated: false }));
}

export function emptyItem(): ItemDraft {
  return { key: newKey(), name: '', grams: 100, per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, aiEstimated: false };
}
