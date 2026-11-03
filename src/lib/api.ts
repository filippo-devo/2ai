import type { Macros } from './types';

export const DEFAULT_PORT = 3001;

export interface AnalysisItem {
  name: string;
  grams: number;
  per100g: Macros;
  totals: Macros;
}

export interface AnalysisResult {
  estimated: true;
  mealName: string;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
  model: string;
  items: AnalysisItem[];
  totals: Macros;
}

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/**
 * Normalizuje adres backendu wpisany przez użytkownika:
 * - "192.168.1.20" -> "http://192.168.1.20:3001" (lokalny backend: http i domyślny port),
 * - "https://xyz.supabase.co/functions/v1/calai" -> bez zmian (pełny adres zostaje taki, jak podano).
 */
export function normalizeBackendUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  url = `http://${url}`;
  const hostPart = url.slice('http://'.length).split('/')[0];
  if (!/:\d+$/.test(hostPart)) url = url.replace(hostPart, `${hostPart}:${DEFAULT_PORT}`);
  return url;
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', 'Przekroczono czas oczekiwania na odpowiedź backendu.');
    }
    if (url.startsWith('https://')) {
      throw new ApiError('BACKEND_UNREACHABLE', 'Brak połączenia z serwerem analizy. Sprawdź, czy telefon ma internet, i spróbuj ponownie.');
    }
    throw new ApiError(
      'BACKEND_UNREACHABLE',
      `Nie można połączyć się z backendem (${url.replace(/\/[^/]*$/, '')}). Sprawdź, czy serwer działa na komputerze, czy adres IP jest poprawny i czy telefon jest w tej samej sieci Wi-Fi.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.code) return new ApiError(body.error.code, body.error.message ?? 'Błąd analizy.');
  } catch {
    // brak JSON – to prawdopodobnie nie nasz backend
  }
  return new ApiError('HTTP_' + res.status, `Backend zwrócił błąd HTTP ${res.status}. Czy adres wskazuje na backend CalAI?`);
}

export interface HealthInfo {
  ok: boolean;
  apiKeyConfigured: boolean;
  model: string;
}

export async function checkHealth(baseUrl: string): Promise<HealthInfo> {
  if (!baseUrl) throw new ApiError('BACKEND_NOT_CONFIGURED', 'Nie ustawiono adresu backendu.');
  const res = await request(`${baseUrl}/health`, { method: 'GET' }, 6000);
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as Partial<HealthInfo> & { service?: string };
  if (body.service !== 'calai-backend') {
    throw new ApiError('NOT_CALAI_BACKEND', 'Pod tym adresem działa inny serwer niż backend CalAI.');
  }
  return { ok: !!body.ok, apiKeyConfigured: !!body.apiKeyConfigured, model: String(body.model ?? '') };
}

export async function analyzePhoto(baseUrl: string, imageBase64: string, hint?: string): Promise<AnalysisResult> {
  if (!baseUrl) {
    throw new ApiError('BACKEND_NOT_CONFIGURED', 'Nie ustawiono adresu backendu. Wpisz go w Ustawieniach.');
  }
  const res = await request(
    `${baseUrl}/analyze`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, hint: hint?.trim() || undefined }),
    },
    150_000,
  );
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as AnalysisResult;
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    throw new ApiError('BAD_RESPONSE', 'Backend zwrócił niepełny wynik analizy.');
  }
  return data;
}
