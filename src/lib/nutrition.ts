import type { ItemDraft, Macros } from './types';

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Wartości dla podanej gramatury, wyliczone z wartości na 100 g. */
export function itemTotals(item: Pick<ItemDraft, 'grams' | 'per100'>): Macros {
  const f = (item.grams || 0) / 100;
  return {
    kcal: item.per100.kcal * f,
    protein: item.per100.protein * f,
    carbs: item.per100.carbs * f,
    fat: item.per100.fat * f,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
    { ...ZERO },
  );
}

export const mealTotals = (items: ItemDraft[]) => sumMacros(items.map(itemTotals));

/**
 * Użytkownik zmienił wartość dla porcji (np. kcal) – przeliczamy wartość na 100 g,
 * żeby późniejsza zmiana gramatury skalowała się poprawnie.
 */
export function per100FromPortion(portionValue: number, grams: number): number | null {
  if (!(grams > 0)) return null;
  return (portionValue / grams) * 100;
}

export function fmtNum(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '0';
  const p = 10 ** decimals;
  return String(Math.round(n * p) / p);
}

export const fmtKcal = (n: number) => fmtNum(n, 0);
export const fmtG = (n: number) => fmtNum(n, 1);

/** Parsuje liczbę wpisaną przez użytkownika (akceptuje przecinek). Zwraca null dla niepoprawnego tekstu. */
export function parseNum(text: string): number | null {
  const t = text.replace(',', '.').trim();
  if (t === '') return 0;
  if (!/^\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
