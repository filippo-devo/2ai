import { getBackendUrl, type Db } from '../db/repo';

/**
 * Domyślny serwer analizy: Supabase Edge Function (supabase/functions/calai).
 * Adres nie jest tajny – klucz API jest wyłącznie po stronie serwera (sekret funkcji).
 */
export const CLOUD_API_URL = 'https://pwtbnuuurlwfjlwxvidg.supabase.co/functions/v1/calai';

/** Własny adres z Ustawień (np. lokalny backend), a gdy go nie ma – serwer w chmurze. */
export async function getEffectiveBackendUrl(db: Db): Promise<string> {
  return (await getBackendUrl(db))?.trim() || CLOUD_API_URL;
}
