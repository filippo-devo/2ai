const pad = (n: number) => String(n).padStart(2, '0');

export function toDayString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayString = () => toDayString(new Date());

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12); // południe – bezpieczne przy zmianie czasu
}

export function addDays(day: string, delta: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return toDayString(d);
}

export const isValidDay = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDayString(parseDay(s)) === s;

const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

export function formatDay(day: string): string {
  const today = todayString();
  const d = parseDay(day);
  const full = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (day === today) return `Dzisiaj (${full})`;
  if (day === addDays(today, -1)) return `Wczoraj (${full})`;
  return full;
}

/** Domyślny typ posiłku zależnie od godziny. */
export function defaultMealType(now = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = now.getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 21) return 'dinner';
  return 'snack';
}
