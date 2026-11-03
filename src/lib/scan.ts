import type { Db } from '../db/repo';
import { analyzePhoto, analyzeText, ApiError } from './api';
import { getEffectiveBackendUrl } from './backend';
import { newKey } from './draft';
import { prepareImage } from './image';
import { deleteTempFile } from './photos';
import { emptyItem, itemsFromResult, session } from './session';

const JPEG_PREFIX = 'data:image/jpeg;base64,';

/**
 * Zdjęcie → wpis w sesji + analiza w tle. Zwraca id wpisu od razu, żeby ekran wyniku
 * mógł pokazać zdjęcie i animację, zanim przyjdzie odpowiedź.
 */
export function startPhotoScan(db: Db, uri: string, width?: number, height?: number): string {
  const id = newKey();
  session.add({ id, at: Date.now(), source: 'photo', image: uri, status: 'analyzing', name: '', items: [] });
  void (async () => {
    try {
      const prepared = await prepareImage(uri, width, height);
      // Zdjęcie zostaje tylko w pamięci (data URI); pliki tymczasowe usuwamy od razu.
      deleteTempFile(prepared.uri);
      deleteTempFile(uri);
      session.patch(id, { image: JPEG_PREFIX + prepared.base64 });
      await runPhotoAnalysis(db, id, prepared.base64);
    } catch (e) {
      fail(id, e);
    }
  })();
  return id;
}

export function startTextScan(db: Db, text: string): string {
  const id = newKey();
  session.add({ id, at: Date.now(), source: 'text', image: null, text, status: 'analyzing', name: '', items: [] });
  void runTextAnalysis(db, id, text);
  return id;
}

/** Wpis ręczny: od razu gotowy do edycji, bez analizy. */
export function startManualEntry(name = ''): string {
  const id = newKey();
  session.add({ id, at: Date.now(), source: 'manual', image: null, status: 'done', name, items: [emptyItem()] });
  return id;
}

/** Ponowienie analizy po błędzie. */
export function retryScan(db: Db, id: string) {
  const e = session.find(id);
  if (!e) return;
  session.patch(id, { status: 'analyzing', error: undefined });
  if (e.source === 'text' && e.text) void runTextAnalysis(db, id, e.text);
  else if (e.image?.startsWith(JPEG_PREFIX)) void runPhotoAnalysis(db, id, e.image.slice(JPEG_PREFIX.length));
  else fail(id, new ApiError('IMAGE_PREP', 'Nie udało się wczytać zdjęcia. Zrób je ponownie.'));
}

/** Zamiana nieudanej analizy na ręczną edycję (zdjęcie zostaje). */
export function switchToManual(id: string) {
  const e = session.find(id);
  session.patch(id, { status: 'done', error: undefined, name: e?.name || e?.text || '', items: e?.items.length ? e.items : [emptyItem()] });
}

async function runPhotoAnalysis(db: Db, id: string, base64: string) {
  try {
    const result = await analyzePhoto(await getEffectiveBackendUrl(db), base64);
    session.patch(id, { status: 'done', name: result.mealName, items: itemsFromResult(result) });
  } catch (e) {
    fail(id, e);
  }
}

async function runTextAnalysis(db: Db, id: string, text: string) {
  try {
    const result = await analyzeText(await getEffectiveBackendUrl(db), text);
    session.patch(id, { status: 'done', name: result.mealName, items: itemsFromResult(result) });
  } catch (e) {
    fail(id, e);
  }
}

function fail(id: string, e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e));
  session.patch(id, { status: 'error', error: { code: err.code, message: err.message } });
}
