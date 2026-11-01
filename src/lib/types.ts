export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Śniadanie' },
  { key: 'lunch', label: 'Obiad' },
  { key: 'dinner', label: 'Kolacja' },
  { key: 'snack', label: 'Przekąska' },
];

export const mealTypeLabel = (t: MealType) => MEAL_TYPES.find((m) => m.key === t)?.label ?? t;

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Goals = Macros;

/** Składnik posiłku. Wartości odżywcze trzymamy na 100 g, więc zmiana gramatury przelicza wszystko automatycznie. */
export interface ItemDraft {
  key: string;
  name: string;
  grams: number;
  per100: Macros;
  aiEstimated: boolean;
}

export interface MealDraft {
  id?: number;
  day: string; // YYYY-MM-DD (czas lokalny)
  mealType: MealType;
  name: string;
  /** Nazwa pliku w trwałym katalogu aplikacji (documents/meal-photos). */
  photoFile: string | null;
  /** Tymczasowy URI zdjęcia jeszcze nie zapisanego (tylko dla nowych posiłków). */
  tempPhotoUri?: string | null;
  source: 'ai' | 'manual';
  aiConfidence: string | null;
  aiNotes: string | null;
  items: ItemDraft[];
}

export interface MealSummary {
  id: number;
  day: string;
  mealType: MealType;
  name: string;
  photoFile: string | null;
  source: 'ai' | 'manual';
  itemCount: number;
  totals: Macros;
}

export interface DaySummary {
  day: string;
  mealCount: number;
  totals: Macros;
}
