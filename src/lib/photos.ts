import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Zdjęcia posiłków kopiujemy do trwałego katalogu dokumentów aplikacji.
 * W bazie trzymamy WYŁĄCZNIE nazwę pliku, a pełny URI budujemy w locie – na iOS ścieżka
 * kontenera aplikacji może się zmienić (np. po aktualizacji), więc absolutny URI nie jest trwały.
 */
const PHOTO_DIR = 'meal-photos';

function photoDir(): Directory {
  return new Directory(Paths.document, PHOTO_DIR);
}

export async function persistPhoto(tempUri: string): Promise<string> {
  if (Platform.OS === 'web') throw new Error('Zapisywanie zdjęć działa tylko na telefonie (Expo Go).');
  const dir = photoDir();
  dir.create({ intermediates: true, idempotent: true });
  const name = `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const dest = new File(dir, name);
  await new File(tempUri).copy(dest);
  if (!dest.exists) throw new Error('Nie udało się skopiować zdjęcia do pamięci aplikacji.');
  return name;
}

export function photoUri(fileName: string | null | undefined): string | null {
  if (!fileName || Platform.OS === 'web') return null;
  const f = new File(photoDir(), fileName);
  return f.exists ? f.uri : null;
}

export function deletePhoto(fileName: string | null | undefined): void {
  if (!fileName || Platform.OS === 'web') return;
  try {
    const f = new File(photoDir(), fileName);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('Nie udało się usunąć zdjęcia', e);
  }
}

/**
 * Usuwa plik tymczasowy (np. zdjęcie z aparatu albo pomniejszoną kopię), ale tylko jeśli leży
 * w katalogu cache aplikacji – nigdy nie dotyka oryginałów z galerii.
 */
export function deleteTempFile(uri: string | null | undefined): void {
  if (!uri || Platform.OS === 'web') return;
  try {
    const cacheUri = Paths.cache.uri;
    if (!uri.startsWith(cacheUri)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('Nie udało się usunąć pliku tymczasowego', e);
  }
}
