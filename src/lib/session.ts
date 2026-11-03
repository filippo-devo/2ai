import { useSyncExternalStore } from 'react';
import type { AnalysisResult } from './api';

/**
 * Stan „Szybkiej analizy” – WYŁĄCZNIE w pamięci RAM.
 * Nic nie trafia do bazy ani na dysk; wszystko znika po zamknięciu aplikacji.
 */
export type QuickEntry =
  | { id: string; at: number; image: string; status: 'analyzing' }
  | { id: string; at: number; image: string; status: 'done'; result: AnalysisResult }
  | { id: string; at: number; image: string; status: 'error'; code: string; message: string };

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
  add: (e: QuickEntry) => set({ entries: [e, ...state.entries] }),
  update: (e: QuickEntry) => set({ entries: state.entries.map((x) => (x.id === e.id ? e : x)) }),
  remove: (id: string) => set({ entries: state.entries.filter((x) => x.id !== id) }),
  clear: () => set({ entries: [] }),
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
