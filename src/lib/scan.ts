import type { Db } from '../db/repo';
import { analyzeLabel, analyzePhoto, analyzeText, ApiError, lookupProduct, type AnalysisResult } from './api';
import { getEffectiveBackendUrl } from './backend';
import { newKey } from './draft';
import { prepareImage } from './image';
import { deleteTempFile } from './photos';
import { emptyItem, itemsFromResult, session, type QuickEntry } from './session';

const JPEG_PREFIX = 'data:image/jpeg;base64,';

function create(e: Omit<QuickEntry, 'id' | 'at' | 'servings'>): string {
  const id = newKey();
  session.add({ id, at: Date.now(), servings: 1, ...e });
  return id;
}

/**
 * Zdjęcie posiłku albo etykiety → wpis w sesji + analiza w tle. Zwraca id od razu,
 * żeby ekran wyniku mógł pokazać zdjęcie i animację, zanim przyjdzie odpowiedź.
 */
export function startPhotoScan(db: Db, uri: string, width?: number, height?: number, kind: 'photo' | 'label' = 'photo'): string {
  const id = create({ source: kind, image: uri, status: 'analyzing', name: '', items: [] });
  void (async () => {
    try {
      const prepared = await prepareImage(uri, width, height);
      // Zdjęcie zostaje tylko w pamięci (data URI); pliki tymczasowe usuwamy od razu.
      deleteTempFile(prepared.uri);
      deleteTempFile(uri);
      session.patch(id, { image: JPEG_PREFIX + prepared.base64 });
      await run(db, id);
    } catch (e) {
      fail(id, e);
    }
  })();
  return id;
}

export function startBarcodeScan(db: Db, code: string): string {
  const id = create({ source: 'barcode', image: null, code, status: 'analyzing', name: '', items: [] });
  void run(db, id);
  return id;
}

export function startTextScan(db: Db, text: string): string {
  const id = create({ source: 'text', image: null, text, status: 'analyzing', name: '', items: [] });
  void run(db, id);
  return id;
}

/** Wpis ręczny: od razu gotowy do edycji, bez analizy. */
export function startManualEntry(name = ''): string {
  return create({ source: 'manual', image: null, status: 'done', name, items: [emptyItem()] });
}

/** Ponowienie analizy (np. po błędzie). */
export function retryScan(db: Db, id: string) {
  session.patch(id, { status: 'analyzing', error: undefined });
  void run(db, id);
}

/** „Popraw wynik”: ponowna analiza z uwagą użytkownika (np. „brakuje sera i sosu”). */
export function fixScan(db: Db, id: string, correction: string) {
  const e = session.find(id);
  if (!e || !correction.trim()) return;
  const previous = e.items.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(', ');
  const corrections = [...(e.corrections ?? []), correction.trim()];
  session.patch(id, { corrections, previous, status: 'analyzing', error: undefined });
  void run(db, id);
}

/** Zamiana nieudanej analizy na ręczną edycję (zdjęcie zostaje). */
export function switchToManual(id: string) {
  const e = session.find(id);
  session.patch(id, { status: 'done', error: undefined, name: e?.name || e?.text || '', items: e?.items.length ? e.items : [emptyItem()] });
}

function buildHint(e: QuickEntry): string | undefined {
  if (!e.corrections?.length) return undefined;
  const lines = [];
  if (e.previous) lines.push(`Poprzedni wynik: ${e.previous}.`);
  lines.push(`Poprawki użytkownika (ważniejsze niż poprzedni wynik): ${e.corrections.join('; ')}.`);
  return lines.join('\n');
}

async function run(db: Db, id: string) {
  const e = session.find(id);
  if (!e) return;
  try {
    const url = await getEffectiveBackendUrl(db);
    const base64 = e.image?.startsWith(JPEG_PREFIX) ? e.image.slice(JPEG_PREFIX.length) : null;
    let result: AnalysisResult;
    if (e.source === 'barcode' && e.code) result = await lookupProduct(url, e.code);
    else if (e.source === 'label' && base64) result = await analyzeLabel(url, base64);
    else if (e.source === 'photo' && base64) result = await analyzePhoto(url, base64, buildHint(e));
    else if (e.source === 'text' && e.text) {
      const extra = e.corrections?.length ? `\nPoprawki: ${e.corrections.join('; ')}` : '';
      result = await analyzeText(url, e.text + extra);
    } else throw new ApiError('IMAGE_PREP', 'Nie udało się wczytać zdjęcia. Zrób je ponownie.');
    session.patch(id, {
      status: 'done',
      name: result.mealName,
      items: itemsFromResult(result),
      portions: result.portions ?? undefined,
    });
  } catch (err) {
    fail(id, err);
  }
}

function fail(id: string, e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e));
  session.patch(id, { status: 'error', error: { code: err.code, message: err.message } });
}
