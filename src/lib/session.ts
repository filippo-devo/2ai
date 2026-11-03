import { useSyncExternalStore } from 'react';
import type { AnalysisResult } from './api';
import { newKey } from './draft';
import type { ItemDraft } from './types';

/**
 * Wyniki bieżącej sesji – WYŁĄCZNIE w pamięci RAM.
 * Nic nie trafia do bazy ani na dysk; wszystko znika po zamknięciu aplikacji.
 */
export interface QuickEntry {
  id: string;
  at: number;
  source: 'photo' | 'text' | 'manual';
  /** Zdjęcie jako data URI (tylko w pamięci) albo null dla opisu / wpisu ręcznego. */
  image: string | null;
  /** Opis wpisany lub podyktowany przez użytkownika. */
  text?: string;
  status: 'analyzing' | 'done' | 'error';
  name: string;
  items: ItemDraft[];
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

/** Wynik z serwera → edytowalne składniki (wartości na 100 g, więc zmiana gramatury przelicza resztę). */
export function itemsFromResult(r: AnalysisResult): ItemDraft[] {
  return r.items.map((it) => ({ key: newKey(), name: it.name, grams: it.grams, per100: { ...it.per100g }, aiEstimated: false }));
}

export function emptyItem(): ItemDraft {
  return { key: newKey(), name: '', grams: 100, per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, aiEstimated: false };
}
